"""Item novo (rodada 21, backlog 3.3): etiqueta de "Skill Expression"
(floor/ceiling).

**Heurística v1, não uma métrica oficial da Riot** — o documento Core não
define fórmula pra isso (item `EM ABERTO`, decisão de produto tomada
nesta rodada, mesmo espírito de "item atual" em `compute_build.py`). Usa
a variação do KDA por partida individual do campeão dentro do grupo
`(patch, tier, lane)`:

    ceiling_ratio = média do KDA dos 20% melhores jogos ÷ mediana
    floor_ratio   = média do KDA dos 20% piores jogos ÷ mediana

Os dois normalizados por percentil dentro do mesmo grupo
(`ceiling_percentil`/`floor_percentil`) pra virar rótulo Baixo/Médio/Alto.
São eixos independentes: um campeão pode ter ceiling e floor altos ao
mesmo tempo (consistente e ainda capaz de um pico) — não é
`floor = 100 - ceiling`.

Lê só `match_participants`/`matches`/`patches` já persistidos. Nunca
chama a Riot. Delete-and-recompute total a cada execução.

Uso: python -m app.jobs.compute_skill_expression
"""

import asyncio
import statistics
from collections import defaultdict

from app.adapters.data_dragon import DataDragonAdapter
from app.core.champions import resolve_champion_id
from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.core.stats import percentile_rank
from app.db.models import ChampionSkillExpression, Match, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def _label(percentil: float) -> str:
    if percentil < 33:
        return "Baixo"
    if percentil < 66:
        return "Médio"
    return "Alto"


def _kda(participant: MatchParticipant) -> float:
    return (participant.kills + participant.assists) / max(participant.deaths, 1)


def compute() -> int:
    new_correlation_id()
    init_db()
    settings = get_settings()
    data_dragon = DataDragonAdapter()

    # Item novo (filtro de região, piloto br1+euw1): mesmo padrão de
    # `collect_rankings.py` — delete escopado por região, `Match.
    # platform_region` entra na query e na chave de agrupamento.
    regioes = [
        r.strip() for r in settings.pipeline_platform_regions.split(",") if r.strip()
    ]

    session = SessionLocal()
    try:
        for region in regioes:
            session.query(ChampionSkillExpression).filter_by(region=region).delete()

        rows = (
            session.query(MatchParticipant, Patch.version_label, Match.platform_region)
            .join(Match, Match.match_id == MatchParticipant.match_id)
            .join(Patch, Patch.id == Match.patch_id)
            .filter(Match.platform_region.in_(regioes))
            .all()
        )

        by_group: dict[tuple[str, str, str, str], list[MatchParticipant]] = defaultdict(
            list
        )
        for participant, version_label, region in rows:
            lane = participant.resolved_position or "UNKNOWN"
            by_group[(version_label, participant.elo_tier, lane, region)].append(
                participant
            )

        all_versions = asyncio.run(data_dragon.get_versions())
        name_cache: dict[str, dict[int, str]] = {}

        def names_for(version_label: str) -> dict[int, str]:
            if version_label not in name_cache:
                version = next(
                    (v for v in all_versions if v.startswith(version_label)),
                    all_versions[0],
                )
                name_cache[version_label] = asyncio.run(
                    data_dragon.get_champion_name_by_riot_id(version)
                )
            return name_cache[version_label]

        created = 0
        for (version_label, tier, lane, region), participants in by_group.items():
            names = names_for(version_label)

            by_champion: dict[int, list[MatchParticipant]] = defaultdict(list)
            for p in participants:
                by_champion[p.riot_champion_id].append(p)

            # Primeira passada: estatística bruta por campeão do grupo.
            raw_by_champion: dict[int, dict] = {}
            for riot_champion_id, champ_participants in by_champion.items():
                kdas = sorted(_kda(p) for p in champ_participants)
                n = len(kdas)
                mediana = statistics.median(kdas)

                quintil = max(1, round(n * 0.2))
                piores = kdas[:quintil]
                melhores = kdas[-quintil:]

                ceiling_ratio = (
                    (sum(melhores) / len(melhores)) / mediana if mediana > 0 else 1.0
                )
                floor_ratio = (
                    (sum(piores) / len(piores)) / mediana if mediana > 0 else 1.0
                )

                raw_by_champion[riot_champion_id] = {
                    "n_games": n,
                    "mediana_kda": mediana,
                    "ceiling_ratio": ceiling_ratio,
                    "floor_ratio": floor_ratio,
                    "champion_name": champ_participants[0].champion_name,
                }

            # Segunda passada: percentil dentro do grupo (mesmo padrão de
            # `compute_build.py` pra nota_dep/nota_spike).
            ceiling_values = [s["ceiling_ratio"] for s in raw_by_champion.values()]
            floor_values = [s["floor_ratio"] for s in raw_by_champion.values()]

            for riot_champion_id, stats in raw_by_champion.items():
                ceiling_percentil = percentile_rank(
                    ceiling_values, stats["ceiling_ratio"]
                )
                floor_percentil = percentile_rank(floor_values, stats["floor_ratio"])
                champion_id = resolve_champion_id(
                    names, riot_champion_id, stats["champion_name"]
                )

                session.add(
                    ChampionSkillExpression(
                        patch=version_label,
                        tier=tier,
                        lane=lane,
                        champion_id=champion_id,
                        region=region,
                        n_games=stats["n_games"],
                        mediana_kda=stats["mediana_kda"],
                        ceiling_ratio=stats["ceiling_ratio"],
                        floor_ratio=stats["floor_ratio"],
                        ceiling_percentil=ceiling_percentil,
                        floor_percentil=floor_percentil,
                        ceiling_label=_label(ceiling_percentil),
                        floor_label=_label(floor_percentil),
                        amostra_insuficiente=stats["n_games"]
                        < settings.skill_expression_min_games,
                    )
                )
                created += 1

        session.commit()
        return created
    finally:
        session.close()


def main() -> None:
    created = compute()
    log.info("job_concluido", job="compute_skill_expression", linhas_criadas=created)


if __name__ == "__main__":
    main()
