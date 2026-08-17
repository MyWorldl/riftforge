"""Integration check for the Meraki Analytics adapter — chamada real de
rede (cdn.merakianalytics.com, sem chave). Mesmo padrão de test_riot_api.py:
roda só no cron semanal (`pytest -m integration`), não a cada push."""

import pytest

from app.adapters.meraki import MerakiAdapter

pytestmark = pytest.mark.integration


async def test_get_champion_attribute_ratings_returns_expected_shape():
    adapter = MerakiAdapter()
    ratings = await adapter.get_champion_attribute_ratings("Zed")

    assert ratings is not None
    assert {"damage", "toughness", "control", "mobility", "utility"} <= ratings.keys()
    assert 0 <= ratings["control"] <= 3
    assert 0 <= ratings["mobility"] <= 3


async def test_get_champion_attribute_ratings_maps_ddragon_id_directly():
    """Confirma o achado da auditoria 16/08: a Meraki usa o mesmo `id` do
    Data Dragon como nome de arquivo (ex: "MonkeyKing" pro Wukong) — sem
    tabela de mapeamento própria necessária."""
    adapter = MerakiAdapter()
    ratings = await adapter.get_champion_attribute_ratings("MonkeyKing")
    assert ratings is not None


async def test_get_champion_attribute_ratings_returns_none_for_unknown_champion():
    adapter = MerakiAdapter()
    ratings = await adapter.get_champion_attribute_ratings("ChampionQueNaoExiste123")
    assert ratings is None
