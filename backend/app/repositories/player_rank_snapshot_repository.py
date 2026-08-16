from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models import PlayerRankSnapshot


class PlayerRankSnapshotRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_if_new_day(
        self,
        game_name_key: str,
        tag_line_key: str,
        region: str,
        queue_type: str,
        tier: str,
        division: str,
        league_points: int,
        wins: int,
        losses: int,
        retention_days: int,
    ) -> PlayerRankSnapshot | None:
        """Uma linha por dia civil (UTC) por identidade+fila — chamado a
        cada `/player/lookup` que já fez a chamada League-V4 (sem gasto
        extra de cota), mas só grava se ainda não existe snapshot de hoje.
        Também apaga, na mesma escrita, snapshots mais velhos que
        `retention_days` dessa identidade+fila (decisão do usuário 16/08:
        janela rolante em vez de exclusão manual pareada — ver modelo)."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        already_today = (
            self.db.query(PlayerRankSnapshot.id)
            .filter_by(
                game_name_key=game_name_key,
                tag_line_key=tag_line_key,
                region=region,
                queue_type=queue_type,
            )
            .filter(PlayerRankSnapshot.captured_at >= today_start)
            .first()
        )
        if already_today is not None:
            return None

        # `synchronize_session=False`: a sessão comita logo em seguida (o
        # chamador sempre faz `db.commit()` depois), então não precisa do
        # custo de sincronizar o identity map em memória com o DELETE —
        # sem isso, o SQLAlchemy avisava de colisão de identidade quando a
        # linha nova reaproveitava (SQLite) o mesmo id da linha apagada.
        self.db.query(PlayerRankSnapshot).filter_by(
            game_name_key=game_name_key,
            tag_line_key=tag_line_key,
            region=region,
            queue_type=queue_type,
        ).filter(
            PlayerRankSnapshot.captured_at < now - timedelta(days=retention_days)
        ).delete(synchronize_session=False)

        snapshot = PlayerRankSnapshot(
            game_name_key=game_name_key,
            tag_line_key=tag_line_key,
            region=region,
            queue_type=queue_type,
            tier=tier,
            division=division,
            league_points=league_points,
            wins=wins,
            losses=losses,
            captured_at=now,
        )
        self.db.add(snapshot)
        return snapshot

    def list_for_identity(
        self, game_name_key: str, tag_line_key: str, region: str, queue_type: str
    ) -> list[PlayerRankSnapshot]:
        return (
            self.db.query(PlayerRankSnapshot)
            .filter_by(
                game_name_key=game_name_key,
                tag_line_key=tag_line_key,
                region=region,
                queue_type=queue_type,
            )
            .order_by(PlayerRankSnapshot.captured_at.asc())
            .all()
        )
