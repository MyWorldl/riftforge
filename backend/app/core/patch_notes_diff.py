"""Item novo: detecta mudanças numéricas reais entre duas versões do
Data Dragon pro mesmo campeão — complementa `patch_diff.py` (que mede
IMPACTO estatístico via partidas) com o que a Riot de fato alterou nos
dados brutos de habilidade/atributo.

Achado ao validar contra dados reais (patch 16.14 -> 16.15): nem toda
mudança de balanceamento aparece aqui. Ajustes de proporção/escala (ex:
"dano de ataque bônus aumentado de 30% para 40%") ficam no campo `vars`
do Data Dragon, que vem vazio nessa API pública — mesma limitação já
documentada em `app/jobs/compute_kit.py`. Só pegam mudanças de valor
bruto: recarga, custo, alcance, valores de efeito e atributos base.
Ainda assim captura mudanças reais — confirmado contra a nota oficial
do patch 16.15 (Mordekaiser E: recarga 18/16/14/12/10 -> 16/14/12/10/8).

Também precisa ignorar campos cosméticos que mudam todo patch sem
relação com gameplay — `passive.image.sprite` muda de nome de arquivo
(ex: "passive5.png" -> "passive7.png") só por causa de re-empacotamento
de spritesheet, não por mudança de jogo. Só os campos explicitamente
listados abaixo entram no diff.

Função pura, testável sem banco/rede — quem busca os dois JSONs do Data
Dragon e persiste o resultado é `app/jobs/compute_patch_changes.py`."""

STAT_LABELS: dict[str, str] = {
    "hp": "Vida",
    "hpperlevel": "Vida por nível",
    "mp": "Mana",
    "mpperlevel": "Mana por nível",
    "movespeed": "Velocidade de movimento",
    "armor": "Armadura",
    "armorperlevel": "Armadura por nível",
    "spellblock": "Resistência mágica",
    "spellblockperlevel": "Resistência mágica por nível",
    "attackrange": "Alcance de ataque",
    "hpregen": "Regeneração de vida",
    "hpregenperlevel": "Regeneração de vida por nível",
    "mpregen": "Regeneração de mana",
    "mpregenperlevel": "Regeneração de mana por nível",
    "crit": "Chance de crítico",
    "critperlevel": "Chance de crítico por nível",
    "attackdamage": "Dano de ataque",
    "attackdamageperlevel": "Dano de ataque por nível",
    "attackspeed": "Velocidade de ataque",
    "attackspeedperlevel": "Velocidade de ataque por nível",
}

SPELL_FIELD_LABELS: dict[str, str] = {
    "cooldownBurn": "Recarga",
    "costBurn": "Custo",
    "rangeBurn": "Alcance",
}

SPELL_KEYS = ["Q", "W", "E", "R"]


def _diff_stats(champion_id: str, before: dict, after: dict) -> list[dict]:
    stats_before = before.get("stats", {})
    stats_after = after.get("stats", {})
    changes = []
    for field, label in STAT_LABELS.items():
        valor_antes, valor_depois = stats_before.get(field), stats_after.get(field)
        if valor_antes != valor_depois:
            changes.append(
                {
                    "champion_id": champion_id,
                    "category": "stat",
                    "spell_key": None,
                    "spell_name": None,
                    "field": field,
                    "field_label": label,
                    "before_value": str(valor_antes),
                    "after_value": str(valor_depois),
                }
            )
    return changes


def _diff_passive(champion_id: str, before: dict, after: dict) -> list[dict]:
    passive_before = before.get("passive", {})
    passive_after = after.get("passive", {})
    if passive_before.get("description") == passive_after.get("description"):
        return []
    return [
        {
            "champion_id": champion_id,
            "category": "passive",
            "spell_key": None,
            "spell_name": passive_after.get("name") or passive_before.get("name"),
            "field": "description",
            "field_label": "Descrição",
            "before_value": passive_before.get("description", ""),
            "after_value": passive_after.get("description", ""),
        }
    ]


def _diff_spells(champion_id: str, before: dict, after: dict) -> list[dict]:
    spells_before = before.get("spells", [])
    spells_after = after.get("spells", [])
    changes = []

    for index, (spell_before, spell_after) in enumerate(zip(spells_before, spells_after)):
        spell_key = SPELL_KEYS[index] if index < len(SPELL_KEYS) else f"Spell{index}"
        spell_name = spell_after.get("name") or spell_before.get("name")

        for field, label in SPELL_FIELD_LABELS.items():
            valor_antes, valor_depois = spell_before.get(field), spell_after.get(field)
            if valor_antes != valor_depois:
                changes.append(
                    {
                        "champion_id": champion_id,
                        "category": "spell",
                        "spell_key": spell_key,
                        "spell_name": spell_name,
                        "field": field,
                        "field_label": label,
                        "before_value": str(valor_antes),
                        "after_value": str(valor_depois),
                    }
                )

        # `effectBurn` não tem rótulo semântico no Data Dragon (não dá pra
        # saber se o índice N é "dano" ou "duração" sem ler a descrição
        # com placeholders {{ eN }}, fora do escopo desta versão) — ainda
        # assim o valor bruto que mudou é sinal real, só com rótulo genérico.
        effect_before = spell_before.get("effectBurn", [])
        effect_after = spell_after.get("effectBurn", [])
        for effect_index, (valor_antes, valor_depois) in enumerate(zip(effect_before, effect_after)):
            if valor_antes == valor_depois:
                continue
            changes.append(
                {
                    "champion_id": champion_id,
                    "category": "spell",
                    "spell_key": spell_key,
                    "spell_name": spell_name,
                    "field": f"effect_{effect_index}",
                    "field_label": f"Valor de efeito {effect_index}",
                    "before_value": str(valor_antes),
                    "after_value": str(valor_depois),
                }
            )

    return changes


def diff_champion_detail(champion_id: str, before: dict, after: dict) -> list[dict]:
    """`before`/`after` no formato de `DataDragonAdapter.get_champion_detail`
    (mesmo campeão, duas versões). Retorna uma lista vazia se nada relevante
    mudou — a maioria dos campeões não muda em qualquer patch dado."""
    return [
        *_diff_stats(champion_id, before, after),
        *_diff_passive(champion_id, before, after),
        *_diff_spells(champion_id, before, after),
    ]
