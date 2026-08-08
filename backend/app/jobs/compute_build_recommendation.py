"""Item novo (rodada 21, backlog 4.1): build (itens) e runas com maior win
rate observado, por `(patch, tier, lane, campeão)`.

Não é o build mais popular — é o de maior win rate entre os que atingem
`settings.build_recommendation_min_games`. Quando nenhum atinge o piso,
cai pro mais popular mesmo assim e marca `amostra_insuficiente=True`
(nunca omite o dado, só avisa que a confiança é baixa — mesmo princípio
de `Baseline`/`ChampionScore`). Itens e runas são escolhidos de forma
independente um do outro.

Lê `match_participants.core_items` (mesmo campo de `compute_build.py`) e
`keystone_id`/`primary_style_id`/`sub_style_id` (novos, populados por
`app/jobs/backfill_participant_runes.py` pras partidas antigas e por
`ingest_matches.py` daqui pra frente). Nunca chama a Riot.

Uso: python -m app.jobs.compute_build_recommendation
"""

import asyncio
from collections import defaultdict

from app.adapters.data_dragon import DataDragonAdapter
from app.core.champions import resolve_champion_id
from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.db.models import ChampionBuildRecommendation, Match, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def _item_build_key(core_items: list[int]) -> tuple[int, ...]:
    return tuple(sorted(item for item in (core_items or []) if item))


def _rune_key(participant: MatchParticipant) -> tuple[int, int, int] | None:
    if participant.keystone_id is None:
        return None
    return (
        participant.keystone_id,
        participant.primary_style_id,
        participant.sub_style_id,
    )


def _best_combo(counts: dict, min_games: int) -> tuple[object, int, int, bool]:
    """Escolhe a combinação (build ou runa) de maior win rate entre as que
    atingem `min_games`; sem nenhuma qualificada, cai pra mais popular e
    marca amostra insuficiente. `counts` mapeia chave -> [games, wins]."""
    qualified = {k: v for k, v in counts.items() if v[0] >= min_games}
    pool = qualified if qualified else counts
    best_key = max(pool.items(), key=lambda kv: kv[1][1] / kv[1][0])[0]
    games, wins = pool[best_key]
    return best_key, games, wins, not qualified


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
            session.query(ChampionBuildRecommendation).filter_by(region=region).delete()

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

            for riot_champion_id, champ_participants in by_champion.items():
                item_counts: dict[tuple[int, ...], list[int]] = defaultdict(
                    lambda: [0, 0]
                )
                rune_counts: dict[tuple[int, int, int], list[int]] = defaultdict(
                    lambda: [0, 0]
                )

                for p in champ_participants:
                    item_key = _item_build_key(p.core_items)
                    item_counts[item_key][0] += 1
                    item_counts[item_key][1] += int(p.win)

                    rune_key = _rune_key(p)
                    if rune_key is not None:
                        rune_counts[rune_key][0] += 1
                        rune_counts[rune_key][1] += int(p.win)

                best_item_build, item_games, item_wins, item_insuf = _best_combo(
                    item_counts, settings.build_recommendation_min_games
                )

                if rune_counts:
                    best_rune, rune_games, rune_wins, rune_insuf = _best_combo(
                        rune_counts, settings.build_recommendation_min_games
                    )
                    keystone_id, primary_style_id, sub_style_id = best_rune
                    rune_win_rate = rune_wins / rune_games if rune_games else 0.0
                else:
                    # Nenhum participante do grupo tem runa gravada (ex:
                    # backfill ainda não rodou) — não trava o build de
                    # itens por isso, só marca a parte de runa como sem dado.
                    keystone_id = primary_style_id = sub_style_id = None
                    rune_games = 0
                    rune_win_rate = 0.0
                    rune_insuf = True

                champion_id = resolve_champion_id(
                    names, riot_champion_id, champ_participants[0].champion_name
                )

                session.add(
                    ChampionBuildRecommendation(
                        patch=version_label,
                        tier=tier,
                        lane=lane,
                        champion_id=champion_id,
                        region=region,
                        item_build=list(best_item_build),
                        item_build_games=item_games,
                        item_build_win_rate=item_wins / item_games
                        if item_games
                        else 0.0,
                        keystone_id=keystone_id,
                        primary_style_id=primary_style_id,
                        sub_style_id=sub_style_id,
                        rune_games=rune_games,
                        rune_win_rate=rune_win_rate,
                        amostra_insuficiente=item_insuf or rune_insuf,
                    )
                )
                created += 1

        session.commit()
        return created
    finally:
        session.close()


def main() -> None:
    created = compute()
    log.info(
        "job_concluido", job="compute_build_recommendation", linhas_criadas=created
    )


if __name__ == "__main__":
    main()
