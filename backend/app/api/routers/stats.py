from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.stats import ChampionStatRow
from app.services import stats_service

router = APIRouter(tags=["stats"])


@router.get("/stats/champions", response_model=list[ChampionStatRow])
def get_champion_stats(
    tier: str = "GOLD", lane: str | None = None, patch: str | None = None, db: Session = Depends(get_db)
) -> list[dict]:
    """Placar de força lido do banco próprio — nunca consulta a Riot em
    tempo real por request do usuário."""
    return stats_service.get_champion_stats(db, tier, lane, patch)
