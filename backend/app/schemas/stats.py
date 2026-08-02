from pydantic import BaseModel


class ChampionStatRow(BaseModel):
    champion_id: str
    lane: str
    patch: str
    tier: str
    games: int
    win_rate: float
    pick_rate: float
    ban_rate: float
    kda: float
