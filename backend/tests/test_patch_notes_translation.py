"""Tradução pt-BR de rótulo/nome de habilidade — sem rede (mesmo padrão
de `test_riot_patch_notes_parser.py`)."""

from app.core.patch_notes_translation import (
    translate_field_label,
    translate_spell_names,
)


def test_rotulo_conhecido_e_traduzido():
    assert translate_field_label("Cooldown") == "Recarga"
    assert translate_field_label("Health") == "Vida"


def test_rotulo_desconhecido_fica_em_ingles():
    # Decisão deliberada: nunca inventa tradução parcial/quebrada.
    assert translate_field_label("Some Brand New Label") == "Some Brand New Label"


def test_nome_de_habilidade_traduzido_quando_bate_com_a_posicao():
    changes = [
        {
            "champion_id": "Locke",
            "category": "spell",
            "spell_key": "Q",
            "spell_name": "Ritual Nails",
            "field": "base_damage_nail",
            "field_label": "Base Damage - Nail",
            "before_value": "50",
            "after_value": "40",
        }
    ]
    spells_ptbr = {
        "Locke": {
            "Q": "Pregos Ritualísticos",
            "_en": {"Q": "Ritual Nails"},
        }
    }
    result = translate_spell_names(changes, spells_ptbr)
    assert result[0]["spell_name"] == "Pregos Ritualísticos"
    assert result[0]["field_label"] == "Dano Base - Prego"


def test_nome_de_habilidade_com_dois_estados_nao_e_traduzido():
    # Riven R tem duas notas ("Blade of the Exile"/"Wind Slash") pra
    # mesma tecla — a Data Dragon só guarda um nome por posição, então
    # o que não bate fica em inglês em vez de aplicar a tradução errada.
    changes = [
        {
            "champion_id": "Riven",
            "category": "spell",
            "spell_key": "R",
            "spell_name": "Wind Slash",
            "field": "bonus_ad_ratio",
            "field_label": "Bonus Attack Damage Ratio",
            "before_value": "60%",
            "after_value": "55%",
        }
    ]
    spells_ptbr = {
        "Riven": {
            "R": "Lâmina do Exílio",
            "_en": {"R": "Blade of the Exile"},
        }
    }
    result = translate_spell_names(changes, spells_ptbr)
    assert result[0]["spell_name"] == "Wind Slash"


def test_passiva_traduzida_via_chave_passive():
    changes = [
        {
            "champion_id": "Kaisa",
            "category": "passive",
            "spell_key": None,
            "spell_name": "Second Skin",
            "field": "caustic_wounds",
            "field_label": "Caustic Wounds",
            "before_value": "4 - 24",
            "after_value": "4 - 30",
        }
    ]
    spells_ptbr = {
        "Kaisa": {
            "passive": "Segunda Pele",
            "_en": {"passive": "Second Skin"},
        }
    }
    result = translate_spell_names(changes, spells_ptbr)
    assert result[0]["spell_name"] == "Segunda Pele"


def test_campeao_sem_dados_ptbr_mantem_original():
    changes = [
        {
            "champion_id": "Zac",
            "category": "stat",
            "spell_key": None,
            "spell_name": None,
            "field": "armor_growth",
            "field_label": "Armor Growth",
            "before_value": "4.7",
            "after_value": "5.2",
        }
    ]
    result = translate_spell_names(changes, {})
    assert result[0]["field_label"] == "Crescimento de Armadura"
    assert result[0]["spell_name"] is None
