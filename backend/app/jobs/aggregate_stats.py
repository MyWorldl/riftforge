"""Estágio de agregação do pipeline (Core Fase 0/1).

Calcula win/pick/ban/KDA por (campeão, rota, elo, patch) a partir das
partidas já persistidas por `ingest_matches.py` — nunca chama a Riot API
(Core/Estrutura_roadmap/05_BOAS_PRATICAS_CODIGO.md §9). Por isso pode ser
rerodado quantas vezes for preciso (ex: depois de corrigir identificação de
rota) sem recoletar nada.

Recalcula do zero champion_lane_stats/champion_ban_stats/segment_totals —
o mesmo "placar cru" que a v0 já expunha, agora reprocessável a partir de
dado persistido em vez de calculado inline durante a coleta. Ainda não são
as tabelas de score por camada de
Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md — essas dependem da tabela
de baselines (item 0.6 do backlog), que vem depois deste estágio.

Resolve riot_champion_id -> id estável do Data Dragon (nunca o
`championName` bruto do Match-V5, que diverge do ddragon em campeões com
apóstrofo — ex.: "Kai'Sa" vs "Kaisa" — o que quebrava o cruzamento de nome/
imagem no frontend).

Uso: python -m app.jobs.aggregate_stats
"""

import asyncio

from app.adapters.data_dragon import DataDragonAdapter
from app.core.champions import resolve_champion_id
from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.db.models import (
    ChampionBanStat,
    ChampionLaneStat,
    Match,
    MatchBan,
    MatchParticipant,
    Patch,
    SegmentTotal,
)
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def _resolve_champion_names(
    data_dragon: DataDragonAdapter, version_prefix: str
) -> dict[int, str]:
    versions = asyncio.run(data_dragon.get_versions())
    version = next((v for v in versions if v.startswith(version_prefix)), versions[0])
    return asyncio.run(data_dragon.get_champion_name_by_riot_id(version))


def aggregate() -> dict:
    new_correlation_id()
    init_db()
    data_dragon = DataDragonAdapter()
    session = SessionLocal()
    # Item novo (filtro de região, piloto br1+euw1): mesmo padrão de
    # `collect_rankings.py` — loop de região por fora, delete escopado por
    # região (nunca mais wipe da tabela inteira, senão rerodar pra uma
    # região apagaria o dado já calculado das outras).
    regioes = [
        r.strip()
        for r in get_settings().pipeline_platform_regions.split(",")
        if r.strip()
    ]
    try:
        patches = session.query(Patch).all()
        elo_tiers = {
            row[0] for row in session.query(MatchParticipant.elo_tier).distinct().all()
        }

        for region in regioes:
            session.query(ChampionLaneStat).filter_by(region=region).delete()
            session.query(ChampionBanStat).filter_by(region=region).delete()
            session.query(SegmentTotal).filter_by(region=region).delete()

        totals = {"patches": 0, "lane_rows": 0, "ban_rows": 0}

        for patch in patches:
            # Independe de região — Data Dragon é a mesma fonte pra todo
            # mundo, resolvido uma vez por patch em vez de uma vez por
            # (patch, região).
            name_by_id = _resolve_champion_names(data_dragon, patch.version_label)
            patch_touched = False

            for region in regioes:
                for tier in elo_tiers:
                    participants = (
                        session.query(MatchParticipant)
                        .join(Match, Match.match_id == MatchParticipant.match_id)
                        .filter(
                            Match.patch_id == patch.id,
                            Match.platform_region == region,
                            MatchParticipant.elo_tier == tier,
                            # Auditoria 16/08 (achado verificado direto no
                            # código): `game_duration_s` é gravado desde a
                            # Fase 0, mas nenhum job de agregação filtrava
                            # por ele — uma partida encerrada aos 3 minutos
                            # (AFK, desconexão no carregamento) contava
                            # vitória/derrota real de 10 campeões. 300s é o
                            # limiar padrão do nicho pra "remake"; bans
                            # herdam o filtro de graça (via `match_ids`
                            # abaixo, derivado destes `participants`).
                            Match.game_duration_s > 300,
                        )
                        .all()
                    )
                    if not participants:
                        continue
                    patch_touched = True

                    match_ids = {p.match_id for p in participants}
                    session.add(
                        SegmentTotal(
                            patch=patch.version_label,
                            tier=tier,
                            region=region,
                            total_matches=len(match_ids),
                        )
                    )

                    # `match_bans` não guarda o nome do campeão, só o ID numérico.
                    # Sem este mapa, um campeão fora do Data Dragon daquele patch
                    # cairia no nome bruto nas lane stats e no ID numérico nos
                    # bans — duas identidades para o mesmo campeão.
                    raw_name_by_id = {
                        p.riot_champion_id: p.champion_name for p in participants
                    }

                    lane_agg: dict[tuple[str, str], dict] = {}
                    for p in participants:
                        champion_name = resolve_champion_id(
                            name_by_id, p.riot_champion_id, p.champion_name
                        )
                        lane = p.resolved_position or "UNKNOWN"
                        row = lane_agg.setdefault(
                            (lane, champion_name),
                            {
                                "games": 0,
                                "wins": 0,
                                "kills": 0,
                                "deaths": 0,
                                "assists": 0,
                            },
                        )
                        row["games"] += 1
                        row["wins"] += int(p.win)
                        row["kills"] += p.kills
                        row["deaths"] += p.deaths
                        row["assists"] += p.assists

                    for (lane, champion_name), agg in lane_agg.items():
                        session.add(
                            ChampionLaneStat(
                                patch=patch.version_label,
                                tier=tier,
                                lane=lane,
                                champion_id=champion_name,
                                region=region,
                                **agg,
                            )
                        )
                        totals["lane_rows"] += 1

                    bans = (
                        session.query(MatchBan)
                        .filter(MatchBan.match_id.in_(match_ids))
                        .all()
                    )
                    ban_agg: dict[str, int] = {}
                    for b in bans:
                        champion_name = resolve_champion_id(
                            name_by_id,
                            b.riot_champion_id,
                            raw_name_by_id.get(b.riot_champion_id),
                        )
                        ban_agg[champion_name] = ban_agg.get(champion_name, 0) + 1

                    for champion_name, count in ban_agg.items():
                        session.add(
                            ChampionBanStat(
                                patch=patch.version_label,
                                tier=tier,
                                champion_id=champion_name,
                                region=region,
                                bans=count,
                            )
                        )
                        totals["ban_rows"] += 1

            if patch_touched:
                totals["patches"] += 1

        session.commit()
    finally:
        session.close()

    return totals


def main() -> None:
    result = aggregate()
    log.info("job_concluido", job="aggregate_stats", **result)


if __name__ == "__main__":
    main()
