from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.rankings import RankingRow
from app.services import ranking_service

router = APIRouter(tags=["rankings"])


@router.get("/rankings", response_model=list[RankingRow])
def get_rankings(
    queue: str = "RANKED_SOLO_5x5",
    tier: str | None = None,
    region: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    """"Rankings" — lê só de `player_rankings`, nunca consulta a Riot em
    tempo real. `region` omitido usa a região padrão do backend."""
    return ranking_service.get_rankings(db, queue, tier, region)
