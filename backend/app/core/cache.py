"""Revisão técnica §1.2: cache TTL em memória pras chamadas ao Data Dragon
(`/champions`, `/items`, `/runes`, resolução de nome de campeão) — hoje cada
request baixava o `champion.json` (~250 KB) de novo, e `/player/lookup`
chamava dois `asyncio.run()` soltos sem cache nenhum.

TTL de 1h: o Data Dragon muda a cada ~2 semanas (novo patch), então servir
até 1h de dado ligeiramente velho é imperceptível — e em serverless (Vercel)
o cache morre no cold start de qualquer forma, então não há risco de servir
patch desatualizado por muito tempo mesmo num processo de vida longa."""

import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")

_TTL_S = 3600
_cache: dict[str, tuple[float, object]] = {}


async def cached(key: str, factory: Callable[[], Awaitable[T]]) -> T:
    now = time.monotonic()
    hit = _cache.get(key)
    if hit is not None and now - hit[0] < _TTL_S:
        return hit[1]  # type: ignore[return-value]
    value = await factory()
    _cache[key] = (now, value)
    return value
