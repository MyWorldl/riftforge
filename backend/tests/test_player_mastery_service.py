"""`get_top_mastery`: sem rede real — dublês nos adapters compartilhados
(`app.core.adapters.riot_api`/`data_dragon`, mesmo padrão de
`test_catalog_champions_proxies_data_dragon` em test_routes.py). `db_session`
(fixture de `conftest.py`) cobre a parte real de banco — snapshot do selo
Monochampion."""

import pytest

from app.core.adapters import data_dragon, riot_api
from app.core.cache import _cache
from app.db.models import PlayerChampionMasterySnapshot
from app.services.player_mastery_service import (
    _determine_monochampion,
    get_top_mastery,
)


@pytest.fixture(autouse=True)
def _clear_ddragon_cache():
    """`cached()` é um TTLCache de processo inteiro (`app/core/cache.py`)
    — sem limpar, o segundo teste deste arquivo reaproveitaria o
    `name_by_riot_id` populado pelo primeiro em vez do seu próprio dublê."""
    _cache.clear()
    yield
    _cache.clear()


def _setup_common_doubles(monkeypatch, all_mastery_entries):
    async def fake_version():
        return "16.15.1"

    async def fake_name_by_riot_id(version):
        return {103: "Ahri", 1: "Annie"}

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(
        data_dragon, "get_champion_name_by_riot_id", fake_name_by_riot_id
    )
    monkeypatch.setattr(
        riot_api,
        "get_account_by_riot_id",
        lambda *a, **k: {"puuid": "puuid-123"},
    )
    monkeypatch.setattr(
        riot_api,
        "get_champion_mastery_all_by_puuid",
        lambda *a, **k: all_mastery_entries,
    )


async def test_get_top_mastery_resolves_champion_ids_and_orders_from_riot(
    monkeypatch, db_session
):
    _setup_common_doubles(
        monkeypatch,
        [
            {
                "championId": 103,
                "championLevel": 7,
                "championPoints": 234_000,
                "lastPlayTime": 1_700_000_000_000,
            },
            {
                "championId": 1,
                "championLevel": 5,
                "championPoints": 50_000,
                "lastPlayTime": 1_690_000_000_000,
            },
        ],
    )

    result = await get_top_mastery(db_session, "Fulano", "BR1", "br1")

    assert result["maestrias"] == [
        {
            "champion_id": "Ahri",
            "champion_level": 7,
            "champion_points": 234_000,
            "last_play_time": 1_700_000_000_000,
        },
        {
            "champion_id": "Annie",
            "champion_level": 5,
            "champion_points": 50_000,
            "last_play_time": 1_690_000_000_000,
        },
    ]


async def test_get_top_mastery_falls_back_to_riot_id_when_champion_unknown(
    monkeypatch, db_session
):
    """Campeão novo que o Data Dragon ainda não conhece (mesma classe de
    fallback que `resolve_champion_id` já garante alhures) não deve
    quebrar a aba — devolve o ID numérico como string em vez de falhar."""

    async def fake_version():
        return "16.15.1"

    async def fake_name_by_riot_id(version):
        return {}

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(
        data_dragon, "get_champion_name_by_riot_id", fake_name_by_riot_id
    )
    monkeypatch.setattr(
        riot_api, "get_account_by_riot_id", lambda *a, **k: {"puuid": "puuid-123"}
    )
    monkeypatch.setattr(
        riot_api,
        "get_champion_mastery_all_by_puuid",
        lambda *a, **k: [
            {
                "championId": 9999,
                "championLevel": 3,
                "championPoints": 10_000,
                "lastPlayTime": 1_600_000_000_000,
            }
        ],
    )

    result = await get_top_mastery(db_session, "Fulano", "BR1", "br1")
    assert result["maestrias"][0]["champion_id"] == "9999"


async def test_get_top_mastery_records_monochampion_snapshot(monkeypatch, db_session):
    """Ahri domina (234k de 284k pontos totais) — grava 1 snapshot pra
    esse PUUID, mesmo payload já buscado pro top N, sem chamada extra."""
    _setup_common_doubles(
        monkeypatch,
        [
            {
                "championId": 103,
                "championLevel": 7,
                "championPoints": 234_000,
                "lastPlayTime": 1_700_000_000_000,
            },
            {
                "championId": 1,
                "championLevel": 5,
                "championPoints": 50_000,
                "lastPlayTime": 1_690_000_000_000,
            },
        ],
    )

    result = await get_top_mastery(db_session, "Fulano", "BR1", "br1")

    rows = db_session.query(PlayerChampionMasterySnapshot).all()
    assert len(rows) == 1
    assert rows[0].puuid == "puuid-123"
    assert rows[0].champion_id == "Ahri"
    assert rows[0].concentracao == pytest.approx(234_000 / 284_000)

    # Só 1 snapshot ainda — abaixo do piso de amostra (default 3), então
    # os números aparecem mas `ativo` fica False.
    assert result["monochampion"]["champion_id"] == "Ahri"
    assert result["monochampion"]["amostras"] == 1
    assert result["monochampion"]["ativo"] is False


async def test_get_top_mastery_no_snapshot_when_no_mastery_at_all(
    monkeypatch, db_session
):
    _setup_common_doubles(monkeypatch, [])

    result = await get_top_mastery(db_session, "Fulano", "BR1", "br1")

    assert db_session.query(PlayerChampionMasterySnapshot).count() == 0
    assert result["monochampion"] is None


def test_determine_monochampion_none_without_snapshots():
    assert _determine_monochampion([], threshold=0.5, min_snapshots=3) is None


def test_determine_monochampion_active_when_consistent_and_above_threshold():
    snapshots = [
        PlayerChampionMasterySnapshot(
            puuid="p",
            champion_id="Ahri",
            concentracao=c,
            pontos_campeao_lider=1,
            pontos_totais=1,
        )
        for c in [0.6, 0.55, 0.7]
    ]
    result = _determine_monochampion(snapshots, threshold=0.5, min_snapshots=3)
    assert result["champion_id"] == "Ahri"
    assert result["amostras"] == 3
    assert result["ativo"] is True


def test_determine_monochampion_ignores_single_bad_day_from_other_champion():
    """Ahri lidera 3 dos 4 dias retidos; um dia isolado com Annie na
    liderança não muda quem é o campeão do selo, nem entra na média —
    exatamente o cenário que o usuário descreveu ao pedir histórico em
    vez de cálculo só do momento."""
    snapshots = [
        PlayerChampionMasterySnapshot(
            puuid="p",
            champion_id="Ahri",
            concentracao=c,
            pontos_campeao_lider=1,
            pontos_totais=1,
        )
        for c in [0.6, 0.65, 0.7]
    ] + [
        PlayerChampionMasterySnapshot(
            puuid="p",
            champion_id="Annie",
            concentracao=0.9,
            pontos_campeao_lider=1,
            pontos_totais=1,
        )
    ]
    result = _determine_monochampion(snapshots, threshold=0.5, min_snapshots=3)
    assert result["champion_id"] == "Ahri"
    assert result["amostras"] == 3
    assert result["concentracao_media"] == pytest.approx((0.6 + 0.65 + 0.7) / 3)


def test_determine_monochampion_inactive_below_sample_floor():
    snapshots = [
        PlayerChampionMasterySnapshot(
            puuid="p",
            champion_id="Ahri",
            concentracao=0.9,
            pontos_campeao_lider=1,
            pontos_totais=1,
        )
        for _ in range(2)
    ]
    result = _determine_monochampion(snapshots, threshold=0.5, min_snapshots=3)
    assert result["amostras"] == 2
    assert result["ativo"] is False


def test_determine_monochampion_inactive_below_concentration_threshold():
    snapshots = [
        PlayerChampionMasterySnapshot(
            puuid="p",
            champion_id="Ahri",
            concentracao=0.3,
            pontos_campeao_lider=1,
            pontos_totais=1,
        )
        for _ in range(5)
    ]
    result = _determine_monochampion(snapshots, threshold=0.5, min_snapshots=3)
    assert result["amostras"] == 5
    assert result["ativo"] is False
