from fastapi import APIRouter, Depends, HTTPException, Request
from riotwatcher import ApiError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import Settings, get_settings
from app.core.limiter import limiter
from app.core.riot_gate import ensure_riot_proxy_enabled
from app.schemas.mastery import PlayerMasteryResponse
from app.schemas.player import PlayerLookupResponse, PlayerRoadmapDeleteResponse
from app.services import player_mastery_service, player_service
from app.services import player_roadmap_service

router = APIRouter(prefix="/player", tags=["player"])
# Revisão técnica §4.2: usado só pelo `@limiter.limit(...)` abaixo — o
# decorador precisa do valor no momento do import, então isto é a exceção
# que a própria revisão reconhece como inevitável (não confundir com o
# `Depends(get_settings)` no parâmetro de `get_player_lookup`, que É a
# versão testável/override-ável, usada dentro do corpo da rota).
settings = get_settings()


@router.get("/lookup", response_model=PlayerLookupResponse)
@limiter.limit(settings.rate_limit_player_lookup)
async def get_player_lookup(
    request: Request,
    game_name: str,
    tag_line: str,
    region: str | None = None,
    elo_tier: str | None = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """ "Análise do Jogador" — busca sob demanda de um jogador por Riot ID
    (`Nome#Tag`). Diferente do resto do backend, ESTA rota faz chamadas
    reais à Riot API por requisição (Account-V1 → Match-V5), por isso
    reaproveita o mesmo gate de `ensure_riot_proxy_enabled()` dos endpoints
    `/riot/*` — não pode ir ao ar em produção até a Production Key ser
    aprovada.

    `elo_tier` omitido (revisão técnica §5.3): detecta o elo real do
    jogador via League-V4 em vez de assumir GOLD fixo — ver
    `player_service._detect_elo_tier`.

    Revisão técnica §4.2 (Sprint A item 1): `settings` via `Depends`, não
    lido direto do módulo — `app.dependency_overrides[get_settings]` num
    teste passa a alcançar `lookup_player`/`sync_roadmap_steps` de
    verdade, coisa que o `settings` global acima (só pro decorador de
    rate limit) nunca alcançaria."""
    ensure_riot_proxy_enabled()
    try:
        return await player_service.lookup_player(
            db, game_name, tag_line, region, elo_tier, settings
        )
    except ApiError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=str(exc)
        ) from exc


@router.get("/mastery", response_model=PlayerMasteryResponse)
@limiter.limit(settings.rate_limit_player_lookup)
async def get_player_mastery(
    request: Request,
    game_name: str,
    tag_line: str,
    region: str | None = None,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Aba Maestria (Sprint 4 bloco 3, 16/08) — estrutura base, prioridade
    baixa. Endpoint próprio em vez de embutido em `/player/lookup`: quem
    nunca abre essa aba não gasta a chamada extra de Champion Mastery V4.
    Mesmo gate e mesmo nível de rate limit de `/player/lookup` — também
    chama a Riot por request.

    Sprint do selo Monochampion (16/08): ganhou `db` — grava/lê o
    histórico de concentração de maestria (`PlayerChampionMasterySnapshot`,
    chaveado por PUUID, retenção própria de 30 dias — ver emenda em
    `06_SEGURANCA_PRIVACIDADE.md` §7)."""
    ensure_riot_proxy_enabled()
    try:
        return await player_mastery_service.get_top_mastery(
            db, game_name, tag_line, region, settings
        )
    except ApiError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=str(exc)
        ) from exc


@router.delete("/roadmap", response_model=PlayerRoadmapDeleteResponse)
@limiter.limit(settings.rate_limit_player_lookup)
def delete_player_roadmap(
    request: Request,
    game_name: str,
    tag_line: str,
    roadmap_token: str,
    region: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Mecanismo de exclusão manual obrigatório do Roadmap de Progressão
    do Jogador (rodada 28) — retenção sem prazo fixo, ver emenda ao doc
    de privacidade §7. Deliberadamente SEM `ensure_riot_proxy_enabled()`:
    é operação de banco pura, sem chamada Riot, e precisa funcionar mesmo
    com o gate fechado (produção hoje) — não "corrigir" isso pra bater
    com o gate do GET acima.

    Sem OAuth, não prova posse da conta — mesmo Riot ID digitado que já
    identifica o jogador no `/lookup`, decisão consciente. Rate limit no
    mesmo nível do `/lookup` (não o default), por ser uma operação
    irreversível, não uma leitura casual.

    Revisão técnica 09/08 §2.3: `roadmap_token` opaco (devolvido em
    `PlayerRoadmapSummary.roadmap_token`, guardado no `localStorage` do
    frontend) reduz o risco de graça — quem não souber o token de alguém
    não apaga o roadmap dela. Auditoria 16/08 (achado verificado direto
    no código, reaberto com severidade maior de 09/08): o parâmetro era
    opcional, e omitido apagava sem checar — Riot ID é público, então
    bastava saber o nome#tag pra apagar o roadmap de qualquer um. Agora
    é obrigatório: sem `roadmap_token` na query string, o FastAPI recusa
    a requisição com 422 antes mesmo de chegar aqui."""
    deleted = player_roadmap_service.delete_roadmap(
        db, game_name, tag_line, region, roadmap_token
    )
    return {"deleted": deleted}
