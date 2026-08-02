from pydantic import BaseModel


class SkillExpression(BaseModel):
    ceiling_label: str
    floor_label: str
    amostra_insuficiente: bool


class ChampionScoreRow(BaseModel):
    """Item 4.3: `explicacao`/`perfil_poder` saíram daqui — ver
    `ExplainResponse` em `GET /scores/champions/{champion_id}/explain`,
    buscado sob demanda em vez de calculado pra toda linha da lista."""

    champion_id: str
    lane: str
    patch: str
    elo_tier: str
    n_matches: int
    win_rate: float | None
    pick_rate: float | None
    ban_rate: float | None
    score_final: float
    score_tier: str
    confianca: float
    tier_provisorio: bool
    trap_flag: bool
    performance_score: float
    kit_score: float | None
    build_score: float
    meta_score: float
    skill_expression: SkillExpression | None


class ChampionHistoryPoint(BaseModel):
    patch: str
    lane: str
    score_final: float
    score_tier: str
    confianca: float
    tier_provisorio: bool
    n_matches: int


class LayerContribution(BaseModel):
    camada: str
    score: float
    peso: float
    contribuicao: float


class ScoreExplanation(BaseModel):
    base: float
    camadas: list[LayerContribution]
    camadas_ausentes: list[str]


class PowerAxis(BaseModel):
    score: float | None
    peso: float


class PowerProfile(BaseModel):
    estrutural: PowerAxis
    meta: PowerAxis
    classificacao: str


class ExplainResponse(BaseModel):
    explicacao: ScoreExplanation
    perfil_poder: PowerProfile
