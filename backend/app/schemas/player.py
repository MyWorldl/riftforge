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
    # Revisão técnica 09/08 §2.3: token opaco pro DELETE, não autenticação
    # — `None` quando o jogador nunca teve um passo (nada a proteger).
    roadmap_token: str | None


class PlayerRoadmapDeleteResponse(BaseModel):
    deleted: int


class PlayerMatchSummary(BaseModel):
    """Sprint 4 (16/08) — base das abas Resumo/Partidas. `match_id` sai daqui
    de propósito (não de `Match.match_id` do banco): esta rota nunca grava
    no pipeline em lote, é busca ao vivo por request.

    `badge`: "mvp" (maior impacto no time vencedor), "ace" (maior impacto no
    perdedor) ou `None` — ver `player_service._compute_match_badges`. Os
    demais campos (`total_cs` em diante) vêm de `_extract_match_stats`,
    reaproveitada de `app/jobs/ingest_matches.py`; podem ser `None` em
    partidas antigas sem `challenges` no payload da Riot."""

    match_id: str
    champion_id: str
    lane: str
    win: bool
    kills: int
    deaths: int
    assists: int
    badge: str | None
    game_duration_s: int
    total_cs: int | None
    gold_earned: int | None
    damage_to_champions: int | None
    damage_taken: int | None
    vision_score: int | None
    double_kills: int | None
    triple_kills: int | None
    quadra_kills: int | None
    penta_kills: int | None
    kill_participation: float | None
    team_damage_percentage: float | None


class PlayerRankSnapshotOut(BaseModel):
    """Sprint 4 (16/08) — um ponto na série "progresso na temporada". Só
    existe pra fila Solo/Duo hoje (mesma que `elo_tier_comparado` detecta);
    lista vazia quando o lookup usou `elo_tier` explícito (não roda
    League-V4) ou o jogador nunca teve entrada ranqueada."""

    tier: str
    division: str
    league_points: int
    wins: int
    losses: int
    captured_at: datetime


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
    partidas: list[PlayerMatchSummary]
    progresso_temporada: list[PlayerRankSnapshotOut]
