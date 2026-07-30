"""_assign_tier: matemática pura, validada contra as faixas exatas de
Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §9."""

from app.jobs.compute_scores import _assign_tier


def test_tier_boundaries_match_documented_ranges():
    assert _assign_tier(100) == "GOD"
    assert _assign_tier(90) == "GOD"
    assert _assign_tier(89.9) == "S"
    assert _assign_tier(78) == "S"
    assert _assign_tier(77.9) == "A"
    assert _assign_tier(65) == "A"
    assert _assign_tier(64.9) == "B"
    assert _assign_tier(50) == "B"
    assert _assign_tier(49.9) == "C"
    assert _assign_tier(35) == "C"
    assert _assign_tier(34.9) == "D"
    assert _assign_tier(20) == "D"
    assert _assign_tier(19.9) == "E"
    assert _assign_tier(5) == "E"


def test_tier_below_five_falls_back_to_e():
    # Não há tier definido abaixo de 5 — E é o piso.
    assert _assign_tier(0) == "E"
    assert _assign_tier(-10) == "E"
