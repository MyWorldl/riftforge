import asyncio

from riotwatcher import ApiError
from sqlalchemy.orm import Session

from app.adapters.riot_api import PLATFORM_TO_CONTINENT
from app.core.adapters import data_dragon, riot_api
from app.core.cache import cached
from app.core.champions import resolve_champion_id
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.repositories.baseline_repository import BaselineRepository
from app.repositories.champion_score_repository import ChampionScoreRepository
from app.services.player_roadmap_service import (
    normalize_region,
    resolve_identity,
    sync_roadmap_steps,
)

log = get_logger(__name__)

_DEFAULT_ELO_TIER = "GOLD"
_RANKED_SOLO_QUEUE = "RANKED_SOLO_5x5"


def _detect_elo_tier(puuid: str, platform_region: str | None) -> tuple[str, bool]:
    """Revisão técnica §5.3: antes disso, `elo_tier_comparado` vinha sempre
    fixo em GOLD quando o chamador não passava um filtro — mesmo pra um
    jogador Platina ou Ferro de verdade, o que tornava a comparação de
    score enganosa. Tenta League-V4 por PUUID primeiro; sem entrada
    ranqueada em Solo/Duo (jogador não ranqueado, ou erro da API), cai pro
    default documentado em vez de propagar a falha — "Análise do Jogador"
    não deve quebrar só porque a detecção de elo não deu certo."""
    try:
        entries = riot_api.get_league_entries_by_puuid(
            puuid, platform_region=platform_region
        )
    except ApiError:
        return _DEFAULT_ELO_TIER, False

    solo_entry = next(
        (e for e in entries if e.get("queueType") == _RANKED_SOLO_QUEUE), None
    )
    if solo_entry is None:
        return _DEFAULT_ELO_TIER, False
    return solo_entry["tier"], True


async def _fetch_matches_tolerant(
    match_ids: list[str], riot_api_adapter, continent: str | None
) -> list[dict]:
    """Auditoria 16/08 (achado verificado direto no código): antes,
    `asyncio.gather` sem `return_exceptions=True` deixava uma única
    partida indisponível na Riot (404 — já saiu do cache deles; 429/503
    — instabilidade transitória) derrubar `lookup_player` inteiro com
    uma exceção não tratada, em vez de simplesmente analisar com uma
    partida a menos. `ApiError` é engolido (com log); qualquer outra
    exceção é genuinamente inesperada e continua propagando — extraído
    numa função própria pra ser testável sem mockar o pipeline inteiro
    de `lookup_player`."""
    results = await asyncio.gather(
        *[
            asyncio.to_thread(
                riot_api_adapter.get_match, match_id, continent_region=continent
            )
            for match_id in match_ids
        ],
        return_exceptions=True,
    )
    matches = []
    for match_id, result in zip(match_ids, results):
        if isinstance(result, ApiError):
            log.warning("partida_indisponivel", match_id=match_id, erro=str(result))
            continue
        if isinstance(result, BaseException):
            raise result
        matches.append(result)
    return matches


async def lookup_player(
    db: Session,
    game_name: str,
    tag_line: str,
    region: str | None,
    elo_tier: str | None,
    settings: Settings | None = None,
) -> dict:
    """ "Análise do Jogador" — busca sob demanda de um jogador por Riot ID
    (`Nome#Tag`). Diferente do resto do backend, chama a Riot API por
    requisição (Account-V1 → Match-V5) — o gate `ensure_riot_proxy_enabled()`
    já foi checado pelo router antes de chamar isto.

    `region` é a região de plataforma escolhida na Home, resolvida pro
    continente que Account-V1/Match-V5 exigem via `PLATFORM_TO_CONTINENT`.

    `elo_tier` explícito (filtro manual na Home) sempre vence; `None`
    aciona a detecção via League-V4 (`_detect_elo_tier`), item 5.3 da
    revisão técnica.

    Item 1.1/1.2 (revisão técnica): resolve o score de cada
    `(champion_id, lane)` numa query só (`list_latest_by_champion_lane_keys`,
    era uma query por campeão dentro do loop) e usa a versão do Data Dragon
    cacheada em vez de `asyncio.run()` duplicado sem cache a cada request.

    Rodada 28 ("Roadmap de Progressão do Jogador"): esta função ganhou um
    efeito colateral de escrita — o fim dela sincroniza
    `player_roadmap_steps` via `sync_roadmap_steps` (sem chamada Riot
    extra, reaproveita `campeoes` já montado). Deixou de ser só leitura.

    Revisão técnica 09/08 §1.1: `async def` com chamadas Riot síncronas
    por baixo (`riotwatcher` usa `requests`) travava o event loop inteiro
    por vários segundos a cada lookup — nenhum outro request (nem
    `/health`) era atendido enquanto isso. As chamadas bloqueantes agora
    rodam em `asyncio.to_thread`, e as `player_lookup_recent_matches`
    partidas são buscadas em paralelo via `_fetch_matches_tolerant`
    (auditoria 16/08: uma partida indisponível não derruba mais as
    outras) em vez de um loop serial.

    Revisão técnica §4.2 (Sprint A item 1): `settings` opcional, injetado
    pelo router via `Depends(get_settings)` — omitido, cai no singleton de
    sempre. Propagado pra `sync_roadmap_steps` abaixo, mesmo motivo."""
    settings = settings or get_settings()
    # Item novo (filtro de região, piloto br1+euw1): mesma região escolhida
    # pro lookup real na Riot também escopa a comparação contra
    # `ChampionScore`/`Baseline` abaixo — comparar as partidas de um
    # jogador de `euw1` contra uma baseline de `br1` seria uma comparação
    # sem sentido, mesmo que os dois já existam algum dia.
    score_region = normalize_region(region)
    continent = PLATFORM_TO_CONTINENT.get(score_region) if region else None

    account = await asyncio.to_thread(
        riot_api.get_account_by_riot_id, game_name, tag_line, continent_region=continent
    )
    puuid = account["puuid"]

    elo_tier_detectado = False
    if elo_tier is None:
        # Revisão técnica §1.8: usava `region` cru aqui enquanto a
        # comparação de score (linha acima) já usava `score_region`
        # normalizado — mesma classe de bug que `normalize_region()` foi
        # criada pra eliminar. Hoje inofensivo (frontend só emite
        # minúsculas), mas os dois precisam concordar sempre.
        elo_tier, elo_tier_detectado = await asyncio.to_thread(
            _detect_elo_tier, puuid, platform_region=score_region
        )

    match_ids = await asyncio.to_thread(
        riot_api.get_match_ids_by_puuid,
        puuid,
        count=settings.player_lookup_recent_matches,
        continent_region=continent,
    )
    matches = await _fetch_matches_tolerant(match_ids, riot_api, continent)

    version = await cached("ddragon:version", data_dragon.get_latest_version)
    name_by_riot_id = await cached(
        f"ddragon:name_by_riot_id:{version}",
        lambda: data_dragon.get_champion_name_by_riot_id(version),
    )

    tally: dict[tuple[str, str], dict] = {}
    for match in matches:
        participant = next(
            (p for p in match["info"]["participants"] if p["puuid"] == puuid), None
        )
        if participant is None:
            continue
        champion_id = resolve_champion_id(
            name_by_riot_id, participant["championId"], participant.get("championName")
        )
        lane = participant.get("teamPosition") or "UNKNOWN"
        entry = tally.setdefault(
            (champion_id, lane),
            {"partidas": 0, "vitorias": 0, "kills": 0, "deaths": 0, "assists": 0},
        )
        entry["partidas"] += 1
        entry["vitorias"] += 1 if participant.get("win") else 0
        entry["kills"] += participant.get("kills", 0)
        entry["deaths"] += participant.get("deaths", 0)
        entry["assists"] += participant.get("assists", 0)

    score_by_key = ChampionScoreRepository(db).list_latest_by_champion_lane_keys(
        set(tally.keys()), elo_tier, score_region
    )
    baseline_repo = BaselineRepository(db)

    campeoes = []
    for (champion_id, lane), stats in sorted(
        tally.items(), key=lambda kv: -kv[1]["partidas"]
    ):
        score_row = score_by_key.get((champion_id, lane))
        win_rate = stats["vitorias"] / stats["partidas"]

        # Revisão técnica §5.3: compara o win rate observado nessas
        # partidas contra a média (aparada) do grupo (patch, elo, rota) já
        # calculada por `compute_baselines.py` — mesma baseline usada na
        # Camada 1 do score, então "X% acima/abaixo da média do elo" é
        # consistente com o que o próprio score já enxerga. Só existe
        # quando há score calculado (`score_row`) pra saber qual patch
        # comparar, e quando a baseline daquele grupo tem desvio > 0.
        comparativo_baseline = None
        if score_row is not None:
            baseline = baseline_repo.get(score_row.patch, elo_tier, lane, score_region)
            if baseline is not None and baseline.media_wr > 0:
                comparativo_baseline = {
                    "win_rate_jogador": round(win_rate, 4),
                    "win_rate_medio_elo": round(baseline.media_wr, 4),
                    "delta_pct": round(
                        (win_rate - baseline.media_wr) / baseline.media_wr * 100, 1
                    ),
                }

        campeoes.append(
            {
                "champion_id": champion_id,
                "lane": lane,
                "partidas": stats["partidas"],
                "vitorias": stats["vitorias"],
                "kda_medio": round(
                    (stats["kills"] + stats["assists"]) / max(stats["deaths"], 1), 2
                ),
                "score_atual": (
                    {
                        "patch": score_row.patch,
                        "score_final": score_row.score_final,
                        "score_tier": score_row.score_tier,
                        "tier_provisorio": score_row.tier_provisorio,
                    }
                    if score_row
                    else None
                ),
                "comparativo_baseline": comparativo_baseline,
            }
        )

    identity = resolve_identity(
        account.get("gameName", game_name),
        account.get("tagLine", tag_line),
        score_region,
    )
    roadmap = sync_roadmap_steps(db, identity, campeoes, settings)

    return {
        "game_name": account.get("gameName", game_name),
        "tag_line": account.get("tagLine", tag_line),
        "elo_tier_comparado": elo_tier,
        "elo_tier_detectado": elo_tier_detectado,
        "partidas_analisadas": len(matches),
        "campeoes": campeoes,
        "roadmap": roadmap,
    }
