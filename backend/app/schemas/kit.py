from pydantic import BaseModel


class ChampionKitProfileRow(BaseModel):
    """`cc_score`/`mobilidade_score` ficam de fora de propósito — são
    sempre `None` (limitação permanente do Data Dragon, ver docstring de
    `ChampionKitScore`/`compute_kit.py`), não vale a pena expor como
    ruído em todo item da lista."""

    champion_id: str
    dano_score: float | None
    alcance_score: float | None
    resiliencia_score: float | None


class KitProfileResponse(BaseModel):
    patch: str | None
    perfis: list[ChampionKitProfileRow]
