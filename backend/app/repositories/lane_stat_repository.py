from sqlalchemy.orm import Session

from app.db.models import ChampionBanStat, ChampionLaneStat, SegmentTotal


class LaneStatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(self, tier: str) -> str | None:
        row = (
            self.db.query(SegmentTotal.patch)
            .filter_by(tier=tier)
            .order_by(SegmentTotal.patch.desc())
            .first()
        )
        return row[0] if row else None

    def get_segment_total(self, patch: str, tier: str) -> int:
        return self.db.query(SegmentTotal.total_matches).filter_by(patch=patch, tier=tier).scalar() or 0

    def get_bans_by_champion(self, patch: str, tier: str) -> dict[str, int]:
        return {
            row.champion_id: row.bans
            for row in self.db.query(ChampionBanStat).filter_by(patch=patch, tier=tier).all()
        }

    def list_lane_stats(self, patch: str, tier: str, lane: str | None = None) -> list[ChampionLaneStat]:
        query = self.db.query(ChampionLaneStat).filter_by(patch=patch, tier=tier)
        if lane:
            query = query.filter_by(lane=lane)
        return query.all()
