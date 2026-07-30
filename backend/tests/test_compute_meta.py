"""_linear_slope: matemática pura, sem rede nem banco."""

from app.jobs.compute_meta import _linear_slope


def test_linear_slope_none_with_single_point():
    assert _linear_slope([(1, 50.0)]) is None


def test_linear_slope_none_with_no_points():
    assert _linear_slope([]) is None


def test_linear_slope_two_points_matches_simple_delta():
    # de 40 pra 60 entre patch_sequence 1 e 2 -> inclinação de 20 por passo
    assert _linear_slope([(1, 40.0), (2, 60.0)]) == 20.0


def test_linear_slope_flat_trend_is_zero():
    assert _linear_slope([(1, 50.0), (2, 50.0), (3, 50.0)]) == 0.0


def test_linear_slope_detects_upward_trend():
    assert _linear_slope([(1, 30.0), (2, 50.0), (3, 70.0)]) > 0


def test_linear_slope_detects_downward_trend():
    assert _linear_slope([(1, 70.0), (2, 50.0), (3, 30.0)]) < 0
