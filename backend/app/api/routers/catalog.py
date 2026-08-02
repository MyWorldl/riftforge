from fastapi import APIRouter

from app.services import catalog_service

router = APIRouter()


@router.get("/champions")
async def list_champions() -> dict:
    return await catalog_service.get_champions()


@router.get("/items")
async def list_items() -> dict:
    """Item novo (rodada 21, "Recomendação de build") — proxy do catálogo
    de itens do Data Dragon, mesmo padrão de `/champions`."""
    return await catalog_service.get_items()


@router.get("/runes")
async def list_runes() -> dict:
    """Item novo (rodada 21) — proxy das árvores de runas do Data Dragon."""
    return await catalog_service.get_runes()
