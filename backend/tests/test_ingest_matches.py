"""`_patch_sequence`: matemática pura, sem rede. Revisão técnica §1.6 —
antes disso, um `version_label` em formato inesperado (já aconteceu em
builds de PBE/evento) levantava um `ValueError` genérico do `int()` sem
dizer qual valor causou o problema."""

import pytest

from app.jobs import ingest_matches
from app.jobs.ingest_matches import _patch_sequence


def test_patch_sequence_orders_by_major_then_minor():
    assert _patch_sequence("16.9") < _patch_sequence("16.14")
    assert _patch_sequence("15.24") < _patch_sequence("16.1")


def test_patch_sequence_rejects_unexpected_format():
    with pytest.raises(ValueError, match="version_label em formato inesperado"):
        _patch_sequence("16.9.1-pbe")


class _FakeAdapter:
    """Dublê de `RiotApiAdapter` — só grava os argumentos de construção,
    nunca chama a Riot de verdade."""

    last_construct_args: dict = {}

    def __init__(self, platform_region=None, continent_region=None):
        _FakeAdapter.last_construct_args = {
            "platform_region": platform_region,
            "continent_region": continent_region,
        }

    def get_league_entries(self, queue, tier, division):
        return []


def test_ingest_region_resolves_adapter_to_correct_continent_shard(monkeypatch):
    """Item novo (filtro de região, piloto br1+euw1) — a linha de maior
    risco do Lote P: um bug aqui ingeriria partida de `br1` etiquetada
    como `euw1` em silêncio. `--region euw1` precisa bater no shard
    Match-V5 da Europa (`PLATFORM_TO_CONTINENT["euw1"] == "europe"`), não
    ficar preso em `americas` (o default)."""
    monkeypatch.setattr(ingest_matches, "RiotApiAdapter", _FakeAdapter)
    monkeypatch.setattr(ingest_matches, "init_db", lambda: None)

    ingest_matches.ingest(region="euw1", puuid_limit=0)

    assert _FakeAdapter.last_construct_args == {
        "platform_region": "euw1",
        "continent_region": "europe",
    }


def test_ingest_region_omitted_falls_back_to_settings_default(monkeypatch):
    """Omitir `--region` precisa continuar se comportando exatamente como
    antes desta mudança — `riot_platform_region` da config (`br1`)."""
    monkeypatch.setattr(ingest_matches, "RiotApiAdapter", _FakeAdapter)
    monkeypatch.setattr(ingest_matches, "init_db", lambda: None)

    ingest_matches.ingest(puuid_limit=0)

    assert _FakeAdapter.last_construct_args == {
        "platform_region": "br1",
        "continent_region": "americas",
    }
