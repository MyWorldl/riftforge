from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Patch(Base):
    """Reference row per patch. Patch version strings don't sort correctly
    lexicographically ("16.9" > "16.14" alphabetically) — patch_sequence is
    the source of truth for chronological order (Core §15_SCHEMA_DADOS.md §3)."""

    __tablename__ = "patches"

    id: Mapped[int] = mapped_column(primary_key=True)
    version_label: Mapped[str] = mapped_column(unique=True)
    patch_sequence: Mapped[int] = mapped_column(unique=True)


class Match(Base):
    """Raw match record, persisted so re-running ingestion never re-counts a
    match already processed (Core §11_PIPELINE_INGESTAO.md §4)."""

    __tablename__ = "matches"

    match_id: Mapped[str] = mapped_column(primary_key=True)
    patch_id: Mapped[int] = mapped_column(ForeignKey("patches.id"))
    platform_region: Mapped[str]
    queue_id: Mapped[int]
    game_start_ts: Mapped[int] = mapped_column(BigInteger)
    game_duration_s: Mapped[int]
    ingested_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    raw_payload: Mapped[dict] = mapped_column(JSON)


class MatchParticipant(Base):
    """One row per player per match. `riot_champion_id` (numeric) is the
    stable key — Match-V5's `championName` string sometimes diverges from
    Data Dragon's `id` (e.g. "Kai'Sa" vs "Kaisa"), so it's kept only for
    debugging, never as a lookup key (Core §05_BOAS_PRATICAS_CODIGO.md §3)."""

    __tablename__ = "match_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    puuid: Mapped[str]
    riot_champion_id: Mapped[int]
    champion_name: Mapped[str]
    team_id: Mapped[int]
    win: Mapped[bool]
    raw_role: Mapped[str | None]
    raw_lane: Mapped[str | None]
    resolved_position: Mapped[str | None]
    resolution_method: Mapped[str | None]
    kills: Mapped[int]
    deaths: Mapped[int]
    assists: Mapped[int]
    core_items: Mapped[list] = mapped_column(JSON)
    elo_tier: Mapped[str]

    __table_args__ = (UniqueConstraint("match_id", "puuid"),)


class MatchBan(Base):
    """Bans are match-wide, not tied to a participant row."""

    __tablename__ = "match_bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    riot_champion_id: Mapped[int]
    team_id: Mapped[int]
    ban_order: Mapped[int]


class ChampionLaneStat(Base):
    """Participant-level aggregate: games/wins/KDA for a champion in a lane, per tier and patch."""

    __tablename__ = "champion_lane_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]
    games: Mapped[int] = mapped_column(default=0)
    wins: Mapped[int] = mapped_column(default=0)
    kills: Mapped[int] = mapped_column(default=0)
    deaths: Mapped[int] = mapped_column(default=0)
    assists: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionBanStat(Base):
    """Ban counts are match-wide (not lane-specific), tracked separately from lane stats."""

    __tablename__ = "champion_ban_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    champion_id: Mapped[str]
    bans: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier", "champion_id"),)


class SegmentTotal(Base):
    """Denominator for pick rate / ban rate: unique matches processed per tier+patch."""

    __tablename__ = "segment_totals"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    total_matches: Mapped[int] = mapped_column(default=0)

    __table_args__ = (UniqueConstraint("patch", "tier"),)


class Baseline(Base):
    """μ/σ of Wilson-adjusted win rate per (lane, tier, patch) — describes the
    group, not an individual champion, so there's deliberately no champion key
    (Core §15_SCHEMA_DADOS.md §10.1). Used to z-score each champion's win rate
    against its direct peers (Core §02_MODELO_SCORE_TIERS.md §4.1)."""

    __tablename__ = "baselines"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    media_wr: Mapped[float]
    desvio_wr: Mapped[float]
    n_campeoes_amostra: Mapped[int]
    amostra_confiavel: Mapped[bool]

    __table_args__ = (UniqueConstraint("patch", "tier", "lane"),)


class ChampionPerformanceScore(Base):
    """Camada 1 do score — Performance Real, 40% do peso final (Core
    §02_MODELO_SCORE_TIERS.md §4). Ainda não é o score final: faltam Kit
    (25%), Build (25%) e Meta (10%) — ver §8 do mesmo documento. Corresponde
    a `champion_performance_agg` em Core §15_SCHEMA_DADOS.md §6.1, com chave
    em string (patch/tier/lane) para casar com as tabelas de agregação v0."""

    __tablename__ = "champion_performance_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]

    n_matches: Mapped[int]
    win_rate_raw: Mapped[float]
    win_rate_adjusted: Mapped[float]
    pick_rate: Mapped[float]
    ban_rate: Mapped[float]
    kda_avg: Mapped[float]

    z_wr: Mapped[float]  # persistido pro selo "Trap" (item 1.7): precisa de z_wr < -0.5
    nota_wr: Mapped[float]
    nota_presenca: Mapped[float]
    nota_kda: Mapped[float]
    performance_score: Mapped[float]

    model_version: Mapped[str]
    computed_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionKitScore(Base):
    """Camada 2 do score — Poder Intrínseco do Kit, 25% do peso final (Core
    §02_MODELO_SCORE_TIERS.md §5). Não varia por rota nem elo — só por
    campeão e patch (o kit é propriedade do personagem). Corresponde a
    `champion_kit_scores` em Core §15_SCHEMA_DADOS.md §7.1.

    v1 automática: cc_score e mobilidade_score ficam None porque o Data
    Dragon não expõe sinal numérico confiável pra esses eixos (os
    coeficientes de escala em spells[].vars vêm vazios na versão atual da
    API — risco descrito em Core §13_ESTRATEGIA_DADOS_KIT.md, confirmado na
    prática). dano_score e resiliencia_score usam `info.attack`/
    `info.defense` (classificação oficial 0-10 da própria Riot); alcance_score
    é calculado por percentil dentro do roster. kit_score redistribui o peso
    proporcionalmente entre os eixos disponíveis, nunca trata o ausente como
    zero (mesmo princípio já usado na média móvel de Build, Core
    §16_BASELINES_CALIBRACAO.md §7.1)."""

    __tablename__ = "champion_kit_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    champion_id: Mapped[str]

    cc_score: Mapped[float | None]
    dano_score: Mapped[float | None]
    mobilidade_score: Mapped[float | None]
    alcance_score: Mapped[float | None]
    resiliencia_score: Mapped[float | None]
    kit_score: Mapped[float]

    versao_calculo: Mapped[str]
    eixos_disponiveis: Mapped[list] = mapped_column(JSON)
    computed_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("patch", "champion_id"),)


class ChampionBuildPatch(Base):
    """Camada 3 do score — Sinergia de Build, nota **não-suavizada** por
    patch (Core §02_MODELO_SCORE_TIERS.md §6.1). Corresponde a
    `champion_build_patch` em Core §15_SCHEMA_DADOS.md §8.1. `b_patch` é o
    valor consultado pela média móvel em `ChampionBuildScore`."""

    __tablename__ = "champion_build_patch"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]

    n_builds_distintos: Mapped[int]
    entropia_itens: Mapped[float]
    nota_flex: Mapped[float]
    wr_build_otimo: Mapped[float]
    wr_build_medio: Mapped[float]
    nota_dep: Mapped[float]
    item_atual: Mapped[str | None]
    delta_spike: Mapped[float]
    nota_spike: Mapped[float]
    b_patch: Mapped[float]

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionBuildScore(Base):
    """Camada 3 do score — Sinergia de Build, nota **suavizada** por média
    móvel de 3 patches (Core §02_MODELO_SCORE_TIERS.md §6.2). Corresponde a
    `champion_build_score` em Core §15_SCHEMA_DADOS.md §8.2 — é este valor
    que o score final consome, não `ChampionBuildPatch.b_patch` diretamente."""

    __tablename__ = "champion_build_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]

    build_score: Mapped[float]
    patches_disponiveis: Mapped[int]

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionMetaContext(Base):
    """Camada 4 do score — Contexto de Meta (Core
    §02_MODELO_SCORE_TIERS.md §7). Corresponde a `champion_meta_context` em
    Core §15_SCHEMA_DADOS.md §9.1.

    `cobertura`/`nota_cobertura` são propriedade do GRUPO (patch, tier,
    lane) — descrevem a saúde do metagame ao redor de todos os campeões
    daquela rota, não algo exclusivo de um campeão — então todo campeão do
    mesmo grupo recebe o mesmo valor (mesmo princípio já usado pro
    percentil de ban rate na Camada 1)."""

    __tablename__ = "champion_meta_context"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]

    cobertura: Mapped[float]
    nota_cobertura: Mapped[float]
    slope_performance: Mapped[float | None]
    patches_usados_tendencia: Mapped[int]
    nota_tendencia: Mapped[float]
    meta_score: Mapped[float]

    __table_args__ = (UniqueConstraint("patch", "tier", "lane", "champion_id"),)


class ChampionScore(Base):
    """Score final — combina as 4 camadas e atribui tier (Core
    §02_MODELO_SCORE_TIERS.md §8-11). Corresponde a `champion_scores` em
    Core §15_SCHEMA_DADOS.md §9.2.

    Nomenclatura: a coluna do elo do jogador chama `elo_tier` aqui, **não**
    `tier` como nas outras tabelas — porque "tier" nesta camada colide com
    dois conceitos diferentes: o elo (Ouro, Prata...) e o tier de PODER do
    campeão (God, S, A...). O tier de poder fica em `score_tier` para não
    ambiguar os dois.

    `kit_score` é nulo quando não existe `ChampionKitScore` pro patch exato
    (ex: Kit só foi calculado pra versão mais recente do Data Dragon, mas
    esta linha é de um patch histórico) — nesse caso o peso de Kit (25%) é
    redistribuído proporcionalmente entre as camadas disponíveis, nunca
    tratado como zero. `pesos_usados` registra quais camadas entraram e com
    que peso, para auditoria."""

    __tablename__ = "champion_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    elo_tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]

    performance_score: Mapped[float]
    kit_score: Mapped[float | None]
    build_score: Mapped[float]
    meta_score: Mapped[float]
    pesos_usados: Mapped[dict] = mapped_column(JSON)

    score_final: Mapped[float]
    score_tier: Mapped[str]
    confianca: Mapped[float]
    tier_provisorio: Mapped[bool]
    trap_flag: Mapped[bool]

    model_version: Mapped[str]
    computed_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("patch", "elo_tier", "lane", "champion_id"),)
