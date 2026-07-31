"""Método 1 de identificação de rota (item 0.2) — mapeamento puro."""

from app.jobs.validate_route_identification import metodo_1


def test_combos_canonicos_mapeiam_certo():
    assert metodo_1("NONE", "JUNGLE") == "JUNGLE"
    assert metodo_1("SOLO", "TOP") == "TOP"
    assert metodo_1("SOLO", "MIDDLE") == "MIDDLE"
    assert metodo_1("CARRY", "BOTTOM") == "BOTTOM"
    assert metodo_1("SUPPORT", "BOTTOM") == "UTILITY"


def test_combo_fora_da_tabela_nao_vira_palpite():
    # DUO puro (bot lane sem distinguir carry/suporte) não é um dos 5
    # combos canônicos do Método 1 — resposta correta é "sem opinião".
    assert metodo_1("DUO", "BOTTOM") is None
    assert metodo_1("SUPPORT", "MIDDLE") is None


def test_valores_ausentes_nao_quebram():
    assert metodo_1(None, "TOP") is None
    assert metodo_1("SOLO", None) is None
    assert metodo_1(None, None) is None
