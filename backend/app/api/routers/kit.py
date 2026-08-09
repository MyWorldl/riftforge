from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.kit import KitProfileResponse
from app.services import kit_service

router = APIRouter(tags=["kit"])


@router.get("/scores/kit-profile", response_model=KitProfileResponse)
def get_kit_profile(
    patch: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Recomendação de campeão v1 (revisão técnica §6, Tier 2): eixos
    0-10 de Dano/Alcance/Resiliência por campeão, pra casar com uma
    preferência de estilo de jogo declarada. Nenhuma chamada Riot, só lê
    `champion_kit_scores` já calculado."""
    return kit_service.get_kit_profile(db, patch)
