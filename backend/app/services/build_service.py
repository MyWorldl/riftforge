from sqlalchemy.orm import Session

from app.repositories.build_recommendation_repository import (
    BuildRecommendationRepository,
)


def get_recommended_build(
    db: Session,
    champion_id: str,
    lane: str,
    elo_tier: str,
    patch: str | None,
    region: str,
) -> dict | None:
    """Item 4.1 (backlog) — build de itens e combinação de runas com maior
    win rate observado, por `(patch, tier, lane, campeão)`."""
    repo = BuildRecommendationRepository(db)

    if patch is None:
        patch = repo.get_latest_patch(elo_tier, lane, champion_id, region)
        if patch is None:
            return None

    row = repo.get_one(patch, elo_tier, lane, champion_id, region)
    if row is None:
        return None

    return {
        "patch": row.patch,
        "item_build": row.item_build,
        "item_build_games": row.item_build_games,
        "item_build_win_rate": row.item_build_win_rate,
        "keystone_id": row.keystone_id,
        "primary_style_id": row.primary_style_id,
        "sub_style_id": row.sub_style_id,
        "rune_games": row.rune_games,
        "rune_win_rate": row.rune_win_rate,
        "amostra_insuficiente": row.amostra_insuficiente,
    }
