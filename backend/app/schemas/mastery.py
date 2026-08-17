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


class MonochampionInfo(BaseModel):
    """Selo "Monochampion" (16/08) — concentração de maestria num único
    campeão, calculada sobre o histórico retido (até
    `monochampion_puuid_retention_days` dias, chaveado por PUUID — ver
    `PlayerChampionMasterySnapshot`). `champion_id` é o campeão que mais
    vezes liderou a maestria do jogador nos snapshots retidos;
    `concentracao_media` é a média de `pontos_do_líder / pontos_totais`
    só nos dias em que ELE liderou (não dilui com outro campeão que possa
    ter liderado num dia isolado). `ativo` exige amostra mínima
    (`monochampion_min_snapshots`) E concentração média acima do limiar
    (`monochampion_concentration_threshold`) — os números aparecem mesmo
    quando `ativo=False`, mesmo espírito de `tier_provisorio` no tier
    list: não esconde o dado, só avisa que ainda não é confiável."""

    champion_id: str
    concentracao_media: float
    amostras: int
    ativo: bool


class PlayerMasteryResponse(BaseModel):
    maestrias: list[ChampionMasterySummary]
    monochampion: MonochampionInfo | None
