"""Adapter for the Riot Games API (Match-V5 / League-V4 — real match data).

Requires an API key and is rate-limited. Wiring this up to Cassiopeia or
RiotWatcher (for built-in rate limiting) is Fase 2 of the roadmap — this
class only defines the interface the rest of the app will depend on, so the
eventual implementation is swappable without touching callers.
"""

from app.core.config import get_settings


class RiotApiAdapter:
    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or get_settings().riot_api_key

    async def get_league_entries(self, queue: str, tier: str, division: str) -> list[dict]:
        raise NotImplementedError("Fase 2: integrar Cassiopeia/RiotWatcher para League-V4")

    async def get_match(self, match_id: str) -> dict:
        raise NotImplementedError("Fase 2: integrar Cassiopeia/RiotWatcher para Match-V5")
