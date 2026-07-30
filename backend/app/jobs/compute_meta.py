"""Sétimo estágio do pipeline (Core Fase 1, item 1.4): Camada 4 do score —
Contexto de Meta (Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §7).

    Meta = 0.60*Nota_Cobertura + 0.40*Nota_Tendencia

Lê `champion_performance_scores` (Camada 1) e `patches.patch_sequence` —
não chama a Riot nem o Data Dragon.

Cobertura é uma propriedade do **grupo** (patch, tier, lane), não do
campeão individual: "número de top-10 picks da rota com WR >= 50%" descreve
a saúde do metagame ao redor de todos os campeões daquela rota. Todo
campeão do grupo recebe a mesma `nota_cobertura` — mesmo princípio já usado
para o percentil de ban rate na Camada 1 (Core §15_SCHEMA_DADOS.md §13).

Tendência é por campeão: inclinação de uma regressão linear simples sobre
o `performance_score` do próprio campeão nos últimos até 3 patches
disponíveis. O documento não dá fórmula explícita de normalização para
"slope_normalizado" — a interpretação usada aqui é percentil da inclinação
bruta dentro do grupo (patch, tier, lane), a mesma técnica já usada nas
Camadas 1 e 3 para normalizar deltas sem escala natural. Sob essa
normalização, `Nota_Tendencia = 50 + ((percentil-50)/50)*50` simplifica
algebricamente para `Nota_Tendencia = percentil` — é assim que está
implementado.

Uso: python -m app.jobs.compute_meta
"""

from collections import defaultdict

from app.core.stats import percentile_rank
from app.db.models import ChampionMetaContext, ChampionPerformanceScore, Patch
from app.db.session import SessionLocal, init_db

TOP_N_COBERTURA = 10


def _linear_slope(points: list[tuple[int, float]]) -> float | None:
    """Regressão linear simples (x=patch_sequence, y=performance_score).
    None com menos de 2 pontos — sem tendência possível."""
    n = len(points)
    if n < 2:
        return None
    x_mean = sum(x for x, _ in points) / n
    y_mean = sum(y for _, y in points) / n
    denominator = sum((x - x_mean) ** 2 for x, _ in points)
    if denominator == 0:
        return 0.0
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in points)
    return numerator / denominator


def compute() -> dict:
    init_db()
    session = SessionLocal()
    try:
        session.query(ChampionMetaContext).delete()

        patch_sequence = {p.version_label: p.patch_sequence for p in session.query(Patch).all()}
        performance_rows = session.query(ChampionPerformanceScore).all()

        by_group: dict[tuple[str, str, str], list[ChampionPerformanceScore]] = defaultdict(list)
        history_by_champion: dict[tuple[str, str, str], list[tuple[int, float]]] = defaultdict(list)

        for row in performance_rows:
            by_group[(row.patch, row.tier, row.lane)].append(row)
            seq = patch_sequence.get(row.patch, 0)
            history_by_champion[(row.tier, row.lane, row.champion_id)].append((seq, row.performance_score))

        created = 0
        for (patch, tier, lane), group_rows in by_group.items():
            top_picks = sorted(group_rows, key=lambda r: r.pick_rate, reverse=True)[:TOP_N_COBERTURA]
            cobertura_count = sum(1 for r in top_picks if r.win_rate_raw >= 0.50)
            cobertura = cobertura_count / TOP_N_COBERTURA
            nota_cobertura = cobertura * 100

            current_seq = patch_sequence.get(patch, 0)
            slope_by_champion: dict[str, float] = {}
            patches_usados_by_champion: dict[str, int] = {}

            for row in group_rows:
                history = sorted(history_by_champion[(tier, lane, row.champion_id)], key=lambda pt: pt[0])
                relevant = [pt for pt in history if pt[0] <= current_seq][-3:]
                slope = _linear_slope(relevant)
                slope_by_champion[row.champion_id] = slope if slope is not None else 0.0
                patches_usados_by_champion[row.champion_id] = len(relevant)

            slope_values = list(slope_by_champion.values())

            for row in group_rows:
                slope = slope_by_champion[row.champion_id]
                nota_tendencia = percentile_rank(slope_values, slope)
                meta_score = 0.60 * nota_cobertura + 0.40 * nota_tendencia

                session.add(
                    ChampionMetaContext(
                        patch=patch,
                        tier=tier,
                        lane=lane,
                        champion_id=row.champion_id,
                        cobertura=cobertura,
                        nota_cobertura=nota_cobertura,
                        slope_performance=slope,
                        patches_usados_tendencia=patches_usados_by_champion[row.champion_id],
                        nota_tendencia=nota_tendencia,
                        meta_score=meta_score,
                    )
                )
                created += 1

        session.commit()
    finally:
        session.close()

    return {"linhas_criadas": created}


def main() -> None:
    result = compute()
    print(f"Camada 4 (Meta) calculada: {result['linhas_criadas']} linhas.")


if __name__ == "__main__":
    main()
