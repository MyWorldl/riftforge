from datetime import datetime

from pydantic import BaseModel


class PlayerScoreSummary(BaseModel):
    patch: str
    score_final: float
    score_tier: str
    tier_provisorio: bool


class BaselineComparison(BaseModel):
    """Revisão técnica §5.3: win rate do jogador nessas partidas contra a
    média (aparada) do grupo (patch, elo, rota) já usada na Camada 1 do
    score — mesma baseline, então comparável."""

    win_rate_jogador: float
    win_rate_medio_elo: float
    delta_pct: float


class PlayerChampionSummary(BaseModel):
    champion_id: str
    lane: str
    partidas: int
    vitorias: int
    kda_medio: float
    score_atual: PlayerScoreSummary | None
    comparativo_baseline: BaselineComparison | None


class PlayerRoadmapStepOut(BaseModel):
    """Rodada 28. `status` só chega aqui como "active"/"completed" —
    "replaced" existe no banco (auditoria/reativação) mas nunca serializa
    pra API."""

    champion_id: str
    lane: str
    status: str
    delta_pct_inicial: float
    delta_pct_atual: float
    partidas_base: int
    partidas_atual: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class PlayerRoadmapSummary(BaseModel):
    ativos: list[PlayerRoadmapStepOut]
    concluidos: list[PlayerRoadmapStepOut]


class PlayerRoadmapDeleteResponse(BaseModel):
    deleted: int


class PlayerLookupResponse(BaseModel):
    """`puuid` removido de propósito (revisão técnica §2.1)."""

    game_name: str
    tag_line: str
    elo_tier_comparado: str
    # Revisão técnica §5.3: True quando `elo_tier_comparado` veio de
    # League-V4 (PUUID sem filtro manual), não do default GOLD.
    elo_tier_detectado: bool
    partidas_analisadas: int
    campeoes: list[PlayerChampionSummary]
    roadmap: PlayerRoadmapSummary
