from fastapi import HTTPException

from app.core.config import get_settings


def ensure_riot_proxy_enabled() -> None:
    """The Riot API key must never back a publicly-open product (Development
    Key ToS, doc seção 4). These proxy endpoints are for local debugging
    only — disabled whenever no real key is configured."""
    settings = get_settings()
    if settings.riot_api_key in ("changeme", ""):
        raise HTTPException(
            status_code=501,
            detail="Endpoints /riot/* desativados nesta instância (sem RIOT_API_KEY configurada). "
            "Use /stats/champions, que lê do banco próprio.",
        )
