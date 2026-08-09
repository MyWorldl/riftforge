from sqlalchemy.orm import Session

from app.db.models import ChampionBuildRecommendation, Patch


class BuildRecommendationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(
        self, tier: str, lane: str, champion_id: str, region: str
    ) -> str | None:
        row = (
            self.db.query(ChampionBuildRecommendation.patch)
            .join(Patch, Patch.version_label == ChampionBuildRecommendation.patch)
            .filter(
                ChampionBuildRecommendation.tier == tier,
                ChampionBuildRecommendation.lane == lane,
                ChampionBuildRecommendation.champion_id == champion_id,
                ChampionBuildRecommendation.region == region,
            )
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def get_one(
        self, patch: str, tier: str, lane: str, champion_id: str, region: str
    ) -> ChampionBuildRecommendation | None:
        return (
            self.db.query(ChampionBuildRecommendation)
            .filter_by(
                patch=patch,
                tier=tier,
                lane=lane,
                champion_id=champion_id,
                region=region,
            )
            .one_or_none()
        )
