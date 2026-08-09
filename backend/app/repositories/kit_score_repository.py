from sqlalchemy.orm import Session

from app.db.models import ChampionKitScore, Patch


class KitScoreRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(self) -> str | None:
        """Diferente de `ChampionScoreRepository`/`MetaContextRepository`,
        sem filtro de `elo_tier`/`region` — `ChampionKitScore` não tem
        essas dimensões (Kit é propriedade só de `(patch, champion_id)`,
        ver docstring do modelo)."""
        row = (
            self.db.query(ChampionKitScore.patch, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionKitScore.patch)
            .distinct()
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def list_by_patch(self, patch: str) -> list[ChampionKitScore]:
        return self.db.query(ChampionKitScore).filter_by(patch=patch).all()
