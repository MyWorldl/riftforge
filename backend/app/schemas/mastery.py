from pydantic import BaseModel


class ChampionMasterySummary(BaseModel):
    """Sprint 4 bloco 3 (16/08) — estrutura base da aba Maestria, top N
    campeões por Champion Mastery V4 (`GET /player/mastery`, endpoint
    próprio, sob demanda). `last_play_time` vem em epoch milissegundos,
    igual a Riot devolve — conversão de exibição fica pro frontend."""

    champion_id: str
    champion_level: int
    champion_points: int
    last_play_time: int
