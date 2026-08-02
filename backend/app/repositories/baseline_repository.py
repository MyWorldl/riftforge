from sqlalchemy.orm import Session

from app.db.models import Baseline


class BaselineRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, patch: str, tier: str, lane: str) -> Baseline | None:
        return self.db.query(Baseline).filter_by(patch=patch, tier=tier, lane=lane).one_or_none()
