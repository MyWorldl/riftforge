"""Ramo independente do pipeline (Core Fase 1, item 1.2): Camada 2 do
score — Poder Intrínseco do Kit, versão automática
(Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §5).

    Kit = (0.30*CC + 0.25*Dano + 0.20*Mob + 0.15*Alcance + 0.10*Resil) * 10

Não depende de partidas — só do Data Dragon (item 0.4, já pronto). Roda
independente dos estágios baseados em partida (ingest/aggregate/baselines/
performance).

Achado ao implementar, confirmando o risco descrito em
Core/Estrutura_roadmap/13_ESTRATEGIA_DADOS_KIT.md: `spells[].vars`, onde
deveriam estar os coeficientes de escala AP/AD de cada habilidade, vem
**vazio** para todos os campeões testados na versão atual do Data Dragon.
Sem esse dado não dá pra medir CC nem Mobilidade numericamente — os dois
exigem entender o que cada habilidade *faz* (é um atordoamento? é um
dash?), não só números soltos, e o Data Dragon não expõe isso de forma
estruturada. `cc_score` e `mobilidade_score` ficam `None` nesta versão —
não são estimados com um valor arbitrário, ficam ausentes mesmo,
registrados em `eixos_disponiveis`.

`dano_score` e `resiliencia_score` usam `info.attack`/`info.defense` — a
classificação oficial 0-10 que a própria Riot já publica por campeão no
Data Dragon. É um sinal real, numérico e estruturado, só mais grosseiro
que a rubrica original (que pedia ratios de dano específicos) pedia.
`alcance_score` é calculado por percentil dentro do roster do patch, a
partir do alcance de ataque base + alcance médio das habilidades (esses
dois campos continuam populados corretamente).

`kit_score` redistribui o peso proporcionalmente entre os eixos
disponíveis (dano 25% + alcance 15% + resiliência 10% = 50% do peso
original, renormalizado para somar 100%) — nunca trata o eixo ausente
como zero, mesmo princípio já usado na média móvel de Build
(Core/Estrutura_roadmap/16_BASELINES_CALIBRACAO.md §7.1).

Uso: python -m app.jobs.compute_kit [--patch 16.14]
"""

import argparse
import asyncio

from app.adapters.data_dragon import DataDragonAdapter
from app.core.stats import percentile_rank
from app.db.models import ChampionKitScore
from app.db.session import SessionLocal, init_db

MODEL_VERSION = "automatica_v1"
AXIS_WEIGHTS = {"dano": 0.25, "mobilidade": 0.20, "alcance": 0.15, "resiliencia": 0.10, "cc": 0.30}
CONCURRENCY = 10


async def _resolve_version(data_dragon: DataDragonAdapter, patch_prefix: str | None) -> str:
    versions = await data_dragon.get_versions()
    if patch_prefix:
        return next((v for v in versions if v.startswith(patch_prefix)), versions[0])
    return versions[0]


async def _fetch_all_details(
    data_dragon: DataDragonAdapter, version: str, champion_ids: list[str]
) -> dict[str, dict]:
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def fetch_one(champion_id: str) -> tuple[str, dict]:
        async with semaphore:
            return champion_id, await data_dragon.get_champion_detail(version, champion_id)

    results = await asyncio.gather(*(fetch_one(cid) for cid in champion_ids))
    return dict(results)


def _average_spell_range(spells: list[dict]) -> float | None:
    """Ignora alcances <=1 (habilidades de auto-alvo, ex: buffs em si
    mesmo) — não representam "alcance" no sentido de ameaça/poke."""
    ranges = []
    for spell in spells:
        spell_range = spell.get("range")
        if isinstance(spell_range, list):
            spell_range = spell_range[0] if spell_range else None
        if spell_range and spell_range > 1:
            ranges.append(spell_range)
    return sum(ranges) / len(ranges) if ranges else None


def compute(patch_prefix: str | None = None) -> dict:
    init_db()
    data_dragon = DataDragonAdapter()

    version = asyncio.run(_resolve_version(data_dragon, patch_prefix))
    version_label = ".".join(version.split(".")[:2])

    champions = asyncio.run(data_dragon.get_champions(version))
    champion_ids = list(champions.keys())

    print(f"Buscando detalhe de {len(champion_ids)} campeões (Data Dragon {version})...", flush=True)
    details_by_id = asyncio.run(_fetch_all_details(data_dragon, version, champion_ids))

    info_by_id: dict[str, dict] = {}
    raw_reach: dict[str, float] = {}

    for champion_id, detail in details_by_id.items():
        info_by_id[champion_id] = detail.get("info", {})

        base_range = detail.get("stats", {}).get("attackrange", 0)
        avg_spell_range = _average_spell_range(detail.get("spells", []))
        raw_reach[champion_id] = base_range + (avg_spell_range or 0)

    reach_values = list(raw_reach.values())

    session = SessionLocal()
    try:
        session.query(ChampionKitScore).filter_by(patch=version_label).delete()

        created = 0
        for champion_id in champion_ids:
            alcance_score = percentile_rank(reach_values, raw_reach[champion_id]) / 10
            available = {"alcance": alcance_score}

            # `info` vem inteiramente zerado (attack=defense=magic=0) para
            # alguns campeões — um buraco de dado do Data Dragon, não uma
            # nota real (nenhum campeão tem literalmente zero em tudo). Sem
            # essa checagem, esses campeões receberiam nota mínima falsa em
            # vez de "sem dado".
            info = info_by_id[champion_id]
            attack, defense, magic = info.get("attack", 0), info.get("defense", 0), info.get("magic", 0)
            if attack or defense or magic:
                available["dano"] = float(max(attack, magic))
                available["resiliencia"] = float(defense)

            weight_sum = sum(AXIS_WEIGHTS[axis] for axis in available)
            kit_score = sum(AXIS_WEIGHTS[axis] * score for axis, score in available.items()) / weight_sum * 10

            session.add(
                ChampionKitScore(
                    patch=version_label,
                    champion_id=champion_id,
                    cc_score=None,
                    dano_score=available.get("dano"),
                    mobilidade_score=None,
                    alcance_score=available["alcance"],
                    resiliencia_score=available.get("resiliencia"),
                    kit_score=kit_score,
                    versao_calculo=MODEL_VERSION,
                    eixos_disponiveis=list(available.keys()),
                )
            )
            created += 1

        session.commit()
    finally:
        session.close()

    return {"patch": version_label, "campeoes": created}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Calcula a Camada 2 (Kit, versão automática) a partir do Data Dragon."
    )
    parser.add_argument("--patch", default=None, help="Prefixo de patch (ex: 16.14). Padrão: mais recente.")
    args = parser.parse_args()

    result = compute(patch_prefix=args.patch)
    print(f"Camada 2 (Kit) calculada: {result['campeoes']} campeões, patch {result['patch']}.")


if __name__ == "__main__":
    main()
