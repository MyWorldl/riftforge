"""Oitavo e último estágio do pipeline (Core Fase 1, itens 1.5-1.7):
combina as quatro camadas no score final e atribui tier
(Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §8-11).

    SCORE = 0.40*Performance + 0.25*Kit + 0.25*Build + 0.10*Meta

Lê champion_performance_scores / champion_kit_scores / champion_build_scores
/ champion_meta_context (saída dos quatro estágios anteriores), nunca chama
a Riot nem o Data Dragon.

Join com Kit exige cuidado: `ChampionKitScore` é chaveado só por
(patch, champion_id) — Kit não varia por rota/elo. Quando não existe Kit
pro patch exato de uma linha (ex: Kit só foi calculado pra versão mais
recente do Data Dragon, mas a linha é de um patch histórico da coleta de
partidas), o peso de Kit (25%) é redistribuído proporcionalmente entre as
camadas disponíveis — nunca tratado como zero, mesmo princípio já usado em
Build e Baselines. `pesos_usados` registra o que entrou em cada linha, pra
auditoria.

Tier: faixas fixas de `02_MODELO_SCORE_TIERS.md` §9 (God 90-100 ... E 5-19,
qualquer coisa abaixo de 5 cai em E por não haver tier definido abaixo).

Confiança: `min(100, (n_partidas/n_referencia_confianca)*100)`. Trava de
segurança (§11): confiança abaixo do piso configurado -> tier provisório,
teto A (nenhum campeão vira God/S sem amostra que sustente a afirmação).

Selo "Trap" (item 1.7, paralelo ao score) — dois padrões independentes,
qualquer um dos dois marca o selo:
1. **Popular mas ruim**: `nota_presenca > 70 E z_wr < -0.5`. Usa
   `nota_presenca` diretamente como "percentil de Presença" — ela já é
   uma combinação de percentis (60% ban + 40% pick), então já vive numa
   escala 0-100 comparável a um percentil.
2. **Viés de amostra** (auditoria 16/08 §3.7): `win_rate_raw > 0.53 E
   win_rate_adjusted < 0.50` — win rate bruto parece forte, mas o piso
   de Wilson (que só cai tanto com amostra pequena) já nem bate 50%.

Uso: python -m app.jobs.compute_scores
"""

from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.db.models import (
    ChampionBuildScore,
    ChampionKitScore,
    ChampionMetaContext,
    ChampionPerformanceScore,
    ChampionScore,
)
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)

MODEL_VERSION = "score_v1"

LAYER_WEIGHTS = {"performance": 0.40, "kit": 0.25, "build": 0.25, "meta": 0.10}

TIER_THRESHOLDS = [
    ("GOD", 90),
    ("S", 78),
    ("A", 65),
    ("B", 50),
    ("C", 35),
    ("D", 20),
    ("E", 0),  # também cobre score < 5 — não há tier definido abaixo de E
]


def _assign_tier(score: float) -> str:
    for name, threshold in TIER_THRESHOLDS:
        if score >= threshold:
            return name
    return "E"


def _trap_flag(
    nota_presenca: float, z_wr: float, win_rate_raw: float, win_rate_adjusted: float
) -> bool:
    """Dois padrões independentes (item 1.7); qualquer um dos dois marca
    o selo — ver docstring do módulo pro raciocínio de cada um."""
    trap_presenca = nota_presenca > 70 and z_wr < -0.5
    trap_amostra = win_rate_raw > 0.53 and win_rate_adjusted < 0.50
    return trap_presenca or trap_amostra


def compute() -> dict:
    new_correlation_id()
    init_db()
    settings = get_settings()
    # Item novo (filtro de região, piloto br1+euw1): region chega de graça
    # (herdado das 3 camadas derivadas de partida) — só `ChampionKitScore`
    # fica de fora (Data-Dragon-only, sem região). Delete escopado por
    # região, mesmo padrão de `collect_rankings.py`.
    regioes = [
        r.strip() for r in settings.pipeline_platform_regions.split(",") if r.strip()
    ]

    session = SessionLocal()
    try:
        for region in regioes:
            session.query(ChampionScore).filter_by(region=region).delete()

        performance_rows = (
            session.query(ChampionPerformanceScore)
            .filter(ChampionPerformanceScore.region.in_(regioes))
            .all()
        )
        build_by_key = {
            (r.patch, r.tier, r.lane, r.champion_id, r.region): r
            for r in session.query(ChampionBuildScore)
            .filter(ChampionBuildScore.region.in_(regioes))
            .all()
        }
        meta_by_key = {
            (r.patch, r.tier, r.lane, r.champion_id, r.region): r
            for r in session.query(ChampionMetaContext)
            .filter(ChampionMetaContext.region.in_(regioes))
            .all()
        }
        kit_by_patch_champion = {
            (r.patch, r.champion_id): r for r in session.query(ChampionKitScore).all()
        }

        created = 0
        skipped_missing_layer = 0
        provisional = 0
        traps = 0

        for perf in performance_rows:
            key5 = (perf.patch, perf.tier, perf.lane, perf.champion_id, perf.region)
            build = build_by_key.get(key5)
            meta = meta_by_key.get(key5)

            if build is None or meta is None:
                # Não deveria acontecer no pipeline atual (Build e Meta usam
                # a mesma fonte que Performance), mas não quebra o job se
                # faltar — só pula essa linha, sem inventar dado.
                skipped_missing_layer += 1
                continue

            kit = kit_by_patch_champion.get((perf.patch, perf.champion_id))

            components = {
                "performance": perf.performance_score,
                "build": build.build_score,
                "meta": meta.meta_score,
            }
            if kit is not None:
                components["kit"] = kit.kit_score

            weight_sum = sum(LAYER_WEIGHTS[name] for name in components)
            score_final = (
                sum(score * LAYER_WEIGHTS[name] for name, score in components.items())
                / weight_sum
            )

            confianca = min(
                100.0, (perf.n_matches / settings.n_referencia_confianca) * 100
            )
            tier_provisorio = confianca < settings.confianca_minima_pct

            score_tier = _assign_tier(score_final)
            if tier_provisorio and score_tier in ("GOD", "S"):
                score_tier = "A"

            trap_flag = _trap_flag(
                perf.nota_presenca, perf.z_wr, perf.win_rate_raw, perf.win_rate_adjusted
            )

            session.add(
                ChampionScore(
                    patch=perf.patch,
                    elo_tier=perf.tier,
                    lane=perf.lane,
                    champion_id=perf.champion_id,
                    region=perf.region,
                    performance_score=perf.performance_score,
                    kit_score=kit.kit_score if kit else None,
                    build_score=build.build_score,
                    meta_score=meta.meta_score,
                    pesos_usados={name: LAYER_WEIGHTS[name] for name in components},
                    score_final=score_final,
                    score_tier=score_tier,
                    confianca=confianca,
                    tier_provisorio=tier_provisorio,
                    trap_flag=trap_flag,
                    model_version=MODEL_VERSION,
                )
            )
            created += 1
            if tier_provisorio:
                provisional += 1
            if trap_flag:
                traps += 1

        session.commit()
    finally:
        session.close()

    return {
        "linhas_criadas": created,
        "linhas_puladas": skipped_missing_layer,
        "tier_provisorio": provisional,
        "trap_flag": traps,
    }


def main() -> None:
    result = compute()
    log.info("job_concluido", job="compute_scores", **result)


if __name__ == "__main__":
    main()
