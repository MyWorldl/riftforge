"""Diff de score_final entre dois patches (item novo, rodada 19 —
"Patch Notes"). Matemática pura sobre listas já carregadas."""

from app.core.patch_diff import diff_patches


def test_alta_e_queda_calculadas_corretamente():
    atual = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 70.0},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 40.0},
    ]
    anterior = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 55.0},
    ]
    result = diff_patches(atual, anterior)
    assert result["altas"][0]["champion_id"] == "Ahri"
    assert result["altas"][0]["delta"] == 10.0
    assert result["quedas"][0]["champion_id"] == "Zed"
    assert result["quedas"][0]["delta"] == -15.0
    assert result["comparados"] == 2


def test_campeao_sem_combo_igual_no_patch_anterior_e_ignorado():
    # Zed jogou SELVA no patch atual mas só tinha score em MIDDLE antes —
    # não é uma "queda de 100%", é "sem dado comparável", então some do
    # diff em vez de contar como queda.
    atual = [{"champion_id": "Zed", "lane": "JUNGLE", "score_final": 40.0}]
    anterior = [{"champion_id": "Zed", "lane": "MIDDLE", "score_final": 55.0}]
    result = diff_patches(atual, anterior)
    assert result["altas"] == []
    assert result["quedas"] == []
    assert result["comparados"] == 0


def test_delta_zero_nao_aparece_em_altas_nem_quedas():
    atual = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0}]
    anterior = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0}]
    result = diff_patches(atual, anterior)
    assert result["altas"] == []
    assert result["quedas"] == []
    assert result["comparados"] == 1


def test_top_n_limita_altas_e_quedas_separadamente():
    atual = [
        {"champion_id": f"C{i}", "lane": "MIDDLE", "score_final": 50.0 + i} for i in range(5)
    ]
    anterior = [{"champion_id": f"C{i}", "lane": "MIDDLE", "score_final": 50.0} for i in range(5)]
    result = diff_patches(atual, anterior, top_n=2)
    assert len(result["altas"]) == 2
    # maiores altas primeiro
    assert result["altas"][0]["champion_id"] == "C4"
    assert result["altas"][1]["champion_id"] == "C3"


def test_quedas_ordenadas_da_maior_queda_para_a_menor():
    atual = [
        {"champion_id": "A", "lane": "TOP", "score_final": 40.0},
        {"champion_id": "B", "lane": "TOP", "score_final": 55.0},
    ]
    anterior = [
        {"champion_id": "A", "lane": "TOP", "score_final": 60.0},  # delta -20
        {"champion_id": "B", "lane": "TOP", "score_final": 60.0},  # delta -5
    ]
    result = diff_patches(atual, anterior)
    assert [d["champion_id"] for d in result["quedas"]] == ["A", "B"]
