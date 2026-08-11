"""Diff de dados brutos do Data Dragon entre duas versões (item novo —
"o que a Riot mudou de verdade", complementando `patch_diff.py`).
Matemática pura sobre dois dicts já carregados, sem rede/banco."""

from app.core.patch_notes_diff import diff_champion_detail


def _champion(stats=None, passive=None, spells=None) -> dict:
    return {
        "stats": stats or {"hp": 600, "armor": 30},
        "passive": passive or {"name": "Passiva", "description": "Descrição."},
        "spells": spells or [],
    }


def test_sem_mudanca_retorna_lista_vazia():
    antes = _champion()
    depois = _champion()
    assert diff_champion_detail("Ziggs", antes, depois) == []


def test_ignora_campos_cosmeticos_fora_da_lista_permitida():
    # `image`/`sprite` mudam de nome todo patch por reempacotamento de
    # spritesheet (confirmado contra dado real: Ziggs 16.14 -> 16.15) —
    # não é uma mudança de gameplay, não deve aparecer no diff.
    antes = _champion(
        passive={
            "name": "Passiva",
            "description": "Mesma.",
            "image": {"sprite": "passive5.png"},
        }
    )
    depois = _champion(
        passive={
            "name": "Passiva",
            "description": "Mesma.",
            "image": {"sprite": "passive7.png"},
        }
    )
    assert diff_champion_detail("Ziggs", antes, depois) == []


def test_mudanca_de_atributo_base_detectada():
    antes = _champion(stats={"hp": 600, "armor": 30})
    depois = _champion(stats={"hp": 620, "armor": 30})
    result = diff_champion_detail("Darius", antes, depois)
    assert len(result) == 1
    assert result[0]["category"] == "stat"
    assert result[0]["field_label"] == "Vida"
    assert result[0]["before_value"] == "600"
    assert result[0]["after_value"] == "620"


def test_mudanca_de_recarga_de_habilidade_detectada():
    # Caso real: Mordekaiser E no patch 16.15 (bate com a nota oficial da
    # Riot — nerf de recarga).
    antes = _champion(
        spells=[
            {},
            {},
            {"name": "Harvester of Sorrow", "cooldownBurn": "18/16/14/12/10"},
            {},
        ]
    )
    depois = _champion(
        spells=[
            {},
            {},
            {"name": "Harvester of Sorrow", "cooldownBurn": "16/14/12/10/8"},
            {},
        ]
    )
    result = diff_champion_detail("Mordekaiser", antes, depois)
    assert len(result) == 1
    assert result[0]["category"] == "spell"
    assert result[0]["spell_key"] == "E"
    assert result[0]["spell_name"] == "Harvester of Sorrow"
    assert result[0]["field_label"] == "Recarga"
    assert result[0]["before_value"] == "18/16/14/12/10"
    assert result[0]["after_value"] == "16/14/12/10/8"


def test_mudanca_de_efeito_sem_rotulo_semantico_ainda_aparece():
    # Placeholder {{ e1 }} continua no tooltip "depois" — sinal de que o
    # índice 1 ainda é o valor de verdade exibido ao jogador (habilidade
    # não migrou pro sistema de variáveis nomeadas).
    antes = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "100", "50"],
                "tooltip": "Causa {{ e1 }} de dano.",
            }
        ]
    )
    depois = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "120", "50"],
                "tooltip": "Causa {{ e1 }} de dano.",
            }
        ]
    )
    result = diff_champion_detail("Ashe", antes, depois)
    assert len(result) == 1
    assert result[0]["field"] == "effect_1"
    assert result[0]["field_label"] == "Valor de efeito 1"
    assert result[0]["before_value"] == "100"
    assert result[0]["after_value"] == "120"


def test_mudanca_de_efeito_suprimida_quando_habilidade_migra_pra_variavel_nomeada():
    # Achado com dados reais (patch 16.14 -> 16.15, Warwick/Zyra/Caitlyn/
    # Ekko/Lissandra): quando a Riot migra o tooltip pro sistema de
    # variáveis nomeadas, o índice de effectBurn some do texto e o valor
    # bruto vira lixo remanescente (zera ou reescala sem relação com o
    # jogo de verdade) — reportar isso como mudança seria falso positivo.
    antes = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "100"],
                "tooltip": "Causa {{ e1 }} de dano.",
            }
        ]
    )
    depois = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "0"],
                "tooltip": "Causa {{ basedamage }} de dano.",
            }
        ]
    )
    assert diff_champion_detail("Warwick", antes, depois) == []


def test_mudanca_de_efeito_mantida_quando_so_um_indice_da_habilidade_migra():
    # Um índice migra (some do tooltip), outro continua real — só o que
    # migrou é suprimido, o resto do diff continua funcionando normal.
    antes = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "100", "50"],
                "tooltip": "{{ e1 }} dano, {{ e2 }} cura.",
            }
        ]
    )
    depois = _champion(
        spells=[
            {
                "name": "Q",
                "effectBurn": [None, "0", "70"],
                "tooltip": "{{ basedamage }} dano, {{ e2 }} cura.",
            }
        ]
    )
    result = diff_champion_detail("Warwick", antes, depois)
    assert len(result) == 1
    assert result[0]["field"] == "effect_2"
    assert result[0]["before_value"] == "50"
    assert result[0]["after_value"] == "70"


def test_mudanca_de_descricao_de_passiva_detectada():
    antes = _champion(passive={"name": "Passiva", "description": "Texto antigo."})
    depois = _champion(passive={"name": "Passiva", "description": "Texto novo."})
    result = diff_champion_detail("Kaisa", antes, depois)
    assert len(result) == 1
    assert result[0]["category"] == "passive"
    assert result[0]["field_label"] == "Descrição"


def test_champion_id_propagado_em_todas_as_mudancas():
    antes = _champion(stats={"hp": 600})
    depois = _champion(stats={"hp": 650})
    result = diff_champion_detail("Zac", antes, depois)
    assert all(c["champion_id"] == "Zac" for c in result)
