"""_average_spell_range: matemática pura, sem rede."""

from app.jobs.compute_kit import _average_spell_range, _load_manual_tags


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
