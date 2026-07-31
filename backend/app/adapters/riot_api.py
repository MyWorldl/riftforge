"""Adapter for the Riot Games API (Match-V5 / League-V4 — real match data).

Wraps RiotWatcher, which has a built-in rate limiter, so the rest of the app
depends only on this interface — swapping the underlying client (e.g. for
Cassiopeia later) means changing this one file.
"""

from riotwatcher import LolWatcher, RiotWatcher

from app.core.config import get_settings

# Platform region (usado por League-V4, coleta batch) -> continent region
# (usado por Account-V1/Match-V5). Necessário pra "Análise do Jogador"
# (rodada 19): o usuário escolhe uma região de plataforma na Home, mas o
# PUUID/histórico de partidas só existe no shard de continente
# correspondente — sem esse mapa, buscar um jogador de outro continente
# (ex: Coreia) sempre bateria no shard errado (fixo em "americas") e
# devolveria 404 mesmo pra conta real.
PLATFORM_TO_CONTINENT: dict[str, str] = {
    "br1": "americas",
    "na1": "americas",
    "lan": "americas",
    "las": "americas",
    "oc1": "americas",
    "euw1": "europe",
    "eun1": "europe",
    "tr1": "europe",
    "ru": "europe",
    "kr": "asia",
    "jp1": "asia",
}


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
        key = api_key or settings.riot_api_key
        self._client = LolWatcher(key, timeout=15)
        # Account-V1 não é um endpoint de League of Legends (é conta Riot
        # genérica, compartilhada entre jogos) — RiotWatcher expõe isso numa
        # classe cliente separada (`RiotWatcher`, não `LolWatcher`).
        self._riot_client = RiotWatcher(key, timeout=15)

    def get_league_entries(self, queue: str, tier: str, division: str) -> list[dict]:
        return self._client.league.entries(self._platform_region, queue, tier, division)

    def get_account_by_riot_id(
        self, game_name: str, tag_line: str, continent_region: str | None = None
    ) -> dict:
        """Account-V1: Riot ID (`Nome#Tag`) → PUUID. Roteado por continente
        (americas/europe/asia), igual Match-V5 — diferente do platform
        routing (br1/na1/...) usado por League-V4."""
        region = continent_region or self._continent_region
        return self._riot_client.account.by_riot_id(region, game_name, tag_line)

    def get_account_by_puuid(self, puuid: str, continent_region: str | None = None) -> dict:
        """Account-V1, direção inversa: PUUID → Riot ID. Usado por
        `app/jobs/collect_rankings.py` pra resolver o nome de exibição dos
        jogadores das ligas apex (League-V4 só devolve PUUID, não nome)."""
        region = continent_region or self._continent_region
        return self._riot_client.account.by_puuid(region, puuid)

    def get_match_ids_by_puuid(
        self,
        puuid: str,
        count: int = 20,
        queue: int | None = None,
        start_time: int | None = None,
        continent_region: str | None = None,
    ) -> list[str]:
        """`start_time` (epoch em segundos) descarta partidas antigas já na
        Riot, antes de gastar uma chamada por partida — ver
        app/jobs/ingest_matches.py para o porquê."""
        region = continent_region or self._continent_region
        return self._client.match.matchlist_by_puuid(
            region, puuid, count=count, queue=queue, start_time=start_time
        )

    def get_match(self, match_id: str, continent_region: str | None = None) -> dict:
        region = continent_region or self._continent_region
        return self._client.match.by_id(region, match_id)

    def get_challenger_league(self, queue: str = "RANKED_SOLO_5x5", platform_region: str | None = None) -> dict:
        """League-V4 apex league — todos os jogadores Desafiante da fila,
        num único payload (LeagueListDTO). Diferente de `get_league_entries`
        (paginado por tier+divisão), aqui a Riot já devolve a liga inteira.
        `platform_region` sobrescreve a região configurada — necessário pro
        filtro por região do Rankings (rodada 20), que cobre várias
        regiões, não só a do backend."""
        region = platform_region or self._platform_region
        return self._client.league.challenger_by_queue(region, queue)

    def get_grandmaster_league(self, queue: str = "RANKED_SOLO_5x5", platform_region: str | None = None) -> dict:
        region = platform_region or self._platform_region
        return self._client.league.grandmaster_by_queue(region, queue)

    def get_master_league(self, queue: str = "RANKED_SOLO_5x5", platform_region: str | None = None) -> dict:
        region = platform_region or self._platform_region
        return self._client.league.masters_by_queue(region, queue)

    def get_summoner_by_puuid(self, puuid: str, platform_region: str | None = None) -> dict:
        """Summoner-V4 — nível e ícone de invocador (`summonerLevel`,
        `profileIconId`). Roteado por plataforma (br1/na1/...), igual
        League-V4 — diferente do continente usado por Account-V1/Match-V5."""
        region = platform_region or self._platform_region
        return self._client.summoner.by_puuid(region, puuid)
