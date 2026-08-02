"""`_label` (rodada 21, "Skill Expression"): converte percentil em rótulo
Baixo/Médio/Alto. Lógica pura, mesmo padrão de `test_stats.py`."""

from app.jobs.compute_skill_expression import _label


def test_percentil_abaixo_de_33_e_baixo():
    assert _label(0) == "Baixo"
    assert _label(32.9) == "Baixo"


def test_percentil_entre_33_e_66_e_medio():
    assert _label(33) == "Médio"
    assert _label(65.9) == "Médio"


def test_percentil_66_ou_acima_e_alto():
    assert _label(66) == "Alto"
    assert _label(100) == "Alto"
