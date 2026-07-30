"""Curva logística: validada contra os valores de referência citados em
Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4.1."""

from app.jobs.compute_performance import _logistic_nota


def test_logistic_nota_matches_documented_reference_points():
    # z=0 -> nota 50, z=+2 -> ~90, z=-2 -> ~10 (fator_logistico=1.1)
    assert round(_logistic_nota(0, 1.1)) == 50
    assert round(_logistic_nota(2, 1.1)) == 90
    assert round(_logistic_nota(-2, 1.1)) == 10
