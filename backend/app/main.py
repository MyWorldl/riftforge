from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from riotwatcher import ApiError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.adapters.data_dragon import DataDragonAdapter
from app.adapters.riot_api import RiotApiAdapter
from app.core.config import get_settings
from app.core.explain import explain_score
from app.core.power_profile import power_profile
from app.db.models import (
    ChampionBanStat,
    ChampionLaneStat,
    ChampionPerformanceScore,
    ChampionScore,
    Patch,
    SegmentTotal,
)
from app.db.session import SessionLocal

settings = get_settings()

app = FastAPI(title="RiftForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting por IP: protege a cota da Riot API contra abuso de um único
# usuário/bot (política do documento base, seção 7). Limites configuráveis
# via env var em vez de hardcoded.
limiter = Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit_default])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

data_dragon = DataDragonAdapter()
riot_api = RiotApiAdapter()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


@app.get("/champions")
async def list_champions() -> dict:
    version = await data_dragon.get_latest_version()
    champions = await data_dragon.get_champions(version)
    return {"patch": version, "champions": champions}


def _ensure_riot_proxy_enabled() -> None:
    """The Riot API key must never back a publicly-open product (Development
    Key ToS, doc seção 4). These proxy endpoints are for local debugging
    only — disabled whenever no real key is configured."""
    if settings.riot_api_key in ("changeme", ""):
        raise HTTPException(
            status_code=501,
            detail="Endpoints /riot/* desativados nesta instância (sem RIOT_API_KEY configurada). "
            "Use /stats/champions, que lê do banco próprio.",
        )


@app.get("/riot/league-entries")
@limiter.limit(settings.rate_limit_riot_proxy)
def get_league_entries(
    request: Request,
    queue: str = "RANKED_SOLO_5x5",
    tier: str = "GOLD",
    division: str = "I",
) -> list[dict]:
    _ensure_riot_proxy_enabled()
    try:
        return riot_api.get_league_entries(queue, tier, division)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc


@app.get("/riot/matches/{match_id}")
@limiter.limit(settings.rate_limit_riot_proxy)
def get_match(request: Request, match_id: str) -> dict:
    _ensure_riot_proxy_enabled()
    try:
        return riot_api.get_match(match_id)
    except ApiError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc


@app.get("/stats/champions")
def get_champion_stats(tier: str = "GOLD", lane: str | None = None, patch: str | None = None) -> list[dict]:
    """Placar de força lido do banco próprio — nunca consulta a Riot em tempo
    real por request do usuário. Os dados vêm dos jobs em
    app/jobs/ingest_matches.py (coleta) e app/jobs/aggregate_stats.py (cálculo)."""
    session = SessionLocal()
    try:
        if patch is None:
            latest = (
                session.query(SegmentTotal.patch)
                .filter_by(tier=tier)
                .order_by(SegmentTotal.patch.desc())
                .first()
            )
            if latest is None:
                return []
            patch = latest[0]

        segment_total = (
            session.query(SegmentTotal.total_matches).filter_by(patch=patch, tier=tier).scalar()
            or 0
        )
        bans = {
            row.champion_id: row.bans
            for row in session.query(ChampionBanStat).filter_by(patch=patch, tier=tier).all()
        }

        query = session.query(ChampionLaneStat).filter_by(patch=patch, tier=tier)
        if lane:
            query = query.filter_by(lane=lane)

        return [
            {
                "champion_id": row.champion_id,
                "lane": row.lane,
                "patch": row.patch,
                "tier": row.tier,
                "games": row.games,
                "win_rate": row.wins / row.games if row.games else 0,
                "pick_rate": row.games / segment_total if segment_total else 0,
                "ban_rate": bans.get(row.champion_id, 0) / segment_total if segment_total else 0,
                "kda": (row.kills + row.assists) / max(row.deaths, 1),
            }
            for row in query.all()
        ]
    finally:
        session.close()


@app.get("/scores/champions")
def get_champion_scores(elo_tier: str = "GOLD", lane: str | None = None, patch: str | None = None) -> list[dict]:
    """Placar com o modelo de score em camadas (Performance/Kit/Build/Meta),
    tier God-E, indicador de confiança e selo Trap — lê só de
    `champion_scores` (saída de app/jobs/compute_scores.py), nunca consulta
    a Riot em tempo real. Sucessor de /stats/champions (item 1.8 do backlog:
    a interface deve mostrar tier/confiança/Trap em vez do placar cru).

    Cada linha traz `explicacao` (item 3.1): a decomposição do score final
    em contribuições por camada, calculada na hora a partir dos valores já
    persistidos — matemática pura sobre dado que já está na linha, não uma
    consulta a mais. Ver app/core/explain.py.

    Cada linha também traz `perfil_poder` (item 3.2): quanto do score vem
    de característica própria do campeão (Kit+Build, "estrutural") vs. do
    momento do patch (Performance+Meta, "meta") — mesma matemática de
    pesos reais usados, ver app/core/power_profile.py."""
    session = SessionLocal()
    try:
        if patch is None:
            latest = (
                session.query(ChampionScore.patch)
                .join(Patch, Patch.version_label == ChampionScore.patch)
                .filter(ChampionScore.elo_tier == elo_tier)
                .order_by(Patch.patch_sequence.desc())
                .first()
            )
            if latest is None:
                return []
            patch = latest[0]

        query = session.query(ChampionScore).filter_by(elo_tier=elo_tier, patch=patch)
        if lane:
            query = query.filter_by(lane=lane)
        rows = query.all()

        n_matches_by_key = {
            (r.patch, r.tier, r.lane, r.champion_id): r.n_matches
            for r in session.query(ChampionPerformanceScore).filter_by(tier=elo_tier, patch=patch).all()
        }

        result = []
        for row in rows:
            layer_scores = {
                "performance": row.performance_score,
                "kit": row.kit_score,
                "build": row.build_score,
                "meta": row.meta_score,
            }
            pesos_usados = row.pesos_usados or {}
            result.append(
                {
                    "champion_id": row.champion_id,
                    "lane": row.lane,
                    "patch": row.patch,
                    "elo_tier": row.elo_tier,
                    "n_matches": n_matches_by_key.get((row.patch, row.elo_tier, row.lane, row.champion_id), 0),
                    "score_final": row.score_final,
                    "score_tier": row.score_tier,
                    "confianca": row.confianca,
                    "tier_provisorio": row.tier_provisorio,
                    "trap_flag": row.trap_flag,
                    "performance_score": row.performance_score,
                    "kit_score": row.kit_score,
                    "build_score": row.build_score,
                    "meta_score": row.meta_score,
                    "explicacao": explain_score(layer_scores, pesos_usados),
                    "perfil_poder": power_profile(layer_scores, pesos_usados),
                }
            )
        return result
    finally:
        session.close()


@app.get("/scores/patches")
def get_available_patches(elo_tier: str = "GOLD") -> list[str]:
    """Patches com score calculado pro elo, do mais recente pro mais
    antigo — alimenta o filtro de patch da interface. Antes era um campo
    de texto livre: o usuário não tinha como saber quais patches existem
    sem adivinhar (e adivinhar errado dava tabela vazia, sem explicação).

    Ordena por `patch_sequence`, mesmo cuidado de sempre — string de
    versão não ordena cronologicamente."""
    session = SessionLocal()
    try:
        # `patch_sequence` precisa estar no SELECT pra aparecer no ORDER
        # BY com DISTINCT — Postgres rejeita ("must appear in select
        # list"), diferente do SQLite local usado nos testes.
        rows = (
            session.query(ChampionScore.patch, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(ChampionScore.elo_tier == elo_tier)
            .distinct()
            .order_by(Patch.patch_sequence.desc())
            .all()
        )
        return [r[0] for r in rows]
    finally:
        session.close()


@app.get("/scores/history")
def get_champion_history(champion_id: str, elo_tier: str = "GOLD", lane: str | None = None) -> list[dict]:
    """Item 3.4: evolução do score de um campeão entre patches — a
    interface pede um gráfico, isso é a série que alimenta ele.

    Ordena por `patches.patch_sequence`, não pela string do patch: versão
    é texto ("16.9" > "16.14" alfabeticamente), então ordenar pela coluna
    teria embaralhado a linha do tempo — mesmo problema que motivou criar
    `patch_sequence` desde a Fase 0 (ver `15_SCHEMA_DADOS.md` §3).

    `lane` filtra pra uma série só; sem ele, um campeão com múltiplas
    rotas traria uma linha por rota misturada — a interface sempre chama
    com a rota da linha que o usuário está vendo, então isso nunca
    acontece na prática, mas a API não força o filtro pra continuar
    utilizável fora do frontend."""
    session = SessionLocal()
    try:
        query = (
            session.query(ChampionScore, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(ChampionScore.champion_id == champion_id, ChampionScore.elo_tier == elo_tier)
        )
        if lane:
            query = query.filter(ChampionScore.lane == lane)
        rows = query.order_by(Patch.patch_sequence).all()

        perf_query = session.query(ChampionPerformanceScore).filter_by(
            tier=elo_tier, champion_id=champion_id
        )
        if lane:
            perf_query = perf_query.filter_by(lane=lane)
        n_matches_by_key = {
            (r.patch, r.tier, r.lane, r.champion_id): r.n_matches for r in perf_query.all()
        }

        return [
            {
                "patch": row.patch,
                "lane": row.lane,
                "score_final": row.score_final,
                "score_tier": row.score_tier,
                "confianca": row.confianca,
                "tier_provisorio": row.tier_provisorio,
                "n_matches": n_matches_by_key.get((row.patch, row.elo_tier, row.lane, row.champion_id), 0),
            }
            for row, _ in rows
        ]
    finally:
        session.close()
