"""Revisão técnica §1.5: um teste por rota — antes desta rodada, nenhuma
das ~500 linhas de `main.py` (hoje dividido em `app/api/routers/`) tinha
cobertura de rota HTTP, só as funções puras por trás delas."""

from app.core.config import get_settings
from app.db.models import (
    ChampionBuildRecommendation,
    ChampionKitScore,
    ChampionMatchup,
    ChampionMetaContext,
    ChampionScore,
    Patch,
    PlayerRoadmapStep,
)


def _seed_patch(db_session, version_label: str, sequence: int) -> Patch:
    patch = Patch(version_label=version_label, patch_sequence=sequence)
    db_session.add(patch)
    db_session.commit()
    return patch


def _seed_champion_score(db_session, **overrides) -> ChampionScore:
    defaults = dict(
        patch="16.14",
        elo_tier="GOLD",
        lane="BOTTOM",
        champion_id="Caitlyn",
        region="br1",
        performance_score=80.0,
        kit_score=60.0,
        build_score=70.0,
        meta_score=50.0,
        pesos_usados={"performance": 0.4, "kit": 0.25, "build": 0.25, "meta": 0.1},
        score_final=69.0,
        score_tier="A",
        confianca=10.0,
        tier_provisorio=True,
        trap_flag=False,
        model_version="v1",
    )
    defaults.update(overrides)
    row = ChampionScore(**defaults)
    db_session.add(row)
    db_session.commit()
    return row


def _seed_kit_score(db_session, **overrides) -> ChampionKitScore:
    defaults = dict(
        patch="16.14",
        champion_id="Caitlyn",
        cc_score=None,
        dano_score=6.0,
        mobilidade_score=None,
        alcance_score=4.0,
        resiliencia_score=5.0,
        kit_score=50.0,
        versao_calculo="v1",
        eixos_disponiveis=["dano", "alcance", "resiliencia"],
    )
    defaults.update(overrides)
    row = ChampionKitScore(**defaults)
    db_session.add(row)
    db_session.commit()
    return row


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_scores_champions_empty_db_returns_empty_list(client):
    response = client.get("/scores/champions?elo_tier=GOLD")
    assert response.status_code == 200
    assert response.json() == []


def test_scores_champions_with_data(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_champion_score(db_session)

    response = client.get("/scores/champions?elo_tier=GOLD&patch=16.14")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["champion_id"] == "Caitlyn"
    assert row["score_final"] == 69.0
    # Item 4.3: explicacao/perfil_poder não devem mais vir embutidos aqui.
    assert "explicacao" not in row
    assert "perfil_poder" not in row


def test_scores_champions_region_defaults_to_br1_and_isolates_euw1(client, db_session):
    """Item novo (filtro de região, piloto br1+euw1) — request sem `region`
    continua idêntica a `?region=br1` (retrocompatível), e uma linha
    `euw1` semeada junto nunca vaza pra fora do seu próprio filtro. Pega
    qualquer `.filter_by(region=...)` esquecido em algum dos ~20 métodos
    de repositório tocados neste lote."""
    _seed_patch(db_session, "16.14", 16014)
    _seed_champion_score(db_session, champion_id="Caitlyn", region="br1")
    _seed_champion_score(db_session, champion_id="Jinx", region="euw1")

    default_response = client.get("/scores/champions?elo_tier=GOLD&patch=16.14")
    assert [r["champion_id"] for r in default_response.json()] == ["Caitlyn"]

    br1_response = client.get("/scores/champions?elo_tier=GOLD&patch=16.14&region=br1")
    assert [r["champion_id"] for r in br1_response.json()] == ["Caitlyn"]

    euw1_response = client.get(
        "/scores/champions?elo_tier=GOLD&patch=16.14&region=euw1"
    )
    assert [r["champion_id"] for r in euw1_response.json()] == ["Jinx"]


def test_scores_champions_explain_endpoint(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_champion_score(db_session)

    response = client.get(
        "/scores/champions/Caitlyn/explain?lane=BOTTOM&elo_tier=GOLD&patch=16.14"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["explicacao"]["base"] == 50.0
    assert body["perfil_poder"]["classificacao"] in {
        "estrutural",
        "meta",
        "equilibrado",
        "indeterminado",
    }


def test_scores_champions_explain_404_when_not_found(client):
    response = client.get(
        "/scores/champions/Nonexistent/explain?lane=BOTTOM&elo_tier=GOLD&patch=16.14"
    )
    assert response.status_code == 404


def test_scores_patches(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_champion_score(db_session)

    response = client.get("/scores/patches?elo_tier=GOLD")
    assert response.status_code == 200
    assert response.json() == ["16.14"]


def test_scores_history_empty(client):
    response = client.get("/scores/history?champion_id=Caitlyn&elo_tier=GOLD")
    assert response.status_code == 200
    assert response.json() == []


def test_matchups_empty(client):
    response = client.get("/matchups?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD")
    assert response.status_code == 200
    assert response.json() == {"patch": None, "confrontos": []}


def test_matchups_region_isolation(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    db_session.add_all(
        [
            ChampionMatchup(
                patch="16.14",
                tier="GOLD",
                lane="BOTTOM",
                champion_id="Caitlyn",
                opponent_champion_id="Jinx",
                region="br1",
                games=10,
                wins=6,
            ),
            ChampionMatchup(
                patch="16.14",
                tier="GOLD",
                lane="BOTTOM",
                champion_id="Caitlyn",
                opponent_champion_id="Ashe",
                region="euw1",
                games=20,
                wins=5,
            ),
        ]
    )
    db_session.commit()

    default_response = client.get(
        "/matchups?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD"
    )
    assert [
        c["opponent_champion_id"] for c in default_response.json()["confrontos"]
    ] == ["Jinx"]

    euw1_response = client.get(
        "/matchups?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD&region=euw1"
    )
    assert [c["opponent_champion_id"] for c in euw1_response.json()["confrontos"]] == [
        "Ashe"
    ]


def test_builds_recommended_none_when_missing(client):
    response = client.get(
        "/builds/recommended?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD"
    )
    assert response.status_code == 200
    assert response.json() is None


def test_builds_recommended_region_isolation(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    db_session.add_all(
        [
            ChampionBuildRecommendation(
                patch="16.14",
                tier="GOLD",
                lane="BOTTOM",
                champion_id="Caitlyn",
                region="br1",
                item_build=[1, 2, 3],
                item_build_games=10,
                item_build_win_rate=0.6,
                keystone_id=None,
                primary_style_id=None,
                sub_style_id=None,
                rune_games=0,
                rune_win_rate=0.0,
            ),
            ChampionBuildRecommendation(
                patch="16.14",
                tier="GOLD",
                lane="BOTTOM",
                champion_id="Caitlyn",
                region="euw1",
                item_build=[4, 5, 6],
                item_build_games=8,
                item_build_win_rate=0.7,
                keystone_id=None,
                primary_style_id=None,
                sub_style_id=None,
                rune_games=0,
                rune_win_rate=0.0,
            ),
        ]
    )
    db_session.commit()

    default_response = client.get(
        "/builds/recommended?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD"
    )
    assert default_response.json()["item_build"] == [1, 2, 3]

    euw1_response = client.get(
        "/builds/recommended?champion_id=Caitlyn&lane=BOTTOM&elo_tier=GOLD&region=euw1"
    )
    assert euw1_response.json()["item_build"] == [4, 5, 6]


def test_rankings_empty(client):
    response = client.get("/rankings?region=br1")
    assert response.status_code == 200
    assert response.json() == []


def test_meta_coverage_empty_db(client):
    response = client.get("/meta/coverage?elo_tier=GOLD")
    assert response.status_code == 200
    assert response.json() == {"patch": None, "elo_tier": "GOLD", "cobertura": []}


def test_meta_coverage_with_data(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    db_session.add_all(
        [
            ChampionMetaContext(
                patch="16.14",
                tier="GOLD",
                lane="JUNGLE",
                champion_id="Ahri",
                region="br1",
                cobertura=0.5,
                nota_cobertura=50.0,
                slope_performance=0.0,
                patches_usados_tendencia=1,
                nota_tendencia=50.0,
                meta_score=50.0,
            ),
            ChampionMetaContext(
                patch="16.14",
                tier="GOLD",
                lane="TOP",
                champion_id="Ahri",
                region="br1",
                cobertura=0.8,
                nota_cobertura=80.0,
                slope_performance=0.0,
                patches_usados_tendencia=1,
                nota_tendencia=50.0,
                meta_score=50.0,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/meta/coverage?elo_tier=GOLD")
    assert response.status_code == 200
    body = response.json()
    assert body["patch"] == "16.14"
    assert {(row["lane"], row["cobertura"]) for row in body["cobertura"]} == {
        ("JUNGLE", 0.5),
        ("TOP", 0.8),
    }


def test_meta_coverage_region_isolation(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    db_session.add_all(
        [
            ChampionMetaContext(
                patch="16.14",
                tier="GOLD",
                lane="JUNGLE",
                champion_id="Ahri",
                region="br1",
                cobertura=0.5,
                nota_cobertura=50.0,
                slope_performance=0.0,
                patches_usados_tendencia=1,
                nota_tendencia=50.0,
                meta_score=50.0,
            ),
            ChampionMetaContext(
                patch="16.14",
                tier="GOLD",
                lane="JUNGLE",
                champion_id="Ahri",
                region="euw1",
                cobertura=0.9,
                nota_cobertura=90.0,
                slope_performance=0.0,
                patches_usados_tendencia=1,
                nota_tendencia=50.0,
                meta_score=50.0,
            ),
        ]
    )
    db_session.commit()

    default_response = client.get("/meta/coverage?elo_tier=GOLD")
    assert default_response.json()["cobertura"] == [
        {"lane": "JUNGLE", "cobertura": 0.5}
    ]

    euw1_response = client.get("/meta/coverage?elo_tier=GOLD&region=euw1")
    assert euw1_response.json()["cobertura"] == [{"lane": "JUNGLE", "cobertura": 0.9}]


def test_patch_notes_with_fewer_than_two_patches(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_champion_score(db_session)

    response = client.get("/patch-notes?elo_tier=GOLD")
    assert response.status_code == 200
    body = response.json()
    assert body["patch_atual"] == "16.14"
    assert body["patch_anterior"] is None
    assert body["mudancas_tier"] == []


def test_patch_notes_changes_empty(client):
    response = client.get("/patch-notes/changes")
    assert response.status_code == 200
    assert response.json() == {
        "patch_atual": None,
        "patch_anterior": None,
        "mudancas": [],
    }


def test_stats_champions_empty(client):
    response = client.get("/stats/champions?tier=GOLD")
    assert response.status_code == 200
    assert response.json() == []


def test_riot_proxy_returns_501_without_real_key(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "riot_api_key", "changeme")
    response = client.get("/riot/league-entries")
    assert response.status_code == 501


def test_player_lookup_returns_501_without_real_key(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "riot_api_key", "changeme")
    response = client.get("/player/lookup?game_name=Foo&tag_line=BR1")
    assert response.status_code == 501


def test_catalog_champions_proxies_data_dragon(client, monkeypatch):
    async def fake_version():
        return "16.15.1"

    async def fake_champions(version):
        return {"Ahri": {"id": "Ahri", "name": "Ahri"}}

    from app.core.adapters import data_dragon

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(data_dragon, "get_champions", fake_champions)

    response = client.get("/champions")
    assert response.status_code == 200
    body = response.json()
    assert body["patch"] == "16.15.1"
    assert "Ahri" in body["champions"]


def test_catalog_champion_detail_404_for_unknown_id_without_calling_ddragon(client, monkeypatch):
    """Sprint 2 item 9/10 (revisão técnica §2.1/§1.6): `champion_id`
    desconhecido nunca deve virar chamada ao Data Dragon nem entrada de
    cache — `get_champion_detail` do adapter nem é chamado."""
    async def fake_version():
        return "16.15.1"

    async def fake_champions(version):
        return {"Ahri": {"id": "Ahri", "name": "Ahri"}}

    async def unexpected_detail(version, champion_id):
        raise AssertionError("não deveria chamar o Data Dragon pra ID desconhecido")

    from app.core.adapters import data_dragon

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(data_dragon, "get_champions", fake_champions)
    monkeypatch.setattr(data_dragon, "get_champion_detail", unexpected_detail)

    response = client.get("/champions/NaoExiste")
    assert response.status_code == 404


def test_catalog_champion_detail_200_for_known_id(client, monkeypatch):
    async def fake_version():
        return "16.15.1"

    async def fake_champions(version):
        return {"Ahri": {"id": "Ahri", "name": "Ahri"}}

    async def fake_detail(version, champion_id):
        return {"id": champion_id, "spells": []}

    from app.core.adapters import data_dragon

    monkeypatch.setattr(data_dragon, "get_latest_version", fake_version)
    monkeypatch.setattr(data_dragon, "get_champions", fake_champions)
    monkeypatch.setattr(data_dragon, "get_champion_detail", fake_detail)

    response = client.get("/champions/Ahri")
    assert response.status_code == 200
    assert response.json()["champion"]["id"] == "Ahri"


def test_kit_profile_empty_db(client):
    response = client.get("/scores/kit-profile")
    assert response.status_code == 200
    assert response.json() == {"patch": None, "perfis": []}


def test_kit_profile_with_explicit_patch(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_kit_score(db_session)

    response = client.get("/scores/kit-profile?patch=16.14")
    assert response.status_code == 200
    body = response.json()
    assert body["patch"] == "16.14"
    assert body["perfis"] == [
        {
            "champion_id": "Caitlyn",
            "dano_score": 6.0,
            "alcance_score": 4.0,
            "resiliencia_score": 5.0,
        }
    ]


def test_kit_profile_omitted_patch_resolves_to_latest(client, db_session):
    _seed_patch(db_session, "16.13", 16013)
    _seed_patch(db_session, "16.14", 16014)
    _seed_kit_score(db_session, patch="16.13", champion_id="Ahri")
    _seed_kit_score(db_session, patch="16.14", champion_id="Caitlyn")

    response = client.get("/scores/kit-profile")
    assert response.status_code == 200
    body = response.json()
    assert body["patch"] == "16.14"
    assert [row["champion_id"] for row in body["perfis"]] == ["Caitlyn"]


def test_kit_profile_never_exposes_cc_or_mobilidade(client, db_session):
    _seed_patch(db_session, "16.14", 16014)
    _seed_kit_score(db_session)

    response = client.get("/scores/kit-profile?patch=16.14")
    row = response.json()["perfis"][0]
    assert "cc_score" not in row
    assert "mobilidade_score" not in row


def _seed_roadmap_step(db_session, **overrides) -> PlayerRoadmapStep:
    defaults = dict(
        game_name_key="fulano",
        tag_line_key="br1",
        region="br1",
        champion_id="Ahri",
        lane="MIDDLE",
        status="active",
        delta_pct_inicial=-18.0,
        delta_pct_atual=-18.0,
        partidas_base=6,
        partidas_atual=6,
        roadmap_token="test-token-fulano",
    )
    defaults.update(overrides)
    row = PlayerRoadmapStep(**defaults)
    db_session.add(row)
    db_session.commit()
    return row


def test_delete_roadmap_removes_rows_for_identity(client, db_session):
    _seed_roadmap_step(db_session)
    _seed_roadmap_step(db_session, champion_id="Zed", lane="TOP")
    _seed_roadmap_step(db_session, game_name_key="outrojogador", tag_line_key="br1")

    response = client.delete("/player/roadmap?game_name=Fulano&tag_line=BR1&region=br1")
    assert response.status_code == 200
    assert response.json() == {"deleted": 2}

    remaining = (
        db_session.query(PlayerRoadmapStep)
        .filter_by(game_name_key="fulano", tag_line_key="br1", region="br1")
        .count()
    )
    assert remaining == 0
    other_remaining = (
        db_session.query(PlayerRoadmapStep).filter_by(game_name_key="outrojogador").count()
    )
    assert other_remaining == 1


def test_delete_roadmap_empty_returns_zero(client):
    response = client.delete("/player/roadmap?game_name=Ninguem&tag_line=BR1")
    assert response.status_code == 200
    assert response.json() == {"deleted": 0}


def test_delete_roadmap_works_without_real_riot_key(client, db_session, monkeypatch):
    # Diferente do GET /player/lookup, o DELETE não tem
    # ensure_riot_proxy_enabled() de propósito — é operação de banco
    # pura, precisa funcionar mesmo com o gate fechado (produção hoje).
    monkeypatch.setattr(get_settings(), "riot_api_key", "changeme")
    _seed_roadmap_step(db_session)

    response = client.delete("/player/roadmap?game_name=Fulano&tag_line=BR1&region=br1")
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}


def test_delete_roadmap_wrong_token_deletes_zero(client, db_session):
    _seed_roadmap_step(db_session, roadmap_token="token-certo")

    response = client.delete(
        "/player/roadmap?game_name=Fulano&tag_line=BR1&region=br1&roadmap_token=token-errado"
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": 0}


def test_delete_roadmap_correct_token_deletes(client, db_session):
    _seed_roadmap_step(db_session, roadmap_token="token-certo")

    response = client.delete(
        "/player/roadmap?game_name=Fulano&tag_line=BR1&region=br1&roadmap_token=token-certo"
    )
    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
