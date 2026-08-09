from sqlalchemy.orm import Session

from app.db.models import ChampionScore, Patch


class ChampionScoreRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_latest_patch(self, elo_tier: str, region: str) -> str | None:
        row = (
            self.db.query(ChampionScore.patch)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(ChampionScore.elo_tier == elo_tier, ChampionScore.region == region)
            .order_by(Patch.patch_sequence.desc())
            .first()
        )
        return row[0] if row else None

    def list_by_patch(
        self, elo_tier: str, patch: str, region: str, lane: str | None = None
    ) -> list[ChampionScore]:
        query = self.db.query(ChampionScore).filter_by(
            elo_tier=elo_tier, patch=patch, region=region
        )
        if lane:
            query = query.filter_by(lane=lane)
        return query.all()

    def list_available_patches(self, elo_tier: str, region: str) -> list[str]:
        rows = (
            self.db.query(ChampionScore.patch, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(ChampionScore.elo_tier == elo_tier, ChampionScore.region == region)
            .distinct()
            .order_by(Patch.patch_sequence.desc())
            .all()
        )
        return [r[0] for r in rows]

    def get_history(
        self, champion_id: str, elo_tier: str, region: str, lane: str | None = None
    ) -> list[tuple[ChampionScore, int]]:
        query = (
            self.db.query(ChampionScore, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(
                ChampionScore.champion_id == champion_id,
                ChampionScore.elo_tier == elo_tier,
                ChampionScore.region == region,
            )
        )
        if lane:
            query = query.filter(ChampionScore.lane == lane)
        return query.order_by(Patch.patch_sequence).all()

    def get_one(
        self, champion_id: str, lane: str, elo_tier: str, patch: str, region: str
    ) -> ChampionScore | None:
        return (
            self.db.query(ChampionScore)
            .filter_by(
                champion_id=champion_id,
                lane=lane,
                elo_tier=elo_tier,
                patch=patch,
                region=region,
            )
            .one_or_none()
        )

    def get_latest_for_champion_lane(
        self, champion_id: str, lane: str, elo_tier: str, region: str
    ) -> ChampionScore | None:
        return (
            self.db.query(ChampionScore)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(
                ChampionScore.champion_id == champion_id,
                ChampionScore.lane == lane,
                ChampionScore.elo_tier == elo_tier,
                ChampionScore.region == region,
            )
            .order_by(Patch.patch_sequence.desc())
            .first()
        )

    def list_latest_by_champion_lane_keys(
        self, keys: set[tuple[str, str]], elo_tier: str, region: str
    ) -> dict[tuple[str, str], ChampionScore]:
        """Resolve a linha de score mais recente pra cada `(champion_id, lane)`
        de `keys` numa query só — item 1.1 da revisão técnica: antes disso,
        `/player/lookup` fazia uma query com JOIN por campeão dentro de um
        loop (N+1). Uma query com `IN` sobre as chaves + ordenação por
        `patch_sequence` desc, pegando a primeira ocorrência de cada chave
        (mais recente), resolve em uma única ida ao banco."""
        if not keys:
            return {}
        champion_ids = {c for c, _ in keys}
        lanes = {lane for _, lane in keys}
        rows = (
            self.db.query(ChampionScore, Patch.patch_sequence)
            .join(Patch, Patch.version_label == ChampionScore.patch)
            .filter(
                ChampionScore.champion_id.in_(champion_ids),
                ChampionScore.lane.in_(lanes),
                ChampionScore.elo_tier == elo_tier,
                ChampionScore.region == region,
            )
            .order_by(Patch.patch_sequence.desc())
            .all()
        )
        result: dict[tuple[str, str], ChampionScore] = {}
        for row, _sequence in rows:
            key = (row.champion_id, row.lane)
            if key in keys and key not in result:
                result[key] = row
        return result
