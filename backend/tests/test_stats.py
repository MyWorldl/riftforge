"""Wilson lower bound e percentil: matemática pura, validada contra valores
de referência citados em Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4.1."""

from app.core.stats import percentile_rank, wilson_lower_bound


def test_wilson_matches_known_reference_value():
    # p=0.5, n=100, z=1.96 -> ~0.404 (referência padrão do método)
    assert round(wilson_lower_bound(50, 100, 1.96), 3) == 0.404


def test_wilson_handles_zero_matches():
    assert wilson_lower_bound(0, 0, 1.96) == 0.0


def test_wilson_penalizes_small_sample_more_than_large_sample():
    same_raw_rate_small_n = wilson_lower_bound(31, 50, 1.96)
    same_raw_rate_large_n = wilson_lower_bound(3100, 5000, 1.96)
    assert same_raw_rate_small_n < same_raw_rate_large_n


def test_percentile_rank_extremes():
    values = [10, 20, 30, 40, 50]
    assert percentile_rank(values, 10) == 10.0  # menor valor do grupo
    assert percentile_rank(values, 50) == 90.0  # maior valor do grupo


def test_percentile_rank_ties_split_the_difference():
    values = [10, 10, 10]
    assert percentile_rank(values, 10) == 50.0


def test_percentile_rank_empty_group():
    assert percentile_rank([], 42) == 0.0
