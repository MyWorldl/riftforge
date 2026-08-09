from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.matchups import MatchupsResponse
from app.services import matchup_service

router = APIRouter(tags=["matchups"])


@router.get("/matchups", response_model=MatchupsResponse)
def get_matchups(
    champion_id: str,
    lane: str,
    elo_tier: str = "GOLD",
    patch: str | None = None,
    region: str = "br1",
    db: Session = Depends(get_db),
) -> dict:
    """ "Campeão A vs. todos os B" na mesma rota. Lê só de
    `champion_matchups`, nenhuma chamada Riot em tempo real."""
    return matchup_service.get_matchups(db, champion_id, lane, elo_tier, patch, region)
