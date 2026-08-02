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
