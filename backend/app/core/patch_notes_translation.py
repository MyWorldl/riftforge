"""Tradução pt-BR pros rótulos da nota oficial de patch (pedido do
usuário: traduzir habilidades/atributos, usando uma base confiável em
português quando possível). Duas fontes bem diferentes:

1. **Nome de habilidade** (`spell_name`/passiva) — não precisa de
   dicionário próprio: a Data Dragon já publica a tradução oficial no
   locale `pt_BR` (`get_champion_detail(..., locale="pt_BR")`), o mesmo
   texto que aparece no cliente do jogo em português. É a "base
   confiável" que o usuário pediu. `translate_spell_names` casa pelo
   NOME em inglês contra QUALQUER posição do kit (Q/W/E/R/passiva) —
   não pela tecla que a nota oficial reportou. Achado com dado real
   (Naafiri, patch 26.15): a nota chamava a mudança de "R - The Call of
   the Pack", mas na Data Dragon dessa versão "The Call of the Pack" é
   o nome da W (a R dela é "Hounds' Pursuit") — comparar só pela tecla
   deixaria essa tradução em inglês por engano. Duas situações ainda
   ficam em inglês de propósito: habilidade com mais de um "estado" de
   conjuração (ex: Riven R "Blade of the Exile"/"Wind Slash" — a Data
   Dragon só guarda UM nome por posição, "Wind Slash" não bate com
   nenhuma), e nome que realmente não existe em nenhuma posição do kit
   atual. Ver `translate_spell_names` — quem busca o pt_BR de verdade é
   `compute_patch_changes.py` (só pros campeões que mudaram nesse
   patch, não os ~170 inteiros).

2. **Rótulo do atributo/efeito** (`field_label`, ex: "Cooldown", "Base
   Damage - Nail") — não existe fonte oficial pra isso; a Riot não
   expõe um dicionário rótulo→tradução, só o texto corrido do tooltip
   em pt-BR (que não separa por rótulo isolado, então não dá pra
   recortar a tradução de um pedaço específico com segurança).
   `FIELD_LABEL_TRANSLATIONS` é um dicionário fixo com as frases mais
   recorrentes entre patches (Cooldown/Custo/Dano/Vida/Armadura...,
   levantado contra os patches 26.15/26.16 reais). Rótulo fora da
   lista fica em inglês — decisão deliberada: nunca inventa uma
   tradução parcial (ex: juntar palavra por palavra sem reordenar,
   "Base Damage" virando "Base Dano" em vez de "Dano Base") que sairia
   gramaticalmente errada. Cresce por patch — cada rótulo novo que
   aparecer e não estiver aqui é um candidato pra entrar depois."""

FIELD_LABEL_TRANSLATIONS: dict[str, str] = {
    # Atributos base (mesmo vocabulário de STAT_LABELS em patch_notes_diff.py)
    "Health": "Vida",
    "Health Growth": "Crescimento de Vida",
    "Mana": "Mana",
    "Mana Growth": "Crescimento de Mana",
    "Move Speed": "Velocidade de Movimento",
    "Out of Combat Move Speed": "Velocidade de Movimento Fora de Combate",
    "Armor": "Armadura",
    "Armor Growth": "Crescimento de Armadura",
    "Magic Resist": "Resistência Mágica",
    "Magic Resist Growth": "Crescimento de Resistência Mágica",
    "Attack Range": "Alcance de Ataque",
    "Attack Damage": "Dano de Ataque",
    "Attack Damage Growth": "Crescimento de Dano de Ataque",
    "Attack Speed": "Velocidade de Ataque",
    # Pedido do usuário: "Proporção" sugeria escala de dano — esse rótulo
    # é o multiplicador de velocidade de ataque em si (atributo base do
    # Bel'Veth), não uma proporção de outra coisa.
    "Attack Speed Ratio": "Multiplicador de Velocidade de Ataque",
    "Attack Speed After Spell Cast": "Velocidade de Ataque depois de Conjurar",
    "Attack Speed per Stack": "Velocidade de Ataque por Acúmulo",
    "Basic Attack Damage Modifier": "Modificador de Dano do Ataque Básico",
    "Attack Cast Time": "Tempo de Conjuração do Ataque",
    "Total Attack Speed": "Velocidade de Ataque Total",
    "True Form Total Attack Speed": "Velocidade de Ataque Total na Forma Verdadeira",
    "Total Attack Animation": "Animação de Ataque Total",
    "Model Size": "Tamanho do Modelo",
    "Size": "Tamanho",
    "Speed": "Velocidade",
    "Health Regen": "Regeneração de Vida",
    "Health Regeneration": "Regeneração de Vida",
    "Mana Regen": "Regeneração de Mana",
    "Crit Chance": "Chance de Crítico",
    "Bonus Resistances": "Resistências Bônus",
    "Total Armor and Magic Resistance": "Armadura e Resistência Mágica Total",
    # Recarga/custo/alcance
    "Cooldown": "Recarga",
    "Cost": "Custo",
    "Range": "Alcance",
    "Cast Time": "Tempo de Conjuração",
    "Time Between Casts": "Tempo Entre Conjurações",
    "Post-Cast Lockout": "Bloqueio Pós-Conjuração",
    # Dano
    "Damage": "Dano",
    "Base Damage": "Dano Base",
    "Bonus Damage": "Dano Bônus",
    "Total Damage": "Dano Total",
    "Damage per Strike": "Dano por Golpe",
    "Explosion Damage": "Dano de Explosão",
    "Passive True Damage": "Dano Verdadeiro Passivo",
    "Monster Damage Modifier": "Modificador de Dano contra Monstros",
    "Minion Damage Modifier": "Modificador de Dano contra Lacaios",
    "Damage Reduction": "Redução de Dano",
    "Number of Strikes": "Número de Golpes",
    "Maximum Damage": "Dano Máximo",
    "Outer Cone Bonus Damage": "Dano Bônus do Cone Externo",
    "First Lash Damage": "Dano do Primeiro Golpe",
    # Proporções/escala — "Multiplicador" (não "Proporção"), pedido do
    # usuário, mesmo motivo do Attack Speed Ratio acima: consistência
    # de termo pra todo campo "Ratio".
    "Ability Power Ratio": "Multiplicador de Poder de Habilidade",
    "Bonus Attack Damage Ratio": "Multiplicador de Dano de Ataque Bônus",
    "Attack Damage Ratio": "Multiplicador de Dano de Ataque",
    "Attack Speed to Ability Haste Conversion": "Conversão de Velocidade de Ataque em Aceleração de Habilidade",
    # Cura/escudo/roubo de vida
    "Heal": "Cura",
    "Healing": "Cura",
    "Healing On Champions": "Cura em Campeões",
    "Heal per Bonus Health": "Cura por Vida Bônus",
    "Shield": "Escudo",
    "Lifesteal": "Roubo de Vida",
    "Lifesteal Scaling": "Escala de Roubo de Vida",
    # Duração/CC
    "Duration": "Duração",
    "Slow": "Lentidão",
    "Slow Amount": "Quantidade de Lentidão",
    "Slow Duration": "Duração da Lentidão",
    "Knockup Duration": "Duração do Lançamento ao Ar",
    "Stun Duration": "Duração do Atordoamento",
    "Root Duration": "Duração da Imobilização",
    "Fear Duration": "Duração do Medo",
    "Buff Duration": "Duração do Bônus",
    "Empowered Buff Duration": "Duração do Bônus Potencializado",
    "Unempowered Buff Duration": "Duração do Bônus Não Potencializado",
    # Cargas/contadores/alcance bônus
    "Stacks": "Cargas",
    "Maximum Epic Monster Stacks": "Cargas Máximas em Monstros Épicos",
    "Basic Attack Range Bonus": "Bônus de Alcance do Ataque Básico",
    "Target Maximum Health Monster Cap": "Limite de Vida Máxima do Alvo (Monstros)",
    # Passiva/efeitos qualitativos
    "Passive Application Requirement": "Requisito de Aplicação da Passiva",
    "Passive On-Hit Application": "Aplicação do Efeito Passivo ao Contato",
    "Target Swapping": "Troca de Alvo",
    "NEW": "NOVO",
    # Diversos vistos nos patches reais (alguns específicos de campeão —
    # "Nail"/"Prego" é o efeito do Locke, "Lash"/"Golpe" é o do Sylas)
    "Stolen Stats": "Atributos Roubados",
    "Base Damage - Nail": "Dano Base - Prego",
    "Three Nails Damage": "Dano dos Três Pregos",
    "Grey Health Base Value": "Valor Base da Vida Cinza",
    "Damage per Packmate": "Dano por Companheiro de Matilha",
    "Caustic Wounds": "Feridas Cáusticas",
}


def translate_field_label(field_label: str) -> str:
    """Tradução exata (case-sensitive de propósito — a nota oficial
    sempre capitaliza os rótulos do mesmo jeito) ou o próprio texto em
    inglês se não tiver entrada no dicionário."""
    return FIELD_LABEL_TRANSLATIONS.get(field_label, field_label)


def translate_spell_names(
    changes: list[dict], champion_spells_ptbr: dict[str, dict[str, str]]
) -> list[dict]:
    """`champion_spells_ptbr` mapeia `champion_id` -> {"Q": nome_pt, "W":
    nome_pt, ..., "passive": nome_pt, "_en": {"Q": nome_en, ...}} — quem
    monta isso é `compute_patch_changes.py` (busca a Data Dragon em
    pt_BR só pros campeões que aparecem em `changes`). Troca
    `spell_name` quando o nome em inglês bate com QUALQUER posição do
    kit (não só a tecla que a nota oficial reportou — ver docstring do
    módulo pro caso real da Naafiri) — protege contra sobrescrever com
    a tradução errada só nos casos de habilidade com mais de um
    "estado" (Data Dragon guarda um nome só por posição, então o nome
    do estado "errado" não bate com nenhuma)."""
    translated = []
    for change in changes:
        change = dict(change)
        champion_spells = champion_spells_ptbr.get(change["champion_id"])
        if champion_spells and change["spell_name"]:
            spell_name_lower = change["spell_name"].strip().lower()
            for slot, name_en in champion_spells.get("_en", {}).items():
                if name_en and name_en.lower() == spell_name_lower:
                    name_pt = champion_spells.get(slot)
                    if name_pt:
                        change["spell_name"] = name_pt
                    break
        change["field_label"] = translate_field_label(change["field_label"])
        translated.append(change)
    return translated
