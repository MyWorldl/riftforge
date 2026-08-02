from pydantic import BaseModel


class MatchupRow(BaseModel):
    opponent_champion_id: str
    games: int
    wins: int
    win_rate: float
    amostra_insuficiente: bool


class MatchupsResponse(BaseModel):
    patch: str | None
    confrontos: list[MatchupRow]
