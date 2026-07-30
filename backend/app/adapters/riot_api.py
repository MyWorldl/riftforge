"""Adapter for the Riot Games API (Match-V5 / League-V4 — real match data).

Wraps RiotWatcher, which has a built-in rate limiter, so the rest of the app
depends only on this interface — swapping the underlying client (e.g. for
Cassiopeia later) means changing this one file.
"""

from riotwatcher import LolWatcher

from app.core.config import get_settings


class RiotApiAdapter:
    def __init__(
        self,
        api_key: str | None = None,
        platform_region: str | None = None,
        continent_region: str | None = None,
    ) -> None:
        settings = get_settings()
        self._platform_region = platform_region or settings.riot_platform_region
        self._continent_region = continent_region or settings.riot_continent_region
        self._client = LolWatcher(api_key or settings.riot_api_key, timeout=15)

    def get_league_entries(self, queue: str, tier: str, division: str) -> list[dict]:
        return self._client.league.entries(self._platform_region, queue, tier, division)

    def get_match_ids_by_puuid(
        self,
        puuid: str,
        count: int = 20,
        queue: int | None = None,
        start_time: int | None = None,
    ) -> list[str]:
        """`start_time` (epoch em segundos) descarta partidas antigas já na
        Riot, antes de gastar uma chamada por partida — ver
        app/jobs/ingest_matches.py para o porquê."""
        return self._client.match.matchlist_by_puuid(
            self._continent_region, puuid, count=count, queue=queue, start_time=start_time
        )

    def get_match(self, match_id: str) -> dict:
        return self._client.match.by_id(self._continent_region, match_id)
