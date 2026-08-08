from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.meta import MetaCoverageResponse
from app.services import meta_service

router = APIRouter(tags=["meta"])


@router.get("/meta/coverage", response_model=MetaCoverageResponse)
def get_meta_coverage(elo_tier: str = "GOLD", patch: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Item novo (revisão técnica §6, "contexto por rota"): saúde do
    metagame por rota ("a Selva está mais fechada este patch") — nenhuma
    chamada Riot, só lê `champion_meta_context` já calculado."""
    return meta_service.get_coverage(db, elo_tier, patch)
