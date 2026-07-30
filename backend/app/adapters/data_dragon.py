"""Adapter for Riot's Data Dragon (static data: champions, items, versions).

No auth, no rate limit — isolated here so a Data Dragon schema change only
requires updates in this one file.
"""

import httpx

from app.core.config import get_settings


class DataDragonAdapter:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or get_settings().data_dragon_base_url

    async def get_versions(self) -> list[str]:
        async with httpx.AsyncClient(base_url=self._base_url) as client:
            response = await client.get("/api/versions.json")
            response.raise_for_status()
        return response.json()

    async def get_latest_version(self) -> str:
        # Respeita TARGET_PATCH_VERSION se configurado (ver core/config.py), para
        # permitir congelar o app num patch específico sem reconsultar a API a
        # cada request.
        pinned = get_settings().target_patch_version
        if pinned:
            return pinned
        versions = await self.get_versions()
        return versions[0]

    async def get_champions(self, version: str, locale: str = "en_US") -> dict:
        url = f"/cdn/{version}/data/{locale}/champion.json"
        async with httpx.AsyncClient(base_url=self._base_url) as client:
            response = await client.get(url)
            response.raise_for_status()
        return response.json()["data"]

    async def get_champion_detail(self, version: str, champion_id: str, locale: str = "en_US") -> dict:
        """Per-champion endpoint — the only one with full `spells[].range` and
        `info` (Riot's own 0-10 attack/defense/magic rating). The summary
        endpoint (`get_champions`) omits some of this detail."""
        url = f"/cdn/{version}/data/{locale}/champion/{champion_id}.json"
        async with httpx.AsyncClient(base_url=self._base_url) as client:
            response = await client.get(url)
            response.raise_for_status()
        return response.json()["data"][champion_id]
