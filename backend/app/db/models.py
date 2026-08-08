from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, ForeignKey, Index, Text, UniqueConstraint
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
    ingested_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    raw_payload: Mapped[dict] = mapped_column(JSON)

    # Revisão técnica §1.7: `purge_puuid.py` filtra por `game_start_ts` pra
    # decidir quais partidas estão fora da janela de retenção — sem índice,
    # isso varria a tabela inteira (a maior do banco).
    __table_args__ = (Index("ix_matches_game_start_ts", "game_start_ts"),)


class MatchParticipant(Base):
    """One row per player per match. `riot_champion_id` (numeric) is the
    stable key — Match-V5's `championName` string sometimes diverges from
    Data Dragon's `id` (e.g. "Kai'Sa" vs "Kaisa"), so it's kept only for
    debugging, never as a lookup key (Core §05_BOAS_PRATICAS_CODIGO.md §3)."""

    __tablename__ = "match_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    # Nulável desde a rodada 18 (política de retenção,
    # Core/Estrutura_roadmap/06_SEGURANCA_PRIVACIDADE.md §7): PUUID só
    # existe pra viabilizar a expansão "bola de neve" por participantes
    # (11_PIPELINE_INGESTAO.md §2.2, ainda não construída) — passada a
    # janela de coleta ativa, não há mais justificativa funcional pra
    # retê-lo (princípio de minimização, §2 do mesmo doc). Ver
    # app/jobs/purge_puuid.py.
    puuid: Mapped[str | None]
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

    # Runas (rodada 21) — nuláveis porque as partidas ingeridas antes desta
    # mudança não têm esse dado gravado (retroativo via
    # app/jobs/backfill_participant_runes.py, que reprocessa
    # `matches.raw_payload` já persistido em vez de chamar a Riot de novo).
    # `keystone_id` é a primeira seleção do estilo primário
    # (`perks.styles[0].selections[0].perk`); `primary_style_id`/
    # `sub_style_id` são os dois `perks.styles[].style` (árvore primária e
    # secundária).
    keystone_id: Mapped[int | None]
    primary_style_id: Mapped[int | None]
    sub_style_id: Mapped[int | None]

    __table_args__ = (
        UniqueConstraint("match_id", "puuid"),
        # Revisão técnica §1.7: FK sem índice — `purge_puuid.py` filtra por
        # `match_id IN (...)` contra a maior tabela do banco.
        Index("ix_match_participants_match_id", "match_id"),
    )


class MatchBan(Base):
    """Bans are match-wide, not tied to a participant row."""

    __tablename__ = "match_bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey("matches.match_id"))
    riot_champion_id: Mapped[int]
    team_id: Mapped[int]
    ban_order: Mapped[int]


class ChampionLaneStat(Base):
    """Participant-level aggregate: games/wins/KDA for a champion in a lane, per tier and patch.

    `id`/`patch`/`tier`/`lane`/`champion_id` são `BigInteger`/`Text`
    explícitos (em vez do `Mapped[int]`/`Mapped[str]` genérico usado no
    resto do arquivo) porque é isso que já existe fisicamente no Postgres
    desde que esta tabela foi criada (a primeira do pipeline de score) —
    descoberto no primeiro `alembic revision --autogenerate` contra o
    banco real. BIGINT/TEXT sem limite não têm custo extra sobre
    INTEGER/VARCHAR no Postgres; o objetivo aqui é só parar o
    autogenerate de reportar esse diff cosmético pra sempre, não mudar o
    schema físico."""

    __tablename__ = "champion_lane_stats"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    patch: Mapped[str] = mapped_column(Text)
    tier: Mapped[str] = mapped_column(Text)
    lane: Mapped[str] = mapped_column(Text)
    champion_id: Mapped[str] = mapped_column(Text)
    # Item novo (filtro de região, piloto br1+euw1): sem default no lado
    # Python de propósito, seguindo o precedente de `PlayerRanking.region`
    # — todo call-site de construção de linha passa `region=` explícito.
    # O schema tem `server_default='br1'` (ver migração Alembic
    # `add_region_to_champion_tables`) como rede de segurança, não como
    # comportamento esperado do código.
    region: Mapped[str]
    games: Mapped[int] = mapped_column(default=0)
    wins: Mapped[int] = mapped_column(default=0)
    kills: Mapped[int] = mapped_column(default=0)
    deaths: Mapped[int] = mapped_column(default=0)
    assists: Mapped[int] = mapped_column(default=0)

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_lane_stats",
        ),
    )


class ChampionBanStat(Base):
    """Ban counts are match-wide (not lane-specific), tracked separately from lane stats.

    Mesma nota de `ChampionLaneStat` sobre `BigInteger`/`Text` explícitos."""

    __tablename__ = "champion_ban_stats"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    patch: Mapped[str] = mapped_column(Text)
    tier: Mapped[str] = mapped_column(Text)
    champion_id: Mapped[str] = mapped_column(Text)
    region: Mapped[str]
    bans: Mapped[int] = mapped_column(default=0)

    __table_args__ = (
        UniqueConstraint(
            "patch", "tier", "champion_id", "region", name="uq_champion_ban_stats"
        ),
    )


class SegmentTotal(Base):
    """Denominator for pick rate / ban rate: unique matches processed per tier+patch.

    Mesma nota de `ChampionLaneStat` sobre `BigInteger`/`Text` explícitos."""

    __tablename__ = "segment_totals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    patch: Mapped[str] = mapped_column(Text)
    tier: Mapped[str] = mapped_column(Text)
    region: Mapped[str]
    total_matches: Mapped[int] = mapped_column(default=0)

    __table_args__ = (
        UniqueConstraint("patch", "tier", "region", name="uq_segment_totals"),
    )


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
    region: Mapped[str]
    media_wr: Mapped[float]
    desvio_wr: Mapped[float]
    n_campeoes_amostra: Mapped[int]
    amostra_confiavel: Mapped[bool]

    __table_args__ = (
        UniqueConstraint("patch", "tier", "lane", "region", name="uq_baselines"),
    )


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
    region: Mapped[str]

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
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_performance_scores",
        ),
    )


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
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

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
    region: Mapped[str]

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

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_build_patch",
        ),
    )


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
    region: Mapped[str]

    build_score: Mapped[float]
    patches_disponiveis: Mapped[int]

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_build_scores",
        ),
    )


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
    region: Mapped[str]

    cobertura: Mapped[float]
    nota_cobertura: Mapped[float]
    slope_performance: Mapped[float | None]
    patches_usados_tendencia: Mapped[int]
    nota_tendencia: Mapped[float]
    meta_score: Mapped[float]

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_meta_context",
        ),
    )


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
    region: Mapped[str]

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
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "elo_tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_scores",
        ),
        # Revisão técnica §1.7: `champion_id` é a última coluna do índice
        # único acima — `/scores/history` filtra só por `champion_id` +
        # `elo_tier` (sem `patch`), o que varria a tabela inteira sem um
        # índice próprio nessa ordem.
        Index("ix_champion_scores_champion_elo", "champion_id", "elo_tier"),
    )


class ChampionPatchChange(Base):
    """Item novo: "o que a Riot mudou de verdade" no patch, complementando
    `ChampionScore`/`patch_diff.py` (que mede IMPACTO estatístico via
    partidas, não a alteração numérica bruta). Populado por
    `app/jobs/compute_patch_changes.py`, que faz diff campo-a-campo do
    Data Dragon entre duas versões consecutivas (ver
    `app/core/patch_notes_diff.py` pra escopo/limitações — nem toda
    mudança de balanceamento é capturada, ajustes de proporção/escala
    ficam em `spells[].vars`, que a API pública não expõe).

    `patch` é a versão ATUAL (pra onde a mudança foi aplicada);
    `patch_anterior` só existe pra exibição ("comparando X -> Y"), não é
    usado como chave de busca — cada linha já representa uma comparação
    fixa calculada no momento do job."""

    __tablename__ = "champion_patch_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str] = mapped_column(index=True)
    patch_anterior: Mapped[str]
    champion_id: Mapped[str]
    category: Mapped[str]  # "stat" | "spell" | "passive"
    spell_key: Mapped[str | None]  # "Q"/"W"/"E"/"R", None fora de "spell"
    spell_name: Mapped[str | None]
    field: Mapped[str]
    field_label: Mapped[str]
    before_value: Mapped[str]
    after_value: Mapped[str]
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )


class PlayerRanking(Base):
    """ "Rankings" (rodada 19, filtro por região na rodada 20) — snapshot do
    ranking de jogadores das ligas apex (Desafiante/Grão-Mestre/Mestre)
    direto da Riot, não um conceito de classificação inventado pelo app
    (decisão explícita do usuário). Populado por
    `app/jobs/collect_rankings.py`, delete-and-recompute por
    (queue, tier, region) a cada execução — mesmo padrão idempotente do
    resto do pipeline, nunca lido ao vivo da Riot pelo backend público.

    `region` (rodada 20) é a região de plataforma (br1/na1/euw1/kr, ver
    `settings.rankings_platform_regions`) — cada uma tem sua própria liga
    apex, não é um filtro sobre o mesmo dado.

    `game_name`/`tag_line`/`summoner_level`/`profile_icon_id` ficam
    nuláveis: o job só resolve via Account-V1/Summoner-V4 pro top N por
    tier por região (`rankings_top_n_per_tier`) — resolver a liga inteira
    (~2000+ jogadores por região) gastaria cota à toa."""

    __tablename__ = "player_rankings"

    id: Mapped[int] = mapped_column(primary_key=True)
    queue: Mapped[str]
    tier: Mapped[str]
    region: Mapped[str]
    puuid: Mapped[str]
    game_name: Mapped[str | None]
    tag_line: Mapped[str | None]
    summoner_level: Mapped[int | None]
    profile_icon_id: Mapped[int | None]
    league_points: Mapped[int]
    wins: Mapped[int]
    losses: Mapped[int]
    rank_position: Mapped[int]
    # Revisão técnica §5.2: diferença entre a posição anterior e a atual
    # (positivo = subiu no ranking, negativo = caiu), lida do snapshot
    # anterior por `puuid` antes de `collect_rankings.py` apagar as linhas
    # velhas. `None` na primeira aparição do jogador nesse (queue, tier,
    # region) — sem posição anterior, não há delta pra mostrar, e mostrar
    # zero seria uma afirmação falsa ("não mudou") em vez de "sem dado".
    delta_posicao: Mapped[int | None]
    collected_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (UniqueConstraint("queue", "tier", "region", "puuid"),)


class ChampionMatchup(Base):
    """Item novo (rodada 21, backlog 3.5): "campeão A vs. campeão B" na
    mesma rota. Duas linhas por confronto observado numa partida — uma da
    perspectiva de cada lado — porque `win_rate` só faz sentido com um
    ponto de vista fixo (a vitória de A é sempre a derrota de B).

    Casado por `app/jobs/compute_matchups.py` agrupando
    `match_participants` por `(match_id, resolved_position)`: quando há
    exatamente 2 participantes de times diferentes na mesma posição, os
    dois entram como adversários um do outro. Partidas com 0, 1 ou 3+
    participantes na mesma posição (rota não resolvida por algum dos dois,
    ou dado inconsistente) são ignoradas, não forçadas."""

    __tablename__ = "champion_matchups"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]
    opponent_champion_id: Mapped[str]
    region: Mapped[str]

    games: Mapped[int] = mapped_column(default=0)
    wins: Mapped[int] = mapped_column(default=0)
    amostra_insuficiente: Mapped[bool] = mapped_column(default=False)
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "opponent_champion_id",
            "region",
            name="uq_champion_matchups",
        ),
    )


class ChampionBuildRecommendation(Base):
    """Item novo (rodada 21, backlog 4.1): build (itens) e runas com maior
    win rate observado por `(patch, tier, lane, campeão)`, calculado por
    `app/jobs/compute_build_recommendation.py`.

    Não é o build mais popular — é o de maior win rate entre os que
    atingem `settings.build_recommendation_min_games`; quando nenhum
    atinge o piso, cai pro mais popular mesmo assim e marca
    `amostra_insuficiente=True` (nunca omite o dado, só avisa que a
    confiança é baixa — mesmo princípio já usado em `Baseline`/
    `ChampionScore`). Itens e runas são escolhidos de forma independente
    (o build de maior WR não precisa ser o mesmo jogo da combinação de
    runas de maior WR)."""

    __tablename__ = "champion_build_recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]
    region: Mapped[str]

    item_build: Mapped[list] = mapped_column(JSON)
    item_build_games: Mapped[int]
    item_build_win_rate: Mapped[float]

    keystone_id: Mapped[int | None]
    primary_style_id: Mapped[int | None]
    sub_style_id: Mapped[int | None]
    rune_games: Mapped[int]
    rune_win_rate: Mapped[float]

    amostra_insuficiente: Mapped[bool] = mapped_column(default=False)
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_build_recommendations",
        ),
    )


class ChampionSkillExpression(Base):
    """Item novo (rodada 21, backlog 3.3): etiqueta de "Skill Expression"
    (floor/ceiling), calculada por `app/jobs/compute_skill_expression.py`.

    **Heurística v1, não uma métrica oficial da Riot** (documento Core não
    define fórmula — item `EM ABERTO`, decisão de produto tomada nesta
    rodada): usa a variação do KDA por partida individual do campeão
    dentro do grupo `(patch, tier, lane)`. `ceiling_ratio` = média do KDA
    dos 20% melhores jogos ÷ mediana; `floor_ratio` = média do KDA dos 20%
    piores jogos ÷ mediana — os dois normalizados por percentil dentro do
    mesmo grupo (`ceiling_percentil`/`floor_percentil`) pra virar rótulo
    Baixo/Médio/Alto. Os dois eixos são independentes: um campeão pode ter
    ceiling e floor altos ao mesmo tempo (consistente e ainda assim capaz
    de um pico), não é `floor = 100 - ceiling`."""

    __tablename__ = "champion_skill_expression"

    id: Mapped[int] = mapped_column(primary_key=True)
    patch: Mapped[str]
    tier: Mapped[str]
    lane: Mapped[str]
    champion_id: Mapped[str]
    region: Mapped[str]

    n_games: Mapped[int]
    mediana_kda: Mapped[float]
    ceiling_ratio: Mapped[float]
    floor_ratio: Mapped[float]
    ceiling_percentil: Mapped[float]
    floor_percentil: Mapped[float]
    ceiling_label: Mapped[str]
    floor_label: Mapped[str]
    amostra_insuficiente: Mapped[bool] = mapped_column(default=False)
    computed_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint(
            "patch",
            "tier",
            "lane",
            "champion_id",
            "region",
            name="uq_champion_skill_expression",
        ),
    )
