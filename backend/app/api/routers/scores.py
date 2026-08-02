from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.scores import ChampionHistoryPoint, ChampionScoreRow, ExplainResponse
from app.services import score_service

router = APIRouter(prefix="/scores", tags=["scores"])


@router.get("/champions", response_model=list[ChampionScoreRow])
def get_champion_scores(
    elo_tier: str = "GOLD", lane: str | None = None, patch: str | None = None, db: Session = Depends(get_db)
) -> list[dict]:
    """Placar com o modelo de score em camadas (Performance/Kit/Build/Meta),
    tier God-E, indicador de confiança e selo Trap — lê só de
    `champion_scores`, nunca consulta a Riot em tempo real.

    Item 4.3 (revisão técnica): a explicação por camada e o perfil de poder
    saíram daqui — ver `GET /scores/champions/{champion_id}/explain`."""
    return score_service.list_scores(db, elo_tier, lane, patch)


@router.get("/champions/{champion_id}/explain", response_model=ExplainResponse)
def get_champion_explanation(
    champion_id: str,
    lane: str,
    elo_tier: str = "GOLD",
    patch: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Item 3.1 (explicabilidade) — decomposição do score final em
    contribuições por camada + item 3.2 (perfil de poder estrutural/meta),
    buscado sob demanda em vez de embutido em toda linha de
    `/scores/champions` (item 4.3)."""
    result = score_service.get_explanation(db, champion_id, lane, elo_tier, patch)
    if result is None:
        raise HTTPException(status_code=404, detail="Sem score calculado pra esse campeão/rota/elo/patch.")
    return result


@router.get("/patches", response_model=list[str])
def get_available_patches(elo_tier: str = "GOLD", db: Session = Depends(get_db)) -> list[str]:
    """Patches com score calculado pro elo, do mais recente pro mais
    antigo — alimenta o filtro de patch da interface."""
    return score_service.list_available_patches(db, elo_tier)


@router.get("/history", response_model=list[ChampionHistoryPoint])
def get_champion_history(
    champion_id: str, elo_tier: str = "GOLD", lane: str | None = None, db: Session = Depends(get_db)
) -> list[dict]:
    """Item 3.4: evolução do score de um campeão entre patches."""
    return score_service.get_champion_history(db, champion_id, elo_tier, lane)
