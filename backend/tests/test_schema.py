"""Schema guard for Data Dragon: fails loudly if Riot renames/removes fields
this app depends on, instead of breaking silently downstream (per roadmap Fase 1).
"""

import pytest

from app.adapters.data_dragon import DataDragonAdapter

EXPECTED_CHAMPION_FIELDS = {"id", "key", "name", "title", "tags", "stats"}


@pytest.mark.asyncio
async def test_champion_schema_has_expected_fields():
    adapter = DataDragonAdapter()
    version = await adapter.get_latest_version()
    champions = await adapter.get_champions(version)

    sample_champion = next(iter(champions.values()))
    missing = EXPECTED_CHAMPION_FIELDS - sample_champion.keys()

    assert not missing, f"Data Dragon schema changed, campos ausentes: {missing}"
