from sqlalchemy.orm import Session

from app.db.models import ChampionPerformanceScore


class PerformanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_patch(self, tier: str, patch: str) -> list[ChampionPerformanceScore]:
        return self.db.query(ChampionPerformanceScore).filter_by(tier=tier, patch=patch).all()

    def list_by_champion(
        self, tier: str, champion_id: str, lane: str | None = None
    ) -> list[ChampionPerformanceScore]:
        query = self.db.query(ChampionPerformanceScore).filter_by(tier=tier, champion_id=champion_id)
        if lane:
            query = query.filter_by(lane=lane)
        return query.all()
