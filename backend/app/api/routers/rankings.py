from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.query_types import ApexTier, Queue
from app.core.config import Settings, get_settings
from app.schemas.rankings import PlayerSearchRow, RankingRow
from app.services import ranking_service

router = APIRouter(tags=["rankings"])


@router.get("/rankings", response_model=list[RankingRow])
def get_rankings(
    queue: Queue = "RANKED_SOLO_5x5",
    tier: ApexTier | None = None,
    region: str | None = None,
    limit: int = Query(default=1000, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """ "Rankings" — lê só de `player_rankings`, nunca consulta a Riot em
    tempo real. `region` omitido usa a região padrão do backend.

    Revisão técnica §1.11 (Sprint A item 2): `limit`/`offset` opcionais,
    default cobre o volume real de hoje (até 240 jogadores) sem quebrar
    nenhum consumo atual."""
    return ranking_service.get_rankings(
        db, queue, tier, region, settings, limit, offset
    )


@router.get("/rankings/search", response_model=list[PlayerSearchRow])
def search_rankings(
    q: str = Query(..., min_length=1, max_length=32),
    queue: Queue = "RANKED_SOLO_5x5",
    region: str | None = None,
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Ajuste 21/08: busca "conforme digita" pra `PlayerSearchInput`
    (Home/Invocador/Análise do Jogador). Só indexa `player_rankings` —
    ver docstring de `ranking_service.search_players` pro porquê do
    universo de busca ser pequeno hoje (~120 jogadores, só ligas apex já
    coletadas)."""
    return ranking_service.search_players(db, queue, q, region, settings, limit)
