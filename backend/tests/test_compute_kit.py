"""_average_spell_range: matemática pura, sem rede."""

from app.jobs.compute_kit import _average_spell_range


def test_average_spell_range_ignores_self_target_abilities():
    spells = [
        {"range": [625, 625]},
        {"range": [1, 1]},  # auto-alvo, deve ser ignorado
        {"range": 500},
    ]
    assert _average_spell_range(spells) == (625 + 500) / 2


def test_average_spell_range_returns_none_when_all_self_target():
    spells = [{"range": [1, 1]}, {"range": [1]}]
    assert _average_spell_range(spells) is None


def test_average_spell_range_empty_list():
    assert _average_spell_range([]) is None
