from sqlalchemy.orm import Session

from app.db.models import ChampionPatchChange, ChampionScore, Patch


class PatchNotesRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_two_latest_patches(self, elo_tier: str, region: str) -> list[str]:
        # `patch_sequence` precisa estar no SELECT pra aparecer no ORDER BY
        # com DISTINCT — Postgres rejeita ("must appear in select list"),
        # diferente do SQLite local usado nos testes.
        rows = (
            self.db.query(ChampionScore.patch, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(ChampionScore.elo_tier == elo_tier, ChampionScore.region == region)
            .distinct()
            .order_by(Patch.patch_sequence.desc())
            .limit(2)
            .all()
        )
        return [r[0] for r in rows]

    def list_scores(
        self, elo_tier: str, patch: str, region: str
    ) -> list[ChampionScore]:
        return (
            self.db.query(ChampionScore)
            .filter_by(elo_tier=elo_tier, patch=patch, region=region)
            .all()
        )

    def get_latest_patch_with_changes(self) -> str | None:
        row = (
            self.db.query(ChampionPatchChange.patch, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionPatchChange.patch)
            .distinct()
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def list_changes(self, patch: str) -> list[ChampionPatchChange]:
        return self.db.query(ChampionPatchChange).filter_by(patch=patch).all()
