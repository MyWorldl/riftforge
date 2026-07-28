"""Integration check for the Riot API adapter. Skipped without a real key
since the Development Key rotates every 24h and this hits the live API."""

import pytest

from app.adapters.riot_api import RiotApiAdapter
from app.core.config import get_settings

pytestmark = pytest.mark.skipif(
    get_settings().riot_api_key in ("changeme", ""),
    reason="Requer uma RIOT_API_KEY válida em backend/.env",
)


def test_get_league_entries_returns_list():
    adapter = RiotApiAdapter()
    entries = adapter.get_league_entries(queue="RANKED_SOLO_5x5", tier="GOLD", division="I")

    assert isinstance(entries, list)
    if entries:
        assert {"puuid", "leaguePoints", "wins", "losses"} <= entries[0].keys()
