"""Curva logística e percentil: validados contra os valores de referência
citados em Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4.1."""

from app.jobs.compute_performance import _logistic_nota, _percentile_rank


def test_logistic_nota_matches_documented_reference_points():
    # z=0 -> nota 50, z=+2 -> ~90, z=-2 -> ~10 (fator_logistico=1.1)
    assert round(_logistic_nota(0, 1.1)) == 50
    assert round(_logistic_nota(2, 1.1)) == 90
    assert round(_logistic_nota(-2, 1.1)) == 10


def test_percentile_rank_extremes():
    values = [10, 20, 30, 40, 50]
    assert _percentile_rank(values, 10) == 10.0  # menor valor do grupo
    assert _percentile_rank(values, 50) == 90.0  # maior valor do grupo


def test_percentile_rank_ties_split_the_difference():
    values = [10, 10, 10]
    assert _percentile_rank(values, 10) == 50.0


def test_percentile_rank_empty_group():
    assert _percentile_rank([], 42) == 0.0
