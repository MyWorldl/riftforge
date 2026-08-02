from sqlalchemy.orm import Session

from app.db.models import ChampionMatchup, Patch


class MatchupRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(self, tier: str, lane: str) -> str | None:
        row = (
            self.db.query(ChampionMatchup.patch)
            .join(Patch, Patch.version_label == ChampionMatchup.patch)
            .filter(ChampionMatchup.tier == tier, ChampionMatchup.lane == lane)
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def list_for_champion(
        self, patch: str, tier: str, lane: str, champion_id: str
    ) -> list[ChampionMatchup]:
        return (
            self.db.query(ChampionMatchup)
            .filter_by(patch=patch, tier=tier, lane=lane, champion_id=champion_id)
            .all()
        )
