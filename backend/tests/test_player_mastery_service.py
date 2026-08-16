"""`get_top_mastery`: sem rede real — dublês nos adapters compartilhados
(`app.core.adapters.riot_api`/`data_dragon`, mesmo padrão de
`test_catalog_champions_proxies_data_dragon` em test_routes.py)."""

import pytest

from app.core.adapters import data_dragon, riot_api
from app.core.cache import _cache
from app.core.config import get_settings
from app.services.player_mastery_service import get_top_mastery


@pytest.fixture(autouse=True)
def _clear_ddragon_cache():
    """`cached()` é um TTLCache de processo inteiro (`app/core/cache.py`)
    — sem limpar, o segundo teste deste arquivo reaproveitaria o
    `name_by_riot_id` populado pelo primeiro em vez do seu próprio dublê."""
    _cache.clear()
    yield
    _cache.clear()


async def test_get_top_mastery_resolves_champion_ids_and_orders_from_riot(monkeypatch):
    async def fake_version():
        return "16.15.1"

    async def fake_name_by_riot_id(version):
        return {103: "Ahri", 1: "Annie"}

    def fake_account(game_name, tag_line, continent_region=None):
        return {"puuid": "puuid-123", "gameName": game_name, "tagLine": tag_line}

    def fake_top_mastery(puuid, platform_region=None, count=None):
        assert puuid == "puuid-123"
        assert count == get_settings().player_mastery_top_n
        return [
            {
                "championId": 103,
                "championLevel": 7,
                "championPoints": 234_000,
                "lastPlayTime": 1_700_000_000_000,
            },
            {
                "championId": 1,
                "championLevel": 5,
                "championPoints": 50_000,
                "lastPlayTime": 1_690_000_000_000,
            },
        ]

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(
        data_dragon, "get_champion_name_by_riot_id", fake_name_by_riot_id
    )
    monkeypatch.setattr(riot_api, "get_account_by_riot_id", fake_account)
    monkeypatch.setattr(riot_api, "get_champion_mastery_top_by_puuid", fake_top_mastery)

    result = await get_top_mastery("Fulano", "BR1", "br1")

    assert result == [
        {
            "champion_id": "Ahri",
            "champion_level": 7,
            "champion_points": 234_000,
            "last_play_time": 1_700_000_000_000,
        },
        {
            "champion_id": "Annie",
            "champion_level": 5,
            "champion_points": 50_000,
            "last_play_time": 1_690_000_000_000,
        },
    ]


async def test_get_top_mastery_falls_back_to_riot_id_when_champion_unknown(
    monkeypatch,
):
    """Campeão novo que o Data Dragon ainda não conhece (mesma classe de
    fallback que `resolve_champion_id` já garante alhures) não deve
    quebrar a aba — devolve o ID numérico como string em vez de falhar."""

    async def fake_version():
        return "16.15.1"

    async def fake_name_by_riot_id(version):
        return {}

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(
        data_dragon, "get_champion_name_by_riot_id", fake_name_by_riot_id
    )
    monkeypatch.setattr(
        riot_api,
        "get_account_by_riot_id",
        lambda *a, **k: {"puuid": "puuid-123"},
    )
    monkeypatch.setattr(
        riot_api,
        "get_champion_mastery_top_by_puuid",
        lambda *a, **k: [
            {
                "championId": 9999,
                "championLevel": 3,
                "championPoints": 10_000,
                "lastPlayTime": 1_600_000_000_000,
            }
        ],
    )

    result = await get_top_mastery("Fulano", "BR1", "br1")
    assert result[0]["champion_id"] == "9999"
