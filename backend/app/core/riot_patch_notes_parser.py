"""Parser puro do HTML da seção "Champions" da nota oficial de patch da
Riot (leagueoflegends.com) — sem rede/banco, testável com fixture de
HTML (mesmo padrão de `patch_notes_diff.py`). Quem busca o HTML de
verdade é `app/adapters/riot_patch_notes.py`.

Contexto (achado com dados reais, investigando por que `patch_notes_diff.py`
mostrava mudanças falsas e perdia campeões inteiros como o Locke): a
página oficial guarda o corpo da nota como HTML dentro do payload
Next.js (`__NEXT_DATA__` -> `props.pageProps.page.blades[].richText.body`),
com uma estrutura bem regular:

    <header class="header-primary">Champions</header>
    <div class="content-border">
      <div class="patch-change-block ...">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <blockquote class="blockquote context">...comentário do designer...</blockquote>
        <h4 class="change-detail-title">Base Stats</h4>
        <ul><li><strong>Health</strong>: 655 ⇒ <strong>620</strong></li></ul>
        <h4 class="change-detail-title ability-title">Q - Ritual Nails</h4>
        <ul><li><strong>Base Damage - Nail</strong>: ... ⇒ <strong>...</strong></li></ul>
      </div>
    </div>
    ...
    <header class="header-primary">Items</header>
    ...

Escopo deliberado (pedido do usuário): só a seção "Champions" — nada de
Items/Runes/ARAM/Arena/TFT, que ficam em seções próprias na mesma
página e reaproveitam os mesmos nomes de campeão em outro contexto
(ex: "Locke" também aparece dentro de "Arena", com números diferentes).

Cada `<li>` com exatamente 2 `<strong>` é uma mudança quantificável
("Label: antes ⇒ depois" ou "Label: ⇒ Removed"); `<li>` com 1 `<strong>`
só é nota qualitativa (ex: "Bugfix: corrigido bug onde...") sem valor
antes/depois — não vira linha, não tem o que comparar."""

import re

from bs4 import BeautifulSoup, Tag

_ARROW = "⇒"


def normalize_slug(text: str) -> str:
    """Remove tudo que não é letra/número e deixa minúsculo — mesma
    normalização usada tanto pro `id="patch-NNN"` da Riot quanto pro
    nome de exibição da Data Dragon (`champions[id].name`), pra casar
    os dois lados sem depender do `champion_id` interno (que às vezes
    diverge do nome — ex: Data Dragon usa "MonkeyKing" pro campeão
    exibido como "Wukong")."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _parse_change_li(li: Tag) -> tuple[str, str, str] | None:
    strongs = li.find_all("strong")
    if len(strongs) != 2:
        return None
    label = strongs[0].get_text(strip=True)
    after = strongs[1].get_text(strip=True)
    full_text = li.get_text(" ", strip=True)
    rest = full_text[len(label) :].strip()
    if rest.startswith(":"):
        rest = rest[1:].strip()
    if rest.endswith(after):
        rest = rest[: -len(after)].strip()
    if rest.endswith(_ARROW):
        rest = rest[:-1].strip()
    return label, rest, after


def _parse_ability_heading(text: str) -> tuple[str, str | None, str | None]:
    """Retorna (category, spell_key, spell_name) a partir do texto do
    `<h4>` — "Base Stats", "Passive - Nome" ou "Q - Nome" (R aparece
    duas vezes pra campeões com ult de dois estados, ex: Riven "R -
    Blade of the Exile" / "R - Wind Slash", ambas ficam category=spell
    spell_key="R", cada uma com seu próprio spell_name)."""
    stripped = text.strip()
    if stripped.lower() == "base stats":
        return "stat", None, None
    if stripped.lower().startswith("passive"):
        _, _, name = stripped.partition("-")
        return "passive", None, (name.strip() or None)
    match = re.match(r"^(Q|W|E|R)\s*-\s*(.+)$", stripped)
    if match:
        return "spell", match.group(1), match.group(2).strip()
    return "spell", None, stripped


def parse_champions_section(
    html: str, slug_to_champion_id: dict[str, str]
) -> list[dict]:
    """`slug_to_champion_id` já vem pronto de fora (`normalize_slug` do
    nome de exibição de cada campeão da Data Dragon) — campeão sem
    correspondência é pulado silenciosamente (lista de retorno não
    inclui ele), mesma filosofia de "pular em vez de chutar" já usada
    em `compute_patch_changes._fetch_all_details` pros IDs `Jade_*`."""
    soup = BeautifulSoup(html, "html.parser")
    root = soup.find(id="patch-notes-container")
    if root is None:
        return []

    changes: list[dict] = []
    in_champions_section = False
    for element in root.find_all(recursive=False):
        if element.name == "header":
            in_champions_section = element.get_text(strip=True) == "Champions"
            continue
        if not in_champions_section or element.name != "div":
            continue
        if "content-border" not in (element.get("class") or []):
            continue

        h3 = element.find("h3", class_="change-title")
        if h3 is None:
            continue
        raw_slug = h3.get("id", "")
        slug = normalize_slug(
            raw_slug.removeprefix("patch-") if raw_slug else h3.get_text(strip=True)
        )
        champion_id = slug_to_champion_id.get(slug)
        if champion_id is None:
            continue

        for h4 in element.find_all("h4"):
            category, spell_key, spell_name = _parse_ability_heading(
                h4.get_text(strip=True)
            )
            ul = h4.find_next_sibling("ul")
            if ul is None:
                continue
            for li in ul.find_all("li", recursive=False):
                parsed = _parse_change_li(li)
                if parsed is None:
                    continue
                label, before, after = parsed
                field = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
                changes.append(
                    {
                        "champion_id": champion_id,
                        "category": category,
                        "spell_key": spell_key,
                        "spell_name": spell_name,
                        "field": field,
                        "field_label": label,
                        "before_value": before,
                        "after_value": after,
                    }
                )
    return changes
