from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.query_types import EloTier, Lane
from app.schemas.stats import ChampionStatRow
from app.services import stats_service

router = APIRouter(tags=["stats"])


@router.get("/stats/champions", response_model=list[ChampionStatRow])
def get_champion_stats(
    tier: EloTier = "GOLD",
    lane: Lane | None = None,
    patch: str | None = None,
    limit: int = Query(default=1000, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Placar de força lido do banco próprio — nunca consulta a Riot em
    tempo real por request do usuário.

    Revisão técnica §1.11 (Sprint A item 2): `limit`/`offset` opcionais."""
    return stats_service.get_champion_stats(db, tier, lane, patch, limit, offset)
