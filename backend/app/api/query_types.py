"""Revisão técnica §1.10 (Sprint 2 item 11): valores fechados definidos pela
própria Riot pros query params `elo_tier`/`lane`/`queue`/`tier` (apex) —
`Literal` faz o FastAPI rejeitar com `422` um valor de fora do conjunto
(ex: erro de digitação `"GLOD"`) em vez de silenciosamente devolver `200 []`
indistinguível de "sem dado pra esse filtro".

`region` de propósito NÃO entra aqui: adicionar uma região é, por design,
uma mudança só de configuração (`pipeline_platform_regions`) — nenhum código
em `app/api/`, `app/jobs/` ou `app/repositories/` deveria precisar de
alteração pra isso (ver `17_ESTADO_IMPLEMENTADO.md`, rodada 26). Travar
`region` num `Literal` aqui reintroduziria exatamente o acoplamento que
aquele design evitou — continua `str`."""

from typing import Literal

EloTier = Literal[
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
]

Lane = Literal["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]

# Rankings só cobre as ligas apex (`app/jobs/collect_rankings.py`) — não o
# conjunto completo de `EloTier`.
ApexTier = Literal["CHALLENGER", "GRANDMASTER", "MASTER"]

Queue = Literal["RANKED_SOLO_5x5", "RANKED_FLEX_SR"]
