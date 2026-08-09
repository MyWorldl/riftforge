from fastapi import APIRouter, HTTPException

from app.services import catalog_service

router = APIRouter()


@router.get("/champions")
async def list_champions() -> dict:
    return await catalog_service.get_champions()


@router.get("/champions/{champion_id}")
async def get_champion_detail(champion_id: str) -> dict:
    """Item novo: cabeçalho estilo OP.GG da página de detalhe (passiva +
    Q/W/E/R do campeão) — `list_champions` (resumo) não traz habilidades."""
    detail = await catalog_service.get_champion_detail(champion_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Campeão desconhecido.")
    return detail


@router.get("/items")
async def list_items() -> dict:
    """Item novo (rodada 21, "Recomendação de build") — proxy do catálogo
    de itens do Data Dragon, mesmo padrão de `/champions`."""
    return await catalog_service.get_items()


@router.get("/runes")
async def list_runes() -> dict:
    """Item novo (rodada 21) — proxy das árvores de runas do Data Dragon."""
    return await catalog_service.get_runes()
