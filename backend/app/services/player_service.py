from riotwatcher import ApiError
from sqlalchemy.orm import Session

from app.adapters.riot_api import PLATFORM_TO_CONTINENT
from app.core.adapters import data_dragon, riot_api
from app.core.cache import cached
from app.core.champions import resolve_champion_id
from app.core.config import get_settings
from app.repositories.baseline_repository import BaselineRepository
from app.repositories.champion_score_repository import ChampionScoreRepository

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
        entries = riot_api.get_league_entries_by_puuid(puuid, platform_region=platform_region)
    except ApiError:
        return _DEFAULT_ELO_TIER, False

    solo_entry = next((e for e in entries if e.get("queueType") == _RANKED_SOLO_QUEUE), None)
    if solo_entry is None:
        return _DEFAULT_ELO_TIER, False
    return solo_entry["tier"], True


async def lookup_player(
    db: Session, game_name: str, tag_line: str, region: str | None, elo_tier: str | None
) -> dict:
    """"Análise do Jogador" — busca sob demanda de um jogador por Riot ID
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
    cacheada em vez de `asyncio.run()` duplicado sem cache a cada request."""
    continent = PLATFORM_TO_CONTINENT.get(region.lower()) if region else None

    account = riot_api.get_account_by_riot_id(game_name, tag_line, continent_region=continent)
    puuid = account["puuid"]

    elo_tier_detectado = False
    if elo_tier is None:
        elo_tier, elo_tier_detectado = _detect_elo_tier(puuid, platform_region=region)

    match_ids = riot_api.get_match_ids_by_puuid(
        puuid, count=get_settings().player_lookup_recent_matches, continent_region=continent
    )
    matches = [riot_api.get_match(match_id, continent_region=continent) for match_id in match_ids]

    version = await cached("ddragon:version", data_dragon.get_latest_version)
    name_by_riot_id = await cached(
        f"ddragon:name_by_riot_id:{version}",
        lambda: data_dragon.get_champion_name_by_riot_id(version),
    )

    tally: dict[tuple[str, str], dict] = {}
    for match in matches:
        participant = next((p for p in match["info"]["participants"] if p["puuid"] == puuid), None)
        if participant is None:
            continue
        champion_id = resolve_champion_id(
            name_by_riot_id, participant["championId"], participant.get("championName")
        )
        lane = participant.get("teamPosition") or "UNKNOWN"
        entry = tally.setdefault(
            (champion_id, lane), {"partidas": 0, "vitorias": 0, "kills": 0, "deaths": 0, "assists": 0}
        )
        entry["partidas"] += 1
        entry["vitorias"] += 1 if participant.get("win") else 0
        entry["kills"] += participant.get("kills", 0)
        entry["deaths"] += participant.get("deaths", 0)
        entry["assists"] += participant.get("assists", 0)

    score_by_key = ChampionScoreRepository(db).list_latest_by_champion_lane_keys(set(tally.keys()), elo_tier)
    baseline_repo = BaselineRepository(db)

    campeoes = []
    for (champion_id, lane), stats in sorted(tally.items(), key=lambda kv: -kv[1]["partidas"]):
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
            baseline = baseline_repo.get(score_row.patch, elo_tier, lane)
            if baseline is not None and baseline.media_wr > 0:
                comparativo_baseline = {
                    "win_rate_jogador": round(win_rate, 4),
                    "win_rate_medio_elo": round(baseline.media_wr, 4),
                    "delta_pct": round((win_rate - baseline.media_wr) / baseline.media_wr * 100, 1),
                }

        campeoes.append(
            {
                "champion_id": champion_id,
                "lane": lane,
                "partidas": stats["partidas"],
                "vitorias": stats["vitorias"],
                "kda_medio": round((stats["kills"] + stats["assists"]) / max(stats["deaths"], 1), 2),
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

    return {
        "game_name": account.get("gameName", game_name),
        "tag_line": account.get("tagLine", tag_line),
        "elo_tier_comparado": elo_tier,
        "elo_tier_detectado": elo_tier_detectado,
        "partidas_analisadas": len(matches),
        "campeoes": campeoes,
    }
