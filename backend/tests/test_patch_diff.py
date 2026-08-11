"""Diff de score_final entre dois patches (item novo, rodada 19 —
"Patch Notes"; mudança de tier adicionada na rodada 21, backlog 4.3).
Matemática pura sobre listas já carregadas."""

from app.core.patch_diff import diff_patches


def test_alta_e_queda_calculadas_corretamente():
    atual = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 70.0, "score_tier": "S"},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 40.0, "score_tier": "C"},
    ]
    anterior = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0, "score_tier": "A"},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 55.0, "score_tier": "B"},
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
    atual = [{"champion_id": "Zed", "lane": "JUNGLE", "score_final": 40.0, "score_tier": "C"}]
    anterior = [{"champion_id": "Zed", "lane": "MIDDLE", "score_final": 55.0, "score_tier": "B"}]
    result = diff_patches(atual, anterior)
    assert result["altas"] == []
    assert result["quedas"] == []
    assert result["comparados"] == 0


def test_delta_zero_nao_aparece_em_altas_nem_quedas():
    atual = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0, "score_tier": "A"}]
    anterior = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0, "score_tier": "A"}]
    result = diff_patches(atual, anterior)
    assert result["altas"] == []
    assert result["quedas"] == []
    assert result["comparados"] == 1


def test_top_n_limita_altas_e_quedas_separadamente():
    atual = [
        {"champion_id": f"C{i}", "lane": "MIDDLE", "score_final": 50.0 + i, "score_tier": "B"}
        for i in range(5)
    ]
    anterior = [
        {"champion_id": f"C{i}", "lane": "MIDDLE", "score_final": 50.0, "score_tier": "B"}
        for i in range(5)
    ]
    result = diff_patches(atual, anterior, top_n=2)
    assert len(result["altas"]) == 2
    # maiores altas primeiro
    assert result["altas"][0]["champion_id"] == "C4"
    assert result["altas"][1]["champion_id"] == "C3"


def test_quedas_ordenadas_da_maior_queda_para_a_menor():
    atual = [
        {"champion_id": "A", "lane": "TOP", "score_final": 40.0, "score_tier": "C"},
        {"champion_id": "B", "lane": "TOP", "score_final": 55.0, "score_tier": "B"},
    ]
    anterior = [
        {"champion_id": "A", "lane": "TOP", "score_final": 60.0, "score_tier": "A"},  # delta -20
        {"champion_id": "B", "lane": "TOP", "score_final": 60.0, "score_tier": "A"},  # delta -5
    ]
    result = diff_patches(atual, anterior)
    assert [d["champion_id"] for d in result["quedas"]] == ["A", "B"]


def test_mudanca_de_tier_e_detectada_mesmo_com_delta_pequeno():
    # B cai só 1 ponto de score, mas cruza a fronteira de tier — isso
    # importa mais pro usuário do que uma queda grande que não muda a
    # letra (por isso mudancas_tier não usa top_n).
    atual = [
        {"champion_id": "A", "lane": "TOP", "score_final": 30.0, "score_tier": "D"},
        {"champion_id": "B", "lane": "TOP", "score_final": 59.0, "score_tier": "B"},
    ]
    anterior = [
        {"champion_id": "A", "lane": "TOP", "score_final": 20.0, "score_tier": "D"},
        {"champion_id": "B", "lane": "TOP", "score_final": 60.0, "score_tier": "A"},
    ]
    result = diff_patches(atual, anterior)
    assert len(result["mudancas_tier"]) == 1
    mudanca = result["mudancas_tier"][0]
    assert mudanca["champion_id"] == "B"
    assert mudanca["tier_anterior"] == "A"
    assert mudanca["tier_atual"] == "B"


def test_sem_mudanca_de_tier_lista_fica_vazia():
    atual = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 65.0, "score_tier": "A"}]
    anterior = [{"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0, "score_tier": "A"}]
    result = diff_patches(atual, anterior)
    assert result["mudancas_tier"] == []


def test_posicao_calculada_dentro_da_propria_rota():
    # Ahri sobe de #2 pra #1 em MIDDLE só porque Zed caiu — Yasuo (TOP)
    # não deve interferir no ranking de MIDDLE nem ser afetado por ele.
    atual = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 70.0, "score_tier": "S"},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 40.0, "score_tier": "C"},
        {"champion_id": "Yasuo", "lane": "TOP", "score_final": 90.0, "score_tier": "S"},
    ]
    anterior = [
        {"champion_id": "Ahri", "lane": "MIDDLE", "score_final": 60.0, "score_tier": "A"},
        {"champion_id": "Zed", "lane": "MIDDLE", "score_final": 65.0, "score_tier": "A"},
        {"champion_id": "Yasuo", "lane": "TOP", "score_final": 90.0, "score_tier": "S"},
    ]
    result = diff_patches(atual, anterior)
    by_champion = {d["champion_id"]: d for d in result["altas"] + result["quedas"]}
    assert by_champion["Ahri"]["posicao_anterior"] == 2
    assert by_champion["Ahri"]["posicao_atual"] == 1
    assert by_champion["Ahri"]["delta_posicao"] == 1
    assert by_champion["Zed"]["posicao_anterior"] == 1
    assert by_champion["Zed"]["posicao_atual"] == 2
    assert by_champion["Zed"]["delta_posicao"] == -1
    # Yasuo é o único em TOP nos dois patches — sempre #1, delta 0, e o
    # próprio delta de score 0 já o exclui de altas/quedas (ver teste
    # `test_delta_zero_nao_aparece_em_altas_nem_quedas`).
