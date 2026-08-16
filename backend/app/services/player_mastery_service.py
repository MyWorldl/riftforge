import asyncio

from app.adapters.riot_api import PLATFORM_TO_CONTINENT
from app.core.adapters import data_dragon, riot_api
from app.core.cache import cached
from app.core.champions import resolve_champion_id
from app.core.config import Settings, get_settings
from app.services.player_roadmap_service import normalize_region


async def get_top_mastery(
    game_name: str,
    tag_line: str,
    region: str | None,
    settings: Settings | None = None,
) -> list[dict]:
    """Aba Maestria (Sprint 4 bloco 3, 16/08) — estrutura base, prioridade
    baixa. Endpoint próprio (`GET /player/mastery`), sob demanda, em vez
    de embutido em `/player/lookup`: Champion Mastery V4 é uma chamada à
    Riot a mais por request, e a maioria dos lookups nunca abre essa aba
    — não faz sentido pagar a cota sempre.

    Resolve Account-V1 de novo (não reaproveita `puuid` de um lookup
    anterior): esta rota pode ser chamada isolada pelo frontend, sem
    garantia de que `/player/lookup` já rodou na mesma sessão."""
    settings = settings or get_settings()
    score_region = normalize_region(region)
    continent = PLATFORM_TO_CONTINENT.get(score_region) if region else None

    account = await asyncio.to_thread(
        riot_api.get_account_by_riot_id,
        game_name,
        tag_line,
        continent_region=continent,
    )
    puuid = account["puuid"]

    entries = await asyncio.to_thread(
        riot_api.get_champion_mastery_top_by_puuid,
        puuid,
        platform_region=score_region,
        count=settings.player_mastery_top_n,
    )

    version = await cached("ddragon:version", data_dragon.get_latest_version)
    name_by_riot_id = await cached(
        f"ddragon:name_by_riot_id:{version}",
        lambda: data_dragon.get_champion_name_by_riot_id(version),
    )

    return [
        {
            "champion_id": resolve_champion_id(name_by_riot_id, entry["championId"]),
            "champion_level": entry["championLevel"],
            "champion_points": entry["championPoints"],
            "last_play_time": entry["lastPlayTime"],
        }
        for entry in entries
    ]
