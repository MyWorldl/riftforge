"""Funções puras da Camada 3 (Build): entropia, chave de build e power
spike de item — sem rede, sem banco."""

from types import SimpleNamespace

from app.jobs.compute_build import _build_key, _item_spike, _shannon_entropy


def test_build_key_ignores_order_and_empty_slots():
    assert _build_key([3, 0, 1, 2, 0, 0]) == _build_key([2, 1, 3, 0, 0, 0])


def test_build_key_empty():
    assert _build_key([]) == ()
    assert _build_key(None) == ()


def test_shannon_entropy_zero_when_single_option():
    assert _shannon_entropy([10]) == 0.0


def test_shannon_entropy_higher_when_more_uniform():
    concentrated = _shannon_entropy([9, 1])
    uniform = _shannon_entropy([5, 5])
    assert uniform > concentrated


def _participant(win: bool, items: list[int]) -> SimpleNamespace:
    return SimpleNamespace(win=win, core_items=items)


def test_item_spike_detects_win_rate_swing():
    participants = [
        _participant(True, [100, 200]),
        _participant(True, [100, 300]),
        _participant(False, [400, 500]),
    ]
    item_atual, delta = _item_spike(participants)
    assert item_atual == 100  # aparece em mais partidas que qualquer outro
    assert delta > 0  # 100% WR com o item vs 0% sem ele


def test_item_spike_empty_participants():
    assert _item_spike([]) == (None, 0.0)
