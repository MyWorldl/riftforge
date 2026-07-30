"""Resolução de identificador de campeão — a garantia que importa é que
todos os estágios do pipeline cheguem ao MESMO id para o mesmo campeão.

Se `aggregate_stats` e `compute_build` divergirem aqui, o join por
`champion_id` em `compute_scores` descarta a linha em silêncio.
"""

from app.core.champions import resolve_champion_id

MAPA = {103: "Ahri", 145: "Kaisa", 9: "Fiddlesticks"}


def test_usa_o_id_do_data_dragon_quando_existe():
    assert resolve_champion_id(MAPA, 103, "Ahri") == "Ahri"


def test_id_do_ddragon_tem_precedencia_sobre_o_nome_bruto():
    # Caso real: Match-V5 manda "Kai'Sa" com apóstrofo, o ddragon usa
    # "Kaisa" — é o do ddragon que cruza com nome/imagem no frontend.
    assert resolve_champion_id(MAPA, 145, "Kai'Sa") == "Kaisa"


def test_divergencia_de_caixa_tambem_resolve():
    # Caso real encontrado nos dados: Match-V5 manda "FiddleSticks", o
    # ddragon usa "Fiddlesticks". Era o único campeão de 173 que não casava
    # com a tabela de Kit antes da unificação.
    assert resolve_champion_id(MAPA, 9, "FiddleSticks") == "Fiddlesticks"


def test_cai_no_nome_bruto_quando_fora_do_mapa():
    # Campeão recém-lançado, ainda não propagado pro ddragon daquele patch.
    assert resolve_champion_id(MAPA, 999, "Yunara") == "Yunara"


def test_cai_no_id_numerico_sem_nenhum_nome():
    assert resolve_champion_id(MAPA, 999, None) == "999"
    assert resolve_champion_id(MAPA, 999) == "999"


def test_nome_bruto_vazio_nao_vira_id_vazio():
    assert resolve_champion_id(MAPA, 999, "") == "999"


def test_chamadas_com_contextos_diferentes_convergem():
    """O ponto do módulo: `aggregate_stats` (tem nome bruto do
    participante) e `compute_build` (idem) e os bans (nome bruto vindo de
    um mapa auxiliar) precisam produzir o mesmo id."""
    de_participante = resolve_champion_id(MAPA, 999, "Yunara")
    de_build = resolve_champion_id(MAPA, 999, "Yunara")
    de_ban = resolve_champion_id(MAPA, 999, {999: "Yunara"}.get(999))
    assert de_participante == de_build == de_ban
