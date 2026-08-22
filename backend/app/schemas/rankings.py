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


class PlayerSearchRow(BaseModel):
    """Ajuste 21/08: busca "conforme digita" pra alimentar
    `PlayerSearchInput` (Home/Invocador/Análise do Jogador). Só indexa
    quem já está em `player_rankings` (ligas apex, top N por elo/região já
    coletado) — não é busca de qualquer jogador do mundo, ver
    `ranking_service.search_players`."""

    game_name: str
    tag_line: str
    region: str
    tier: str
    profile_icon_id: int | None
