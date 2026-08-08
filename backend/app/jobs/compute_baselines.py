"""Terceiro estágio do pipeline (Core Fase 0, item 0.6): calcula baselines
(μ, σ) do win rate ajustado por (rota, elo, patch) — pré-requisito direto da
Camada 1 (Performance Real) do modelo de score
(Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4.1).

Lê só de `champion_lane_stats` (saída da agregação), nunca chama a Riot.
Recalcula do zero a cada execução — idempotente, como os estágios
anteriores.

Ajuste de win rate: limite inferior do intervalo de Wilson (penaliza amostra
pequena automaticamente). Baseline do grupo: média/desvio **aparados**
(Core/Estrutura_roadmap/16_BASELINES_CALIBRACAO.md §2) em vez de média/desvio
simples — um campeão God-tier é, por definição, um outlier que puxaria a
própria média do grupo para cima, comprimindo artificialmente o z-score de
todo mundo, incluindo o dele.

Uso: python -m app.jobs.compute_baselines
"""

import math

from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.core.stats import wilson_lower_bound
from app.db.models import Baseline, ChampionLaneStat
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def _trimmed_mean_std(values: list[float], trim_pct: float) -> tuple[float, float]:
    values = sorted(values)
    n = len(values)
    cut = int(n * trim_pct / 2)
    trimmed = values[cut : n - cut] if n - 2 * cut > 0 else values
    mean = sum(trimmed) / len(trimmed)
    variance = sum((v - mean) ** 2 for v in trimmed) / len(trimmed)
    return mean, math.sqrt(variance)


def compute() -> dict:
    new_correlation_id()
    settings = get_settings()
    init_db()
    # Item novo (filtro de região, piloto br1+euw1): `region` chega de
    # graça (herdado de `ChampionLaneStat.region`) — só precisa entrar na
    # chave do agrupamento e no delete escopado, mesmo padrão de
    # `collect_rankings.py`.
    regioes = [
        r.strip() for r in settings.pipeline_platform_regions.split(",") if r.strip()
    ]

    session = SessionLocal()
    try:
        for region in regioes:
            session.query(Baseline).filter_by(region=region).delete()

        groups: dict[tuple[str, str, str, str], list[float]] = {}
        for row in (
            session.query(ChampionLaneStat)
            .filter(ChampionLaneStat.region.in_(regioes))
            .all()
        ):
            wr_adjusted = wilson_lower_bound(row.wins, row.games, settings.wilson_z)
            groups.setdefault((row.patch, row.tier, row.lane, row.region), []).append(
                wr_adjusted
            )

        created = 0
        insufficient = 0
        for (patch, tier, lane, region), wr_values in groups.items():
            media, desvio = _trimmed_mean_std(wr_values, settings.baseline_trim_pct)
            confiavel = len(wr_values) >= settings.baseline_min_champions
            if not confiavel:
                insufficient += 1

            session.add(
                Baseline(
                    patch=patch,
                    tier=tier,
                    lane=lane,
                    region=region,
                    media_wr=media,
                    desvio_wr=desvio,
                    n_campeoes_amostra=len(wr_values),
                    amostra_confiavel=confiavel,
                )
            )
            created += 1

        session.commit()
    finally:
        session.close()

    return {"baselines_criados": created, "amostra_insuficiente": insufficient}


def main() -> None:
    result = compute()
    log.info("job_concluido", job="compute_baselines", **result)


if __name__ == "__main__":
    main()
