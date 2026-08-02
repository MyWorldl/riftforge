from pydantic import BaseModel


class BuildRecommendationResponse(BaseModel):
    patch: str
    item_build: list[int]
    item_build_games: int
    item_build_win_rate: float
    keystone_id: int | None
    primary_style_id: int | None
    sub_style_id: int | None
    rune_games: int
    rune_win_rate: float
    amostra_insuficiente: bool
