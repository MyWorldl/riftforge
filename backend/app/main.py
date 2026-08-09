"""Revisão técnica (item 4.1): composição da aplicação — rotas, lógica de
negócio e acesso a banco agora vivem em `app/api/routers/`, `app/services/`
e `app/repositories/` respectivamente (antes, tudo neste arquivo, ~700
linhas). Este arquivo só monta o app: middlewares + registro dos routers."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routers import builds, catalog, health, kit, matchups, meta, patch_notes, player, rankings, riot_proxy, scores, stats
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.logging import get_logger, new_correlation_id

settings = get_settings()
log = get_logger(__name__)

app = FastAPI(title="RiftForge API")


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = new_correlation_id(request.headers.get("X-Correlation-Id"))
    response = await call_next(request)
    response.headers["X-Correlation-Id"] = correlation_id
    return response


# Revisão técnica §2.4: API pura (nenhuma rota devolve HTML), então o CSP
# aqui só precisa negar tudo — não existe um `default-src 'self'` útil
# quando não há página pra carregar recursos.
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_methods=["*"],
    # Revisão técnica §2.5: nenhum fetch do frontend manda header custom
    # hoje — `*` era hábito ruim sem custo aparente agora, mas viraria falha
    # real no dia em que `allow_credentials=True` entrasse (autenticação).
    allow_headers=["Content-Type"],
)

# Rate limiting por IP: protege a cota da Riot API contra abuso de um único
# usuário/bot (política do documento base, seção 7). Limites configuráveis
# via env var em vez de hardcoded.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Item 1.2 (revisão técnica): rotas que só leem do banco próprio ou do Data
# Dragon (nunca fazem proxy de chamada Riot em tempo real por usuário) podem
# ser cacheadas pelo CDN da Vercel — hoje nenhuma resposta mandava
# `Cache-Control`, então o CDN nunca guardava nada. `/player/lookup` e
# `/riot/*` ficam de fora de propósito: são específicos por request.
_CACHEABLE_PREFIXES = (
    "/champions", "/items", "/runes", "/scores", "/stats", "/matchups", "/builds", "/rankings", "/patch-notes",
    "/meta",
)


@app.middleware("http")
async def add_cache_control(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and request.url.path.startswith(_CACHEABLE_PREFIXES):
        response.headers["Cache-Control"] = "public, max-age=300"
    return response


app.include_router(health.router)
app.include_router(catalog.router)
app.include_router(riot_proxy.router)
app.include_router(player.router)
app.include_router(rankings.router)
app.include_router(patch_notes.router)
app.include_router(stats.router)
app.include_router(scores.router)
app.include_router(matchups.router)
app.include_router(builds.router)
app.include_router(meta.router)
app.include_router(kit.router)
