"""`_best_combo` (rodada 21, "Recomendação de build"): escolhe a
combinação de maior win rate entre as que atingem a amostra mínima;
sem nenhuma qualificada, cai pra mais popular e marca amostra
insuficiente. Lógica pura, mesmo padrão de `test_stats.py`."""

from app.jobs.compute_build_recommendation import _best_combo


def test_escolhe_maior_win_rate_entre_qualificadas():
    counts = {
        "A": [10, 4],  # 40% WR, qualificado
        "B": [10, 7],  # 70% WR, qualificado
        "C": [2, 2],  # 100% WR, mas amostra pequena
    }
    key, games, wins, insuficiente = _best_combo(counts, min_games=5)
    assert key == "B"
    assert (games, wins) == (10, 7)
    assert insuficiente is False


def test_sem_combinacao_qualificada_cai_pra_mais_alta_wr_disponivel_e_marca_insuficiente():
    counts = {
        "A": [2, 2],  # 100% WR
        "B": [3, 1],  # 33% WR
    }
    key, games, wins, insuficiente = _best_combo(counts, min_games=5)
    assert key == "A"
    assert insuficiente is True


def test_combinacao_unica_e_escolhida_mesmo_sem_atingir_o_minimo():
    counts = {"A": [1, 0]}
    key, games, wins, insuficiente = _best_combo(counts, min_games=5)
    assert key == "A"
    assert (games, wins) == (1, 0)
    assert insuficiente is True
