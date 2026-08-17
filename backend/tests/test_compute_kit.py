"""_average_spell_range: matemática pura, sem rede."""

import httpx

from app.jobs.compute_kit import (
    _average_spell_range,
    _fetch_meraki_ratings,
    _load_manual_tags,
)


def test_average_spell_range_ignores_self_target_abilities():
    spells = [
        {"range": [625, 625]},
        {"range": [1, 1]},  # auto-alvo, deve ser ignorado
        {"range": 500},
    ]
    assert _average_spell_range(spells) == (625 + 500) / 2


def test_average_spell_range_returns_none_when_all_self_target():
    spells = [{"range": [1, 1]}, {"range": [1]}]
    assert _average_spell_range(spells) is None


def test_average_spell_range_empty_list():
    assert _average_spell_range([]) is None


def test_manual_tags_pilot_batch_has_expected_shape():
    """Lote piloto (rodada 22, backlog 5.1) — só confere que o arquivo
    versionado em `data/kit_manual_tags.json` carrega e tem os campos que
    `compute_kit.py` depende (`champion_id`, `cc_score`, `mobilidade_score`),
    com notas 0-10. Não valida o julgamento em si — isso é humano."""
    tags = _load_manual_tags()
    assert len(tags) >= 10

    for champion_id, tag in tags.items():
        assert tag["champion_id"] == champion_id
        assert 0 <= tag["cc_score"] <= 10
        assert 0 <= tag["mobilidade_score"] <= 10
        assert tag["tagger_id"]
        assert tag["rubrica_versao"]
        assert tag["notas"]["cc"]
        assert tag["notas"]["mobilidade"]


class _FakeMerakiAdapter:
    """Sprint 5 (16/08): dublê sem rede — `get_champion_attribute_ratings`
    devolve `ratings_by_id[champion_id]` (pode ser `None`, simulando 404 —
    campeão fora do dataset, achado real da auditoria: curadoria
    comunitária atrasa em relação ao patch mais novo da Riot)."""

    def __init__(self, ratings_by_id: dict[str, dict | None]):
        self.ratings_by_id = ratings_by_id

    async def get_champion_attribute_ratings(self, champion_id: str) -> dict | None:
        return self.ratings_by_id.get(champion_id)


async def test_fetch_meraki_ratings_returns_dict_keyed_by_champion():
    adapter = _FakeMerakiAdapter(
        {"Ahri": {"control": 2, "mobility": 1}, "Zed": {"control": 1, "mobility": 3}}
    )
    result = await _fetch_meraki_ratings(adapter, ["Ahri", "Zed"])
    assert result == {
        "Ahri": {"control": 2, "mobility": 1},
        "Zed": {"control": 1, "mobility": 3},
    }


async def test_fetch_meraki_ratings_keeps_none_for_missing_champion():
    """Campeão recém-lançado, ainda fora do dataset da Meraki — `None`
    explícito na chave, não a ausência da chave (o chamador em `compute()`
    usa isso pra cair no fallback "sem CC/Mobilidade", nunca quebra)."""
    adapter = _FakeMerakiAdapter({"NovoCampeao": None})
    result = await _fetch_meraki_ratings(adapter, ["NovoCampeao"])
    assert result == {"NovoCampeao": None}


class _FlakyMerakiAdapter:
    """Um campeão levanta `httpx.HTTPError` (achado real ao rodar contra
    produção: 502 transitório da Meraki no meio de ~160 chamadas
    concorrentes) — os outros continuam normais."""

    def __init__(self, failing: set[str]):
        self.failing = failing

    async def get_champion_attribute_ratings(self, champion_id: str) -> dict | None:
        if champion_id in self.failing:
            raise httpx.HTTPStatusError(
                "502",
                request=httpx.Request("GET", "https://x"),
                response=httpx.Response(502),
            )
        return {"control": 1, "mobility": 1}


async def test_fetch_meraki_ratings_tolerates_single_champion_failure():
    adapter = _FlakyMerakiAdapter(failing={"Teemo"})
    result = await _fetch_meraki_ratings(adapter, ["Ahri", "Teemo", "Zed"])
    assert result == {
        "Ahri": {"control": 1, "mobility": 1},
        "Teemo": None,
        "Zed": {"control": 1, "mobility": 1},
    }
