from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.builds import BuildRecommendationResponse
from app.services import build_service

router = APIRouter(tags=["builds"])


@router.get("/builds/recommended", response_model=BuildRecommendationResponse | None)
def get_recommended_build(
    champion_id: str,
    lane: str,
    elo_tier: str = "GOLD",
    patch: str | None = None,
    region: str = "br1",
    db: Session = Depends(get_db),
) -> dict | None:
    """Build de itens e combinação de runas com maior win rate observado,
    por `(patch, tier, lane, campeão)`. Lê só de
    `champion_build_recommendations`, nenhuma chamada Riot."""
    return build_service.get_recommended_build(
        db, champion_id, lane, elo_tier, patch, region
    )
