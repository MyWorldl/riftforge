"""_assign_tier: matemática pura, validada contra as faixas exatas de
Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §9. _trap_flag: os dois
padrões independentes do selo "Trap" (item 1.7 + auditoria 16/08 §3.7)."""

from app.jobs.compute_scores import _assign_tier, _trap_flag


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


def test_trap_flag_presenca_alta_wr_baixo():
    # Padrão original (item 1.7): muito jogado, desempenho abaixo do
    # esperado — nem toca no padrão novo (win_rate_raw normal).
    assert _trap_flag(
        nota_presenca=75, z_wr=-0.6, win_rate_raw=0.50, win_rate_adjusted=0.49
    )


def test_trap_flag_vies_de_amostra():
    # Auditoria 16/08 §3.7: win rate bruto parece forte (>53%), mas o
    # piso de Wilson já nem bate 50% — só acontece com amostra pequena.
    # nota_presenca/z_wr normais, não deveriam disparar o padrão original.
    assert _trap_flag(
        nota_presenca=40, z_wr=0.2, win_rate_raw=0.56, win_rate_adjusted=0.48
    )


def test_trap_flag_false_when_neither_pattern_matches():
    assert not _trap_flag(
        nota_presenca=40, z_wr=0.2, win_rate_raw=0.52, win_rate_adjusted=0.51
    )


def test_trap_flag_vies_de_amostra_boundary_not_triggered_at_exact_threshold():
    # >53%/<50% são estritos — exatamente no limiar não marca o selo,
    # mesma convenção de _assign_tier (limiar inclusivo só de um lado).
    assert not _trap_flag(
        nota_presenca=40, z_wr=0.2, win_rate_raw=0.53, win_rate_adjusted=0.50
    )
