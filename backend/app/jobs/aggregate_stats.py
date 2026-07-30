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


def _resolve_champion_names(data_dragon: DataDragonAdapter, version_prefix: str) -> dict[int, str]:
    versions = asyncio.run(data_dragon.get_versions())
    version = next((v for v in versions if v.startswith(version_prefix)), versions[0])
    return asyncio.run(data_dragon.get_champion_name_by_riot_id(version))


def aggregate() -> dict:
    init_db()
    data_dragon = DataDragonAdapter()
    session = SessionLocal()
    try:
        patches = session.query(Patch).all()
        elo_tiers = {row[0] for row in session.query(MatchParticipant.elo_tier).distinct().all()}

        session.query(ChampionLaneStat).delete()
        session.query(ChampionBanStat).delete()
        session.query(SegmentTotal).delete()

        totals = {"patches": 0, "lane_rows": 0, "ban_rows": 0}

        for patch in patches:
            name_by_id = _resolve_champion_names(data_dragon, patch.version_label)
            patch_touched = False

            for tier in elo_tiers:
                participants = (
                    session.query(MatchParticipant)
                    .join(Match, Match.match_id == MatchParticipant.match_id)
                    .filter(Match.patch_id == patch.id, MatchParticipant.elo_tier == tier)
                    .all()
                )
                if not participants:
                    continue
                patch_touched = True

                match_ids = {p.match_id for p in participants}
                session.add(SegmentTotal(patch=patch.version_label, tier=tier, total_matches=len(match_ids)))

                # `match_bans` não guarda o nome do campeão, só o ID numérico.
                # Sem este mapa, um campeão fora do Data Dragon daquele patch
                # cairia no nome bruto nas lane stats e no ID numérico nos
                # bans — duas identidades para o mesmo campeão.
                raw_name_by_id = {p.riot_champion_id: p.champion_name for p in participants}

                lane_agg: dict[tuple[str, str], dict] = {}
                for p in participants:
                    champion_name = resolve_champion_id(name_by_id, p.riot_champion_id, p.champion_name)
                    lane = p.resolved_position or "UNKNOWN"
                    row = lane_agg.setdefault(
                        (lane, champion_name),
                        {"games": 0, "wins": 0, "kills": 0, "deaths": 0, "assists": 0},
                    )
                    row["games"] += 1
                    row["wins"] += int(p.win)
                    row["kills"] += p.kills
                    row["deaths"] += p.deaths
                    row["assists"] += p.assists

                for (lane, champion_name), agg in lane_agg.items():
                    session.add(
                        ChampionLaneStat(
                            patch=patch.version_label, tier=tier, lane=lane, champion_id=champion_name, **agg
                        )
                    )
                    totals["lane_rows"] += 1

                bans = session.query(MatchBan).filter(MatchBan.match_id.in_(match_ids)).all()
                ban_agg: dict[str, int] = {}
                for b in bans:
                    champion_name = resolve_champion_id(
                        name_by_id, b.riot_champion_id, raw_name_by_id.get(b.riot_champion_id)
                    )
                    ban_agg[champion_name] = ban_agg.get(champion_name, 0) + 1

                for champion_name, count in ban_agg.items():
                    session.add(
                        ChampionBanStat(patch=patch.version_label, tier=tier, champion_id=champion_name, bans=count)
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
    print(
        f"Agregação concluída: {result['patches']} patch(es), "
        f"{result['lane_rows']} linhas de lane stat, {result['ban_rows']} linhas de ban stat."
    )


if __name__ == "__main__":
    main()
