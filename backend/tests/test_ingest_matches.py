"""`_patch_sequence`: matemática pura, sem rede. Revisão técnica §1.6 —
antes disso, um `version_label` em formato inesperado (já aconteceu em
builds de PBE/evento) levantava um `ValueError` genérico do `int()` sem
dizer qual valor causou o problema."""

import pytest

from app.db.models import Match
from app.jobs import ingest_matches
from app.jobs.ingest_matches import _patch_sequence, _process_summoner


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


class _FakeMatchRiotAdapter:
    """Dublê que devolve um payload Match-V5 minimalista, mas com campos
    extras (PUUID, Riot ID, `challenges` fora do subconjunto essencial) pra
    provar que `_process_summoner` de fato corta tudo isso antes de gravar
    `raw_payload` (Sprint 2 item 14)."""

    def get_match_ids_by_puuid(self, puuid, count, queue, start_time):
        return ["BR1_1000000001"]

    def get_match(self, match_id):
        return {
            "info": {
                "gameVersion": "16.15.1",
                "platformId": "BR1",
                "queueId": 420,
                "gameStartTimestamp": 1720000000000,
                "gameDuration": 1800,
                "participants": [
                    {
                        "puuid": "puuid-secreto",
                        "riotIdGameName": "Fulano",
                        "riotIdTagline": "BR1",
                        "championId": 103,
                        "championName": "Ahri",
                        "teamId": 100,
                        "win": True,
                        "role": "SOLO",
                        "lane": "MIDDLE",
                        "teamPosition": "MIDDLE",
                        "kills": 5,
                        "deaths": 2,
                        "assists": 7,
                        "item0": 1,
                        "item1": 2,
                        "item2": 3,
                        "item3": 4,
                        "item4": 5,
                        "item5": 6,
                        "challenges": {"campo_nunca_usado": 123},
                        "perks": {
                            "styles": [
                                {
                                    "description": "primaryStyle",
                                    "style": 8100,
                                    "selections": [{"perk": 8112}],
                                },
                                {"description": "subStyle", "style": 8000, "selections": []},
                            ]
                        },
                    }
                ],
                "teams": [{"teamId": 100, "bans": [{"championId": 55, "pickTurn": 1}]}],
            }
        }


def test_process_summoner_trims_raw_payload_to_essential_subset(monkeypatch, db_session):
    """Sprint 2 item 14 (revisão técnica §2.2/§4.3): `raw_payload` grava só
    `participants[].{championId,teamPosition,win,perks,item0-5}` +
    `teams[].{teamId,bans}` — PUUID/Riot ID nunca entram (retenção, rodada
    18) e campos de bloat como `challenges` também saem, mesmo sem serem
    sensíveis."""
    monkeypatch.setattr(ingest_matches, "SessionLocal", lambda: db_session)

    result = _process_summoner(
        index=1,
        puuid="puuid-secreto",
        riot=_FakeMatchRiotAdapter(),
        queue_id=420,
        tier="GOLD",
        matches_per_summoner=1,
        start_time=0,
        run_id="test-run",
        region="br1",
    )
    assert result == {"new_matches": 1, "skipped_existing": 0, "failed": False}

    match = db_session.query(Match).filter_by(match_id="BR1_1000000001").one()
    assert match.raw_payload == {
        "info": {
            "participants": [
                {
                    "championId": 103,
                    "teamPosition": "MIDDLE",
                    "win": True,
                    "item0": 1,
                    "item1": 2,
                    "item2": 3,
                    "item3": 4,
                    "item4": 5,
                    "item5": 6,
                    "perks": {
                        "styles": [
                            {
                                "description": "primaryStyle",
                                "style": 8100,
                                "selections": [{"perk": 8112}],
                            },
                            {"description": "subStyle", "style": 8000, "selections": []},
                        ]
                    },
                }
            ],
            "teams": [{"teamId": 100, "bans": [{"championId": 55, "pickTurn": 1}]}],
        }
    }
