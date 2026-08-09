from sqlalchemy.orm import Session

from app.db.models import ChampionMetaContext, Patch


class MetaContextRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(self, elo_tier: str, region: str) -> str | None:
        row = (
            self.db.query(ChampionMetaContext.patch)
            .join(Patch, Patch.version_label == ChampionMetaContext.patch)
            .filter(
                ChampionMetaContext.tier == elo_tier,
                ChampionMetaContext.region == region,
            )
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def list_coverage_by_lane(
        self, elo_tier: str, patch: str, region: str
    ) -> list[tuple[str, float]]:
        """`cobertura` é propriedade do grupo (patch, tier, lane) — todo
        campeão do grupo tem o mesmo valor (ver docstring de
        `ChampionMetaContext`), então basta uma linha por rota."""
        return (
            self.db.query(ChampionMetaContext.lane, ChampionMetaContext.cobertura)
            .filter_by(patch=patch, tier=elo_tier, region=region)
            .distinct()
            .all()
        )
