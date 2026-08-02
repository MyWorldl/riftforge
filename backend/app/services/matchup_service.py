from sqlalchemy.orm import Session

from app.repositories.matchup_repository import MatchupRepository


def get_matchups(
    db: Session, champion_id: str, lane: str, elo_tier: str, patch: str | None
) -> dict:
    """Item 3.5 (Matchups) — "campeão A vs. todos os B" na mesma rota.
    Ordenado por win rate desc (melhores confrontos primeiro)."""
    repo = MatchupRepository(db)

    if patch is None:
        patch = repo.get_latest_patch(elo_tier, lane)
        if patch is None:
            return {"patch": None, "confrontos": []}

    rows = repo.list_for_champion(patch, elo_tier, lane, champion_id)
    confrontos = sorted(
        (
            {
                "opponent_champion_id": row.opponent_champion_id,
                "games": row.games,
                "wins": row.wins,
                "win_rate": row.wins / row.games if row.games else 0.0,
                "amostra_insuficiente": row.amostra_insuficiente,
            }
            for row in rows
        ),
        key=lambda c: c["win_rate"],
        reverse=True,
    )
    return {"patch": patch, "confrontos": confrontos}
