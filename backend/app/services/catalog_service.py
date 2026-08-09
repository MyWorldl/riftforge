"""Proxies do Data Dragon (`/champions`, `/items`, `/runes`) — mantidos como
`dict` solto (não Pydantic) de propósito: o formato é inteiramente definido
pela Riot, fora do nosso controle, e replicar o schema completo do Data
Dragon aqui seria frágil (quebraria a cada campo novo que a Riot adicionar)
sem o benefício real que `response_model` traz pras rotas com formato
próprio (ver `app/schemas/`)."""

from app.core.adapters import data_dragon
from app.core.cache import cached


async def get_champions() -> dict:
    version = await cached("ddragon:version", data_dragon.get_latest_version)
    champions = await cached(f"ddragon:champions:{version}", lambda: data_dragon.get_champions(version))
    return {"patch": version, "champions": champions}


async def get_items() -> dict:
    version = await cached("ddragon:version", data_dragon.get_latest_version)
    items = await cached(f"ddragon:items:{version}", lambda: data_dragon.get_items(version))
    return {"patch": version, "items": items}


async def get_runes() -> dict:
    version = await cached("ddragon:version", data_dragon.get_latest_version)
    paths = await cached(f"ddragon:runes:{version}", lambda: data_dragon.get_rune_paths(version))
    return {"patch": version, "paths": paths}


async def get_champion_detail(champion_id: str) -> dict | None:
    """Item novo: página de detalhe por campeão precisa de passiva+habilidades
    (Q/W/E/R) pro cabeçalho estilo OP.GG — `get_champions` (resumo) não traz
    isso, só `get_champion_detail` (por campeão) tem.

    Revisão técnica §2.1/§1.6 (Sprint 2 itens 9/10): `champion_id` vem direto
    da URL, sem validação — antes ia parar sem escape no path do Data Dragon
    (`app/adapters/data_dragon.py`) e inflava o cache com uma entrada por ID
    inventado. Validar contra o catálogo real primeiro (já em cache, barato
    após o primeiro request) resolve os dois: `None` aqui vira 404 no
    router, e nenhum ID desconhecido chega a formar uma URL ou uma chave de
    cache nova."""
    catalog = await get_champions()
    if champion_id not in catalog["champions"]:
        return None
    version = catalog["patch"]
    detail = await cached(
        f"ddragon:champion_detail:{version}:{champion_id}",
        lambda: data_dragon.get_champion_detail(version, champion_id),
    )
    return {"patch": version, "champion": detail}
