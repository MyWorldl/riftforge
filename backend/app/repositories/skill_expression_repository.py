from sqlalchemy.orm import Session

from app.db.models import ChampionSkillExpression


class SkillExpressionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_by_patch(
        self, tier: str, patch: str, region: str
    ) -> list[ChampionSkillExpression]:
        return (
            self.db.query(ChampionSkillExpression)
            .filter_by(tier=tier, patch=patch, region=region)
            .all()
        )
