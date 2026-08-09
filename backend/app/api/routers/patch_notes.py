from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.query_types import EloTier
from app.schemas.patch_notes import PatchChangesResponse, PatchNotesResponse
from app.services import patch_notes_service

router = APIRouter(tags=["patch-notes"])


@router.get("/patch-notes", response_model=PatchNotesResponse)
def get_patch_notes(
    elo_tier: EloTier = "GOLD",
    top_n: int = 10,
    region: str = "br1",
    db: Session = Depends(get_db),
) -> dict:
    """ "Patch Notes" — não reproduz as notas oficiais da Riot (direitos
    autorais); deriva do próprio modelo de score. Nenhuma chamada Riot."""
    return patch_notes_service.get_patch_notes(db, elo_tier, top_n, region)


@router.get("/patch-notes/changes", response_model=PatchChangesResponse)
def get_patch_changes(patch: str | None = None, db: Session = Depends(get_db)) -> dict:
    """Complementa `/patch-notes`: mudança numérica bruta que a Riot de fato
    publicou no Data Dragon pro patch. Nenhuma chamada Riot/Data Dragon."""
    return patch_notes_service.get_patch_changes(db, patch)
