"""Ciclo de vida do Roadmap de Progressão do Jogador (rodada 28) — testado
só na camada de serviço, sem mockar Riot/Data Dragon: `sync_roadmap_steps`
recebe `campeoes` já pronto, mesmo formato que `player_service.lookup_player`
monta antes de chamá-lo."""

from app.services.player_roadmap_service import (
    delete_roadmap,
    resolve_identity,
    sync_roadmap_steps,
)

IDENTITY = resolve_identity("Fulano", "BR1", "br1")


def _champ(champion_id: str, lane: str, partidas: int, delta_pct: float | None) -> dict:
    return {
        "champion_id": champion_id,
        "lane": lane,
        "partidas": partidas,
        "comparativo_baseline": None if delta_pct is None else {"delta_pct": delta_pct},
    }


def test_creates_step_when_gap_and_sample_meet_threshold(db_session):
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 5, -15.0)]
    )
    assert len(roadmap["ativos"]) == 1
    assert roadmap["ativos"][0]["champion_id"] == "Ahri"
    assert roadmap["ativos"][0]["status"] == "active"
    assert roadmap["ativos"][0]["delta_pct_inicial"] == -15.0


def test_no_step_when_sample_too_small(db_session):
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 3, -20.0)]
    )
    assert roadmap["ativos"] == []
    assert roadmap["concluidos"] == []


def test_no_step_when_gap_not_bad_enough(db_session):
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 10, -5.0)]
    )
    assert roadmap["ativos"] == []


def test_no_step_when_baseline_missing(db_session):
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 10, None)]
    )
    assert roadmap["ativos"] == []


def test_step_completes_when_delta_crosses_zero(db_session):
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 5, -15.0)])
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 8, 2.0)]
    )
    assert roadmap["ativos"] == []
    assert len(roadmap["concluidos"]) == 1
    concluido = roadmap["concluidos"][0]
    assert concluido["champion_id"] == "Ahri"
    assert concluido["status"] == "completed"
    assert concluido["delta_pct_atual"] == 2.0
    assert concluido["completed_at"] is not None


def test_completed_step_never_reopens(db_session):
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 5, -15.0)])
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 8, 2.0)])
    # Jogador piora de novo depois de "graduar" — não reabre.
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 10, -20.0)]
    )
    assert roadmap["ativos"] == []
    assert len(roadmap["concluidos"]) == 1
    assert roadmap["concluidos"][0]["status"] == "completed"


def test_insufficient_sample_on_reappearance_does_not_touch_active_step(db_session):
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 5, -15.0)])
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 2, 5.0)]
    )
    assert len(roadmap["ativos"]) == 1
    step = roadmap["ativos"][0]
    assert step["delta_pct_atual"] == -15.0  # não mudou
    assert step["partidas_atual"] == 5  # não mudou


def test_cap_respected_and_least_bad_replaced(db_session):
    sync_roadmap_steps(
        db_session,
        IDENTITY,
        [
            _champ("Ahri", "MIDDLE", 5, -12.0),
            _champ("Zed", "MIDDLE", 5, -15.0),
            _champ("Yasuo", "MIDDLE", 5, -30.0),
        ],
    )
    # Teto (3) cheio — o menos ruim ativo é Ahri (-12.0). Um gap pior chega.
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Katarina", "MIDDLE", 5, -50.0)]
    )
    ativos_ids = {s["champion_id"] for s in roadmap["ativos"]}
    assert len(roadmap["ativos"]) == 3
    assert "Katarina" in ativos_ids
    assert "Ahri" not in ativos_ids  # substituído, não some — vira "replaced" no banco
    assert "Zed" in ativos_ids
    assert "Yasuo" in ativos_ids


def test_worse_gap_ignored_when_not_worse_than_least_bad(db_session):
    sync_roadmap_steps(
        db_session,
        IDENTITY,
        [
            _champ("Ahri", "MIDDLE", 5, -12.0),
            _champ("Zed", "MIDDLE", 5, -15.0),
            _champ("Yasuo", "MIDDLE", 5, -30.0),
        ],
    )
    # Teto cheio, menos ruim ativo é Ahri (-12.0). Gap novo (-11.0) não é
    # pior que isso — ignorado, nada muda.
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Katarina", "MIDDLE", 5, -11.0)]
    )
    ativos_ids = {s["champion_id"] for s in roadmap["ativos"]}
    assert ativos_ids == {"Ahri", "Zed", "Yasuo"}


def test_replaced_step_can_reactivate(db_session):
    sync_roadmap_steps(
        db_session,
        IDENTITY,
        [
            _champ("Ahri", "MIDDLE", 5, -12.0),
            _champ("Zed", "MIDDLE", 5, -15.0),
            _champ("Yasuo", "MIDDLE", 5, -30.0),
        ],
    )
    # Ahri é substituído por Katarina.
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Katarina", "MIDDLE", 5, -50.0)])
    # Yasuo gradua, abrindo uma vaga.
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Yasuo", "MIDDLE", 8, 3.0)])
    # Ahri reaparece com gap ruim — deve reativar (existia como "replaced").
    roadmap = sync_roadmap_steps(
        db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 6, -18.0)]
    )
    ativos_ids = {s["champion_id"] for s in roadmap["ativos"]}
    assert "Ahri" in ativos_ids
    ahri = next(s for s in roadmap["ativos"] if s["champion_id"] == "Ahri")
    assert ahri["status"] == "active"
    assert ahri["delta_pct_inicial"] == -18.0  # reativação reseta o snapshot inicial


def test_delete_roadmap_removes_all_rows_for_identity(db_session):
    sync_roadmap_steps(
        db_session,
        IDENTITY,
        [
            _champ("Ahri", "MIDDLE", 5, -12.0),
            _champ("Zed", "MIDDLE", 5, -15.0),
        ],
    )
    deleted = delete_roadmap(db_session, "Fulano", "BR1", "br1")
    assert deleted == 2
    roadmap = sync_roadmap_steps(db_session, IDENTITY, [])
    assert roadmap == {"ativos": [], "concluidos": []}


def test_delete_roadmap_scoped_to_identity(db_session):
    sync_roadmap_steps(db_session, IDENTITY, [_champ("Ahri", "MIDDLE", 5, -12.0)])
    other_identity = resolve_identity("Outro", "NA1", "br1")
    sync_roadmap_steps(db_session, other_identity, [_champ("Zed", "MIDDLE", 5, -15.0)])

    deleted = delete_roadmap(db_session, "Fulano", "BR1", "br1")
    assert deleted == 1

    roadmap_outro = sync_roadmap_steps(db_session, other_identity, [])
    assert len(roadmap_outro["ativos"]) == 1
