from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.models import PlayerChampionMasterySnapshot


class PlayerChampionMasterySnapshotRepository:
    """Selo "Monochampion" (16/08) — mesmo padrão de
    `PlayerRankSnapshotRepository`, mas chaveado por `puuid` (ver docstring
    do modelo pro porquê) e com retenção própria mais curta (30 dias)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_if_new_day(
        self,
        puuid: str,
        champion_id: str,
        concentracao: float,
        pontos_campeao_lider: int,
        pontos_totais: int,
        retention_days: int,
    ) -> PlayerChampionMasterySnapshot | None:
        """Uma linha por dia civil (UTC) por PUUID — só grava se ainda não
        existe snapshot de hoje. Também apaga, na mesma escrita, snapshots
        mais velhos que `retention_days` desse PUUID (janela rolante,
        decisão do usuário 16/08: sem exclusão manual própria)."""
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        already_today = (
            self.db.query(PlayerChampionMasterySnapshot.id)
            .filter_by(puuid=puuid)
            .filter(PlayerChampionMasterySnapshot.captured_at >= today_start)
            .first()
        )
        if already_today is not None:
            return None

        # `synchronize_session=False`: o chamador sempre comita logo em
        # seguida — mesmo motivo de `PlayerRankSnapshotRepository`.
        self.db.query(PlayerChampionMasterySnapshot).filter_by(puuid=puuid).filter(
            PlayerChampionMasterySnapshot.captured_at
            < now - timedelta(days=retention_days)
        ).delete(synchronize_session=False)

        snapshot = PlayerChampionMasterySnapshot(
            puuid=puuid,
            champion_id=champion_id,
            concentracao=concentracao,
            pontos_campeao_lider=pontos_campeao_lider,
            pontos_totais=pontos_totais,
            captured_at=now,
        )
        self.db.add(snapshot)
        return snapshot

    def list_for_puuid(self, puuid: str) -> list[PlayerChampionMasterySnapshot]:
        return (
            self.db.query(PlayerChampionMasterySnapshot)
            .filter_by(puuid=puuid)
            .order_by(PlayerChampionMasterySnapshot.captured_at.asc())
            .all()
        )
