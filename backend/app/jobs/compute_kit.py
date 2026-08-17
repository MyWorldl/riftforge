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

Rodada 22 (backlog 5.1): CC e Mobilidade passam a ficar disponíveis pros
campeões tagueados manualmente em `data/kit_manual_tags.json`, seguindo a
rúbrica de `Core/Estrutura_roadmap/14_RUBRICA_KIT_CAMPEOES.md`. O arquivo
nasce com um lote piloto de ~10 campeões (item em aberto §10 do
documento) — o resto do elenco continua sem os dois eixos até ser
tagueado. Não é uma tabela no banco de propósito: o tagueamento é dado de
julgamento humano versionado em texto (git), não gerado por um job, então
fica mais fácil de revisar num diff do que numa linha de banco opaca.

Sprint 5 (16/08): pro resto do elenco (~160 campeões sem tag manual),
`app/adapters/meraki.py` busca CC/Mobilidade em `cdn.merakianalytics.com`
(curadoria comunitária, escala 0-3 por eixo, normalizada aqui pra 0-10) —
tag manual sempre tem precedência quando existe. Validado antes de
integrar (auditoria 16/08, achado real verificado direto contra a API):
correlação de Spearman ≈ 0,87 em CC e em Mobilidade contra os 10 campeões
já tagueados manualmente, e a curadoria de fato atrasa em relação ao patch
mais novo da Riot (campeão recém-lançado pode não estar no dataset ainda)
— por isso um 404 vira "sem dado" (mesmo fallback de sempre, eixo ausente,
peso redistribuído), nunca erro que derruba o job inteiro.

Uso: python -m app.jobs.compute_kit [--patch 16.14]
"""

import argparse
import asyncio
import json
from pathlib import Path

import httpx

from app.adapters.data_dragon import DataDragonAdapter
from app.adapters.meraki import MerakiAdapter
from app.core.logging import get_logger, new_correlation_id
from app.core.stats import percentile_rank
from app.db.models import ChampionKitScore
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)

MODEL_VERSION = "automatica_v1"
MODEL_VERSION_COM_MANUAL = "automatica_v1+manual_v1"
# Sprint 5 (16/08): fallback pro resto do elenco sem tag manual — ver
# docstring do módulo pra validação (Spearman ≈ 0,87 em CC/Mobilidade).
MODEL_VERSION_COM_MERAKI = "automatica_v1+meraki_v1"
AXIS_WEIGHTS = {
    "dano": 0.25,
    "mobilidade": 0.20,
    "alcance": 0.15,
    "resiliencia": 0.10,
    "cc": 0.30,
}
CONCURRENCY = 10
MANUAL_TAGS_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "kit_manual_tags.json"
)
# Meraki usa escala 0-3 por eixo (control/mobility); o projeto usa 0-10 em
# todo o resto do modelo de Kit — normaliza aqui, um lugar só.
_MERAKI_SCALE_TO_10 = 10 / 3


def _load_manual_tags() -> dict[str, dict]:
    if not MANUAL_TAGS_PATH.exists():
        return {}
    with MANUAL_TAGS_PATH.open(encoding="utf-8") as f:
        tags = json.load(f)
    return {tag["champion_id"]: tag for tag in tags}


async def _resolve_version(
    data_dragon: DataDragonAdapter, patch_prefix: str | None
) -> str:
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
            return champion_id, await data_dragon.get_champion_detail(
                version, champion_id
            )

    results = await asyncio.gather(*(fetch_one(cid) for cid in champion_ids))
    return dict(results)


async def _fetch_meraki_ratings(
    meraki: MerakiAdapter, champion_ids: list[str]
) -> dict[str, dict | None]:
    """Só busca pros campeões sem tag manual (`champion_ids` já filtrado
    pelo chamador) — tag manual sempre vence, nunca faz sentido gastar a
    chamada. `None` no valor (não a ausência da chave) marca "sem dado pra
    esse campeão" — tanto pra 404 real (fora do dataset) quanto pra falha
    de rede/5xx persistente depois das tentativas do adapter (achado ao
    rodar contra produção: um 502 transitório na Meraki, único no meio de
    ~160 chamadas concorrentes, derrubava o job inteiro via
    `asyncio.gather` sem isolamento — mesma classe de bug que
    `_fetch_matches_tolerant` corrigiu em `player_service.py`, Sprint 0.
    Meraki é dado de conforto, não essencial como o Data Dragon: uma
    falha aqui nunca pode custar as outras Camadas do Kit desse patch."""
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def fetch_one(champion_id: str) -> tuple[str, dict | None]:
        async with semaphore:
            try:
                return champion_id, await meraki.get_champion_attribute_ratings(
                    champion_id
                )
            except httpx.HTTPError as exc:
                log.warning(
                    "meraki_ratings_indisponivel",
                    champion_id=champion_id,
                    erro=str(exc),
                )
                return champion_id, None

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
    new_correlation_id()
    init_db()
    data_dragon = DataDragonAdapter()

    version = asyncio.run(_resolve_version(data_dragon, patch_prefix))
    version_label = ".".join(version.split(".")[:2])

    champions = asyncio.run(data_dragon.get_champions(version))
    champion_ids = list(champions.keys())

    log.info(
        "buscando_detalhe_campeoes",
        total=len(champion_ids),
        data_dragon_version=version,
    )
    details_by_id = asyncio.run(_fetch_all_details(data_dragon, version, champion_ids))

    info_by_id: dict[str, dict] = {}
    raw_reach: dict[str, float] = {}

    for champion_id, detail in details_by_id.items():
        info_by_id[champion_id] = detail.get("info", {})

        base_range = detail.get("stats", {}).get("attackrange", 0)
        avg_spell_range = _average_spell_range(detail.get("spells", []))
        raw_reach[champion_id] = base_range + (avg_spell_range or 0)

    reach_values = list(raw_reach.values())
    manual_tags = _load_manual_tags()

    # Sprint 5 (16/08): só busca Meraki pros campeões SEM tag manual — tag
    # manual sempre vence, nunca vale a chamada extra pra quem já tem.
    meraki_champion_ids = [cid for cid in champion_ids if cid not in manual_tags]
    log.info("buscando_meraki_ratings", total=len(meraki_champion_ids))
    meraki_ratings_by_id = asyncio.run(
        _fetch_meraki_ratings(MerakiAdapter(), meraki_champion_ids)
    )

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
            attack, defense, magic = (
                info.get("attack", 0),
                info.get("defense", 0),
                info.get("magic", 0),
            )
            if attack or defense or magic:
                available["dano"] = float(max(attack, magic))
                available["resiliencia"] = float(defense)

            tag = manual_tags.get(champion_id)
            meraki_ratings = meraki_ratings_by_id.get(champion_id)
            if tag:
                available["cc"] = float(tag["cc_score"])
                available["mobilidade"] = float(tag["mobilidade_score"])
                versao_calculo = MODEL_VERSION_COM_MANUAL
            elif meraki_ratings:
                available["cc"] = meraki_ratings["control"] * _MERAKI_SCALE_TO_10
                available["mobilidade"] = (
                    meraki_ratings["mobility"] * _MERAKI_SCALE_TO_10
                )
                versao_calculo = MODEL_VERSION_COM_MERAKI
            else:
                versao_calculo = MODEL_VERSION

            weight_sum = sum(AXIS_WEIGHTS[axis] for axis in available)
            kit_score = (
                sum(AXIS_WEIGHTS[axis] * score for axis, score in available.items())
                / weight_sum
                * 10
            )

            session.add(
                ChampionKitScore(
                    patch=version_label,
                    champion_id=champion_id,
                    cc_score=available.get("cc"),
                    dano_score=available.get("dano"),
                    mobilidade_score=available.get("mobilidade"),
                    alcance_score=available["alcance"],
                    resiliencia_score=available.get("resiliencia"),
                    kit_score=kit_score,
                    versao_calculo=versao_calculo,
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
    parser.add_argument(
        "--patch",
        default=None,
        help="Prefixo de patch (ex: 16.14). Padrão: mais recente.",
    )
    args = parser.parse_args()

    result = compute(patch_prefix=args.patch)
    log.info("job_concluido", job="compute_kit", **result)


if __name__ == "__main__":
    main()
