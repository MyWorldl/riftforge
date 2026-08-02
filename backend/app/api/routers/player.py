from fastapi import APIRouter, Depends, HTTPException, Request
from riotwatcher import ApiError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.riot_gate import ensure_riot_proxy_enabled
from app.schemas.player import PlayerLookupResponse
from app.services import player_service

router = APIRouter(prefix="/player", tags=["player"])
settings = get_settings()


@router.get("/lookup", response_model=PlayerLookupResponse)
@limiter.limit(settings.rate_limit_player_lookup)
async def get_player_lookup(
    request: Request,
    game_name: str,
    tag_line: str,
    region: str | None = None,
    elo_tier: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """"Análise do Jogador" — busca sob demanda de um jogador por Riot ID
    (`Nome#Tag`). Diferente do resto do backend, ESTA rota faz chamadas
    reais à Riot API por requisição (Account-V1 → Match-V5), por isso
    reaproveita o mesmo gate de `ensure_riot_proxy_enabled()` dos endpoints
    `/riot/*` — não pode ir ao ar em produção até a Production Key ser
    aprovada.

    `elo_tier` omitido (revisão técnica §5.3): detecta o elo real do
    jogador via League-V4 em vez de assumir GOLD fixo — ver
    `player_service._detect_elo_tier`."""
    ensure_riot_proxy_enabled()
    try:
        return await player_service.lookup_player(db, game_name, tag_line, region, elo_tier)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
