from sqlalchemy.orm import Session

from app.db.models import PlayerRanking


class RankingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self, queue: str, region: str, tier: str | None = None) -> list[PlayerRanking]:
        query = self.db.query(PlayerRanking).filter_by(queue=queue, region=region)
        if tier:
            query = query.filter_by(tier=tier)
        return query.all()
