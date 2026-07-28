"""Fase 3 do roadmap: job que popula o banco próprio a partir da Riot API.

O app (endpoints em main.py) lê só do banco — nunca reconsulta a Riot a
cada acesso de usuário. Rode manualmente durante o desenvolvimento; em
produção, agende via cron/Task Scheduler.

Uso: python -m app.jobs.collect_stats --tier GOLD --division I
"""

import argparse
import asyncio

from sqlalchemy.orm import Session

from app.adapters.data_dragon import DataDragonAdapter
from app.adapters.riot_api import RiotApiAdapter
from app.db.models import ChampionBanStat, ChampionLaneStat, SegmentTotal
from app.db.session import SessionLocal, init_db

QUEUE_IDS = {"RANKED_SOLO_5x5": 420, "RANKED_FLEX_SR": 440}


def _resolve_champion_name_by_key(patch_prefix: str) -> dict[str, str]:
    """Maps Data Dragon's numeric championId (as string) to champion name, for
    resolving ban entries — Match-V5 bans only carry the numeric id."""
    data_dragon = DataDragonAdapter()
    versions = asyncio.run(data_dragon.get_versions())
    version = next((v for v in versions if v.startswith(patch_prefix)), versions[0])
    champions = asyncio.run(data_dragon.get_champions(version))
    return {info["key"]: name for name, info in champions.items()}


def _bump_lane_stat(
    session: Session, patch: str, tier: str, lane: str, champion: str,
    win: bool, kills: int, deaths: int, assists: int,
) -> None:
    row = (
        session.query(ChampionLaneStat)
        .filter_by(patch=patch, tier=tier, lane=lane, champion_id=champion)
        .one_or_none()
    )
    if row is None:
        row = ChampionLaneStat(
            patch=patch, tier=tier, lane=lane, champion_id=champion,
            games=0, wins=0, kills=0, deaths=0, assists=0,
        )
        session.add(row)
    row.games += 1
    row.wins += int(win)
    row.kills += kills
    row.deaths += deaths
    row.assists += assists


def _bump_ban_stat(session: Session, patch: str, tier: str, champion: str) -> None:
    row = (
        session.query(ChampionBanStat)
        .filter_by(patch=patch, tier=tier, champion_id=champion)
        .one_or_none()
    )
    if row is None:
        row = ChampionBanStat(patch=patch, tier=tier, champion_id=champion, bans=0)
        session.add(row)
    row.bans += 1


def _bump_segment_total(session: Session, patch: str, tier: str, delta: int) -> None:
    row = session.query(SegmentTotal).filter_by(patch=patch, tier=tier).one_or_none()
    if row is None:
        row = SegmentTotal(patch=patch, tier=tier, total_matches=0)
        session.add(row)
    row.total_matches += delta


def collect(
    queue: str = "RANKED_SOLO_5x5",
    tier: str = "GOLD",
    division: str = "I",
    puuid_limit: int = 5,
    matches_per_summoner: int = 3,
) -> dict:
    init_db()
    riot = RiotApiAdapter()
    queue_id = QUEUE_IDS[queue]

    entries = riot.get_league_entries(queue, tier, division)
    puuids = [entry["puuid"] for entry in entries[:puuid_limit]]

    processed_match_ids: set[str] = set()
    champion_name_by_key: dict[str, str] | None = None

    session = SessionLocal()
    try:
        for puuid in puuids:
            match_ids = riot.get_match_ids_by_puuid(
                puuid, count=matches_per_summoner, queue=queue_id
            )
            for match_id in match_ids:
                if match_id in processed_match_ids:
                    continue
                processed_match_ids.add(match_id)

                match = riot.get_match(match_id)
                info = match["info"]
                patch = ".".join(info["gameVersion"].split(".")[:2])

                if champion_name_by_key is None:
                    champion_name_by_key = _resolve_champion_name_by_key(patch)

                for participant in info["participants"]:
                    lane = participant.get("teamPosition") or "UNKNOWN"
                    _bump_lane_stat(
                        session,
                        patch=patch,
                        tier=tier,
                        lane=lane,
                        champion=participant["championName"],
                        win=participant["win"],
                        kills=participant["kills"],
                        deaths=participant["deaths"],
                        assists=participant["assists"],
                    )

                for team in info["teams"]:
                    for ban in team.get("bans", []):
                        champion_key = str(ban.get("championId", -1))
                        if champion_key == "-1":
                            continue
                        champion_name = champion_name_by_key.get(champion_key)
                        if champion_name:
                            _bump_ban_stat(session, patch=patch, tier=tier, champion=champion_name)

                _bump_segment_total(session, patch=patch, tier=tier, delta=1)

        session.commit()
    finally:
        session.close()

    return {"summoners": len(puuids), "matches_processed": len(processed_match_ids)}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Coleta partidas da Riot API e agrega no banco próprio do RiftForge."
    )
    parser.add_argument("--queue", default="RANKED_SOLO_5x5", choices=list(QUEUE_IDS))
    parser.add_argument("--tier", default="GOLD")
    parser.add_argument("--division", default="I")
    parser.add_argument("--puuid-limit", type=int, default=5)
    parser.add_argument("--matches-per-summoner", type=int, default=3)
    args = parser.parse_args()

    result = collect(
        queue=args.queue,
        tier=args.tier,
        division=args.division,
        puuid_limit=args.puuid_limit,
        matches_per_summoner=args.matches_per_summoner,
    )
    print(f"Processado: {result['summoners']} invocadores, {result['matches_processed']} partidas únicas.")


if __name__ == "__main__":
    main()
