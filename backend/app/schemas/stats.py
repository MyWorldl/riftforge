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


class CollectionSummaryRow(BaseModel):
    """Ajuste 21/08: total de partidas já coletadas por (região, tier),
    somado através de todos os patches — alimenta o aviso "Amostra: ..."
    da página Campeões com um número real em vez de só texto qualitativo."""

    region: str
    tier: str
    total_matches: int
