"""`PlayerRankSnapshotRepository` — uma linha por dia civil (UTC) por
identidade+fila, com janela rolante de retenção (decisão do usuário
16/08: sem exclusão manual pareada, diferente do roadmap)."""

from datetime import datetime, timedelta, timezone

from app.db.models import PlayerRankSnapshot
from app.repositories.player_rank_snapshot_repository import (
    PlayerRankSnapshotRepository,
)

_IDENTITY = ("fulano", "br1", "br1", "RANKED_SOLO_5x5")


def _create(repo, retention_days=400, **overrides):
    kwargs = dict(
        game_name_key=_IDENTITY[0],
        tag_line_key=_IDENTITY[1],
        region=_IDENTITY[2],
        queue_type=_IDENTITY[3],
        tier="GOLD",
        division="II",
        league_points=42,
        wins=10,
        losses=8,
        retention_days=retention_days,
    )
    kwargs.update(overrides)
    return repo.create_if_new_day(**kwargs)


def test_creates_snapshot_on_first_call(db_session):
    repo = PlayerRankSnapshotRepository(db_session)
    snapshot = _create(repo)
    db_session.commit()

    assert snapshot is not None
    rows = repo.list_for_identity(*_IDENTITY)
    assert len(rows) == 1
    assert rows[0].tier == "GOLD"
    assert rows[0].league_points == 42


def test_second_call_same_day_does_not_duplicate(db_session):
    repo = PlayerRankSnapshotRepository(db_session)
    _create(repo)
    db_session.commit()

    second = _create(repo, league_points=99)
    db_session.commit()

    assert second is None
    rows = repo.list_for_identity(*_IDENTITY)
    assert len(rows) == 1
    assert rows[0].league_points == 42  # não sobrescreve o snapshot de hoje


def test_call_on_new_day_creates_second_row(db_session):
    repo = PlayerRankSnapshotRepository(db_session)
    _create(repo)
    db_session.commit()

    yesterday_row = (
        db_session.query(PlayerRankSnapshot).filter_by(game_name_key=_IDENTITY[0]).one()
    )
    yesterday_row.captured_at = datetime.now(timezone.utc) - timedelta(days=1, hours=1)
    db_session.commit()

    second = _create(repo, league_points=55)
    db_session.commit()

    assert second is not None
    rows = repo.list_for_identity(*_IDENTITY)
    assert [r.league_points for r in rows] == [42, 55]


def test_retention_window_purges_old_snapshots(db_session):
    repo = PlayerRankSnapshotRepository(db_session)
    _create(repo, retention_days=30)
    db_session.commit()

    old_row = (
        db_session.query(PlayerRankSnapshot).filter_by(game_name_key=_IDENTITY[0]).one()
    )
    old_row.captured_at = datetime.now(timezone.utc) - timedelta(days=31)
    db_session.commit()
    # SQLite (só neste teste — Postgres em produção usa sequence, nunca
    # reaproveita id) reaproveita o rowid da linha apagada pelo purge
    # abaixo; sem expurgar `old_row` da identity map, o flush da linha
    # nova colide com a referência Python já obsoleta desta linha.
    db_session.expunge(old_row)

    _create(repo, retention_days=30, league_points=77)
    db_session.commit()

    rows = repo.list_for_identity(*_IDENTITY)
    assert len(rows) == 1
    assert rows[0].league_points == 77


def test_list_for_identity_empty_when_never_snapshotted(db_session):
    repo = PlayerRankSnapshotRepository(db_session)
    assert repo.list_for_identity(*_IDENTITY) == []
