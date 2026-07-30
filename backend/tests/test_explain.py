"""Decomposição do score por camada (item 3.1) — matemática pura.

O teste que importa é a identidade `base + soma(contribuicoes) ==
score_final`: se ela quebrar, a explicação passa a contradizer o número
exibido na interface, que é exatamente o problema que o item 3.1 existe
pra resolver.

A identidade é exata em álgebra, mas os dois lados são calculados em
ordens diferentes de operação, então em ponto flutuante batem só até
~1e-13. Daí o `approx` — a tolerância é ordens de grandeza menor que
qualquer diferença visível na interface (que arredonda pra 1 casa).
"""

import pytest

from app.core.explain import NEUTRO, explain_score, layer_contributions

PESOS_COMPLETOS = {"performance": 0.40, "kit": 0.25, "build": 0.25, "meta": 0.10}
PESOS_SEM_KIT = {"performance": 0.40, "build": 0.25, "meta": 0.10}


def _score_final(layer_scores: dict, pesos: dict) -> float:
    disponiveis = {n: s for n, s in layer_scores.items() if s is not None and n in pesos}
    soma_pesos = sum(pesos[n] for n in disponiveis)
    return sum(pesos[n] * s for n, s in disponiveis.items()) / soma_pesos


def test_contribuicoes_reconstroem_o_score_final():
    layer_scores = {"performance": 65.2, "kit": 71.0, "build": 30.5, "meta": 36.0}

    contribuicoes = layer_contributions(layer_scores, PESOS_COMPLETOS)
    reconstruido = NEUTRO + sum(c["contribuicao"] for c in contribuicoes)

    assert reconstruido == pytest.approx(_score_final(layer_scores, PESOS_COMPLETOS), rel=1e-12)


def test_identidade_vale_com_kit_ausente():
    # Caso real de todas as linhas em produção hoje: Kit não existe pro
    # patch, peso redistribuído entre as três camadas restantes.
    layer_scores = {"performance": 65.2142752847354, "kit": None, "build": 30.46875, "meta": 36.0}

    contribuicoes = layer_contributions(layer_scores, PESOS_SEM_KIT)
    reconstruido = NEUTRO + sum(c["contribuicao"] for c in contribuicoes)

    # Valor real persistido para Kayn/JUNGLE/16.14 no banco de produção.
    assert reconstruido == pytest.approx(49.7371968185255, rel=1e-12)


def test_camada_neutra_nao_contribui():
    contribuicoes = layer_contributions({"performance": 50.0}, {"performance": 0.40})
    assert contribuicoes[0]["contribuicao"] == 0.0


def test_ordenacao_do_maior_positivo_ao_maior_negativo():
    layer_scores = {"performance": 20.0, "kit": 90.0, "build": 50.0, "meta": 10.0}

    contribuicoes = layer_contributions(layer_scores, PESOS_COMPLETOS)
    nomes = [c["camada"] for c in contribuicoes]

    assert nomes[0] == "kit"  # único acima do neutro
    assert nomes[-1] == "performance"  # peso alto puxando pra baixo pesa mais que meta
    valores = [c["contribuicao"] for c in contribuicoes]
    assert valores == sorted(valores, reverse=True)


def test_pesos_normalizados_somam_um():
    contribuicoes = layer_contributions(
        {"performance": 60.0, "kit": None, "build": 40.0, "meta": 55.0}, PESOS_SEM_KIT
    )
    assert abs(sum(c["peso"] for c in contribuicoes) - 1.0) < 1e-12


def test_camada_ausente_e_reportada_explicitamente():
    explicacao = explain_score(
        {"performance": 60.0, "kit": None, "build": 40.0, "meta": 55.0}, PESOS_SEM_KIT
    )

    assert explicacao["camadas_ausentes"] == ["kit"]
    assert [c["camada"] for c in explicacao["camadas"]] != ["kit"]
    assert all(c["camada"] != "kit" for c in explicacao["camadas"])


def test_sem_nenhuma_camada_disponivel_nao_quebra():
    assert layer_contributions({"performance": None}, {"performance": 0.40}) == []
    assert explain_score({"performance": None}, {})["camadas"] == []
