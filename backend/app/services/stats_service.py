from sqlalchemy.orm import Session

from app.repositories.lane_stat_repository import LaneStatRepository


def get_champion_stats(
    db: Session,
    tier: str,
    lane: str | None,
    patch: str | None,
    limit: int = 1000,
    offset: int = 0,
) -> list[dict]:
    """Placar de força lido do banco próprio — nunca consulta a Riot em tempo
    real por request do usuário. Os dados vêm dos jobs em
    app/jobs/ingest_matches.py (coleta) e app/jobs/aggregate_stats.py (cálculo).

    Revisão técnica §1.11 (Sprint A item 2): `limit`/`offset` com teto
    real, mesmo padrão de `score_service.list_scores`."""
    repo = LaneStatRepository(db)

    if patch is None:
        patch = repo.get_latest_patch(tier)
        if patch is None:
            return []

    segment_total = repo.get_segment_total(patch, tier)
    bans = repo.get_bans_by_champion(patch, tier)

    return [
        {
            "champion_id": row.champion_id,
            "lane": row.lane,
            "patch": row.patch,
            "tier": row.tier,
            "games": row.games,
            "win_rate": row.wins / row.games if row.games else 0,
            "pick_rate": row.games / segment_total if segment_total else 0,
            "ban_rate": bans.get(row.champion_id, 0) / segment_total if segment_total else 0,
            "kda": (row.kills + row.assists) / max(row.deaths, 1),
        }
        for row in repo.list_lane_stats(patch, tier, lane, limit, offset)
    ]
