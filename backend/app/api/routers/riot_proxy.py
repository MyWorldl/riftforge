from fastapi import APIRouter, HTTPException, Request
from riotwatcher import ApiError

from app.core.adapters import riot_api
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.riot_gate import ensure_riot_proxy_enabled

router = APIRouter(prefix="/riot", tags=["riot"])
settings = get_settings()


@router.get("/league-entries")
@limiter.limit(settings.rate_limit_riot_proxy)
def get_league_entries(
    request: Request,
    queue: str = "RANKED_SOLO_5x5",
    tier: str = "GOLD",
    division: str = "I",
) -> list[dict]:
    ensure_riot_proxy_enabled()
    try:
        return riot_api.get_league_entries(queue, tier, division)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc


@router.get("/matches/{match_id}")
@limiter.limit(settings.rate_limit_riot_proxy)
def get_match(request: Request, match_id: str) -> dict:
    ensure_riot_proxy_enabled()
    try:
        return riot_api.get_match(match_id)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
