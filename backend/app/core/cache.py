"""Revisão técnica §1.2: cache TTL em memória pras chamadas ao Data Dragon
(`/champions`, `/items`, `/runes`, resolução de nome de campeão) — hoje cada
request baixava o `champion.json` (~250 KB) de novo, e `/player/lookup`
chamava dois `asyncio.run()` soltos sem cache nenhum.

TTL de 1h: o Data Dragon muda a cada ~2 semanas (novo patch), então servir
até 1h de dado ligeiramente velho é imperceptível — e em serverless (Vercel)
o cache morre no cold start de qualquer forma, então não há risco de servir
patch desatualizado por muito tempo mesmo num processo de vida longa.

Revisão técnica §2.1 (Sprint 2 item 9): o `dict` solto original nunca
encolhia — cada `champion_id` inválido batido em `/champions/{champion_id}`
criava uma entrada nova que só expirava (sem nunca ser removida do dict) em
vez de ser descartada, um vetor de exaustão de memória via ID arbitrário.
`cachetools.TTLCache(maxsize=512)` estabelece um teto real: acima disso,
entradas mais antigas são descartadas por LRU antes de crescer mais. 512 é
generoso (hoje: ~170 campeões + versão + itens + runas, todos sob a mesma
versão de patch na prática) sem ser ilimitado. `catalog_service` também
passa a validar `champion_id` contra o catálogo real antes de tocar o cache
(ver `get_champion_detail`), então na prática IDs inválidos nem chegam aqui
— o teto é a segunda camada de defesa, não a única."""

from collections.abc import Awaitable, Callable
from typing import TypeVar

from cachetools import TTLCache

T = TypeVar("T")

_TTL_S = 3600
_cache: TTLCache[str, tuple[float, object]] = TTLCache(maxsize=512, ttl=_TTL_S)


async def cached(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    hit = _cache.get(key)
    if hit is not None:
        return hit  # type: ignore[return-value]
    value = await factory()
    _cache[key] = value
    return value
