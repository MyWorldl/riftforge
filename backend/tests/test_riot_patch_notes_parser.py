"""Parser puro do HTML da nota oficial de patch (sem rede) — fixture
sintética modelada no HTML real confirmado contra o patch 26.15 (ver
`app/core/riot_patch_notes_parser.py` pro achado que motivou isso)."""

from app.core.riot_patch_notes_parser import normalize_slug, parse_champions_section

SLUG_MAP = {
    "locke": "Locke",
    "riven": "Riven",
    "kaisa": "Kaisa",
    "wukong": "MonkeyKing",
}


def _wrap(champions_html: str, extra_sections: str = "") -> str:
    return f"""
    <div id="patch-notes-container">
      <header class="header-primary">Patch Highlights</header>
      <div class="content-border"><p>Bla bla.</p></div>
      <header class="header-primary">Champions</header>
      {champions_html}
      <header class="header-primary">Items</header>
      <div class="content-border">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <h4 class="change-detail-title">Base Stats</h4>
        <ul><li><strong>Cost</strong>: 100 ⇒ <strong>200</strong></li></ul>
      </div>
      {extra_sections}
    </div>
    """


def test_extrai_atributo_base_e_habilidade():
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <blockquote class="blockquote context"><p>Comentário do designer.</p></blockquote>
        <hr class="divider">
        <h4 class="change-detail-title">Base Stats</h4>
        <ul><li><strong>Health</strong>: 655 ⇒ <strong>620</strong></li></ul>
        <hr class="divider">
        <h4 class="change-detail-title ability-title"><img src="LockeQ.png">Q - Ritual Nails</h4>
        <ul>
          <li><strong>Base Damage - Nail</strong>: 50 / 58 / 66 ⇒ <strong>40 / 48 / 56</strong></li>
        </ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 2

    stat = next(c for c in result if c["category"] == "stat")
    assert stat["champion_id"] == "Locke"
    assert stat["field_label"] == "Health"
    assert stat["before_value"] == "655"
    assert stat["after_value"] == "620"
    assert stat["spell_key"] is None

    spell = next(c for c in result if c["category"] == "spell")
    assert spell["spell_key"] == "Q"
    assert spell["spell_name"] == "Ritual Nails"
    assert spell["field_label"] == "Base Damage - Nail"
    assert spell["before_value"] == "50 / 58 / 66"
    assert spell["after_value"] == "40 / 48 / 56"


def test_extrai_passiva():
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-kaisa">Kai'Sa</h3>
        <h4 class="change-detail-title ability-title"><img src="x.png">Passive - Second Skin</h4>
        <ul><li><strong>Caustic Wounds</strong>: 4 - 24 ⇒ <strong>4 - 30</strong></li></ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 1
    assert result[0]["category"] == "passive"
    assert result[0]["spell_key"] is None
    assert result[0]["spell_name"] == "Second Skin"


def test_habilidade_com_dois_estados_mesma_tecla():
    # Riven: R tem dois estados de conjuração ("Blade of the Exile" /
    # "Wind Slash"), ambos com spell_key "R" mas spell_name diferente —
    # caso real confirmado no patch 26.15.
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-riven">Riven</h3>
        <h4 class="change-detail-title ability-title">R - Blade of the Exile</h4>
        <ul><li><strong>Bonus AD Ratio</strong>: 25% ⇒ <strong>20%</strong></li></ul>
        <h4 class="change-detail-title ability-title">R - Wind Slash</h4>
        <ul><li><strong>Bonus AD Ratio</strong>: 60% ⇒ <strong>55%</strong></li></ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 2
    assert {c["spell_name"] for c in result} == {"Blade of the Exile", "Wind Slash"}
    assert all(c["spell_key"] == "R" for c in result)


def test_item_sem_valor_quantificavel_e_ignorado():
    # "Bugfix: ..." só tem 1 <strong> (o rótulo) — sem valor antes/depois
    # pra comparar, não vira linha (mesmo padrão do "Total Attack
    # Animation: Adjusted to feel better..." visto no patch real).
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <h4 class="change-detail-title ability-title">R - Ultimate</h4>
        <ul>
          <li><strong>Stolen Stats</strong>: 13% ⇒ <strong>10%</strong></li>
          <li><strong>Bugfix</strong>: Corrigido um bug onde o dano dobrava.</li>
        </ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 1
    assert result[0]["field_label"] == "Stolen Stats"


def test_valor_removido_sem_antes_explicito():
    # "Label : Removed" — 2 <strong> mas sem seta, a Riot não mostra o
    # valor "antes" nesse caso (achado real: Bel'Veth "Out of Combat
    # Move Speed").
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <h4 class="change-detail-title ability-title">R - Ultimate</h4>
        <ul><li><strong>Out of Combat Move Speed</strong>: <strong>Removed</strong></li></ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 1
    assert result[0]["before_value"] == ""
    assert result[0]["after_value"] == "Removed"


def test_secoes_fora_de_champions_sao_ignoradas():
    # Locke aparece de novo em "Items" (fixture) com um valor diferente
    # — só a versão dentro de "Champions" deve entrar no resultado.
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-locke">Locke</h3>
        <h4 class="change-detail-title">Base Stats</h4>
        <ul><li><strong>Health</strong>: 655 ⇒ <strong>620</strong></li></ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert len(result) == 1
    assert result[0]["after_value"] == "620"


def test_campeao_nao_mapeado_e_ignorado():
    html = _wrap("""
      <div class="content-border">
        <h3 class="change-title" id="patch-campeao-desconhecido">Campeão Desconhecido</h3>
        <h4 class="change-detail-title">Base Stats</h4>
        <ul><li><strong>Health</strong>: 500 ⇒ <strong>510</strong></li></ul>
      </div>
    """)
    result = parse_champions_section(html, SLUG_MAP)
    assert result == []


def test_normalize_slug_remove_pontuacao_e_espaco():
    assert normalize_slug("Bel'Veth") == "belveth"
    assert normalize_slug("Kai'Sa") == "kaisa"
    assert normalize_slug("Xin Zhao") == "xinzhao"
    assert normalize_slug("Dr. Mundo") == "drmundo"
