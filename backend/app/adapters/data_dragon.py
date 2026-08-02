"""Adapter for Riot's Data Dragon (static data: champions, items, versions).

No auth, no rate limit — isolated here so a Data Dragon schema change only
requires updates in this one file.
"""

import asyncio

import httpx

from app.core.config import get_settings

# `compute_kit.py` faz até ~233 chamadas concorrentes (uma por campeão) pra
# montar a Camada 2. Sem timeout/retry, um único ConnectTimeout transitório
# (confirmado em produção: runner do GitHub Actions, rede do CI) derruba o
# lote inteiro via asyncio.gather. Timeout mais generoso que o default do
# httpx (5s) e três tentativas com backoff curto — falha real (404, schema
# mudou) ainda propaga depois da última tentativa, não é escondida.
_TIMEOUT = httpx.Timeout(15.0, connect=10.0)
_RETRIES = 3
_RETRY_BACKOFF_S = 1.5


class DataDragonAdapter:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or get_settings().data_dragon_base_url

    async def _get_json(self, url: str) -> dict | list:
        last_error: Exception | None = None
        async with httpx.AsyncClient(base_url=self._base_url, timeout=_TIMEOUT) as client:
            for attempt in range(_RETRIES):
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    return response.json()
                except httpx.TransportError as exc:
                    last_error = exc
                    if attempt < _RETRIES - 1:
                        await asyncio.sleep(_RETRY_BACKOFF_S * (attempt + 1))
        raise last_error

    async def get_versions(self) -> list[str]:
        return await self._get_json("/api/versions.json")

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
        data = await self._get_json(f"/cdn/{version}/data/{locale}/champion.json")
        return data["data"]

    async def get_champion_detail(self, version: str, champion_id: str, locale: str = "en_US") -> dict:
        """Per-champion endpoint — the only one with full `spells[].range` and
        `info` (Riot's own 0-10 attack/defense/magic rating). The summary
        endpoint (`get_champions`) omits some of this detail."""
        data = await self._get_json(f"/cdn/{version}/data/{locale}/champion/{champion_id}.json")
        return data["data"][champion_id]

    async def get_champion_name_by_riot_id(self, version: str, locale: str = "en_US") -> dict[int, str]:
        """Maps Match-V5's numeric `championId` to Data Dragon's stable `id`
        string — needed because `championName` in match payloads sometimes
        diverges from ddragon's `id` (e.g. "Kai'Sa" vs "Kaisa")."""
        champions = await self.get_champions(version, locale)
        return {int(info["key"]): name for name, info in champions.items()}

    async def get_items(self, version: str, locale: str = "en_US") -> dict:
        """Item novo (rodada 21, "Recomendação de build") — proxy do
        catálogo de itens, mesmo padrão de `get_champions`. Usado só pra
        resolver nome/ícone no frontend a partir do ID numérico já gravado
        em `match_participants.core_items`."""
        data = await self._get_json(f"/cdn/{version}/data/{locale}/item.json")
        return data["data"]

    async def get_rune_paths(self, version: str, locale: str = "en_US") -> list:
        """Item novo (rodada 21) — árvores de runas (Precisão, Domínio...),
        cada uma com suas runas individuais e o caminho do ícone. Não tem
        endpoint "por versão exata" como o de campeão/item — o arquivo é o
        mesmo formato desde a introdução do Runas Reforjadas."""
        return await self._get_json(f"/cdn/{version}/data/{locale}/runesReforged.json")
