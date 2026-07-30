"""Quarto estágio do pipeline (Core Fase 1, item 1.1): Camada 1 do score —
Performance Real (Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4).

    Performance = 0.65*Nota_WR + 0.25*Nota_Presenca + 0.10*Nota_KDA

Lê de champion_lane_stats / champion_ban_stats / segment_totals / baselines
(saída dos três estágios anteriores), nunca chama a Riot. Ainda não é o
score final — faltam as camadas de Kit (25%), Build (25%) e Meta (10%), ver
§8 do mesmo documento. Este estágio produz só a Camada 1, persistida em
champion_performance_scores.

Resolve um item em aberto (Core/Estrutura_roadmap/15_SCHEMA_DADOS.md §13):
bans não têm rota própria (ocorrem antes da seleção de posição). Ban rate e
seu percentil são calculados por (patch, tier) — todas as instâncias por
rota de um mesmo campeão nesse patch/elo recebem a mesma nota de ban. Pick
rate, que já é naturalmente por rota, tem percentil calculado dentro de
(patch, tier, lane), assim como KDA.

Uso: python -m app.jobs.compute_performance
"""

import math
from collections import defaultdict
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.stats import percentile_rank as _percentile_rank
from app.core.stats import wilson_lower_bound
from app.db.models import (
    Baseline,
    ChampionBanStat,
    ChampionLaneStat,
    ChampionPerformanceScore,
    SegmentTotal,
)
from app.db.session import SessionLocal, init_db

MODEL_VERSION = "performance_v1"


def _logistic_nota(z: float, fator: float) -> float:
    return 100 / (1 + math.exp(-fator * z))


def compute() -> dict:
    settings = get_settings()
    init_db()

    session = SessionLocal()
    try:
        session.query(ChampionPerformanceScore).delete()

        lane_rows = session.query(ChampionLaneStat).all()
        baselines = {(b.patch, b.tier, b.lane): b for b in session.query(Baseline).all()}
        segment_totals = {(s.patch, s.tier): s.total_matches for s in session.query(SegmentTotal).all()}
        ban_stats = {(b.patch, b.tier, b.champion_id): b.bans for b in session.query(ChampionBanStat).all()}

        # Universo de campeões por (patch, tier) — necessário porque ban rate
        # não é segmentado por rota (ver docstring do módulo).
        champions_by_patch_tier: dict[tuple[str, str], set[str]] = defaultdict(set)
        for row in lane_rows:
            champions_by_patch_tier[(row.patch, row.tier)].add(row.champion_id)
        for patch, tier, champion_id in ban_stats:
            champions_by_patch_tier[(patch, tier)].add(champion_id)

        ban_rate_by_group: dict[tuple[str, str], dict[str, float]] = {}
        for (patch, tier), champions in champions_by_patch_tier.items():
            total = segment_totals.get((patch, tier), 0)
            ban_rate_by_group[(patch, tier)] = {
                champion_id: (ban_stats.get((patch, tier, champion_id), 0) / total if total else 0.0)
                for champion_id in champions
            }

        by_lane_group: dict[tuple[str, str, str], list[ChampionLaneStat]] = defaultdict(list)
        for row in lane_rows:
            by_lane_group[(row.patch, row.tier, row.lane)].append(row)

        created = 0
        for group_key, rows in by_lane_group.items():
            patch, tier, lane = group_key
            total_matches = segment_totals.get((patch, tier), 0)
            ban_rates = ban_rate_by_group.get((patch, tier), {})
            baseline = baselines.get(group_key)

            pick_rates = [(row.games / total_matches if total_matches else 0.0) for row in rows]
            kdas = [(row.kills + row.assists) / max(row.deaths, 1) for row in rows]
            ban_rate_values = list(ban_rates.values())

            for row, pick_rate, kda in zip(rows, pick_rates, kdas):
                wr_adjusted = wilson_lower_bound(row.wins, row.games, settings.wilson_z)

                if baseline and baseline.desvio_wr > 0:
                    z_wr = (wr_adjusted - baseline.media_wr) / baseline.desvio_wr
                else:
                    # Sem baseline ou desvio zero (grupo com 1 campeão só):
                    # sem sinal relativo, trata como neutro (z=0 -> nota 50).
                    z_wr = 0.0
                nota_wr = _logistic_nota(z_wr, settings.performance_fator_logistico)

                ban_rate = ban_rates.get(row.champion_id, 0.0)
                nota_ban = _percentile_rank(ban_rate_values, ban_rate)
                nota_pick = _percentile_rank(pick_rates, pick_rate)
                nota_presenca = 0.60 * nota_ban + 0.40 * nota_pick

                nota_kda = _percentile_rank(kdas, kda)

                performance_score = 0.65 * nota_wr + 0.25 * nota_presenca + 0.10 * nota_kda

                session.add(
                    ChampionPerformanceScore(
                        patch=patch,
                        tier=tier,
                        lane=lane,
                        champion_id=row.champion_id,
                        n_matches=row.games,
                        win_rate_raw=(row.wins / row.games if row.games else 0.0),
                        win_rate_adjusted=wr_adjusted,
                        pick_rate=pick_rate,
                        ban_rate=ban_rate,
                        kda_avg=kda,
                        nota_wr=nota_wr,
                        nota_presenca=nota_presenca,
                        nota_kda=nota_kda,
                        performance_score=performance_score,
                        model_version=MODEL_VERSION,
                        computed_at=datetime.now(timezone.utc),
                    )
                )
                created += 1

        session.commit()
    finally:
        session.close()

    return {"linhas_criadas": created}


def main() -> None:
    result = compute()
    print(f"Camada 1 (Performance Real) calculada: {result['linhas_criadas']} linhas.")


if __name__ == "__main__":
    main()
