from pydantic import BaseModel


class RankingRow(BaseModel):
    """`puuid` removido de propósito (revisão técnica §2.1) — nenhum
    benefício funcional pro frontend, e é um identificador persistente de
    jogador que não precisa ser exposto publicamente."""

    tier: str
    region: str
    rank_position: int
    game_name: str | None
    tag_line: str | None
    summoner_level: int | None
    profile_icon_id: int | None
    league_points: int
    wins: int
    losses: int
    delta_posicao: int | None
