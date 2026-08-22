from sqlalchemy import func
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
        return (
            self.db.query(SegmentTotal.total_matches)
            .filter_by(patch=patch, tier=tier)
            .scalar()
            or 0
        )

    def list_totals_by_region_tier(self) -> list[tuple[str, str, int]]:
        """Ajuste 21/08 (pedido do usuário: mostrar a quantidade de
        partidas coletadas, não só dizer "tem coleta"). Soma
        `total_matches` por (região, tier) através de TODOS os patches
        já processados — cada linha de `segment_totals` é o denominador
        de pick/ban rate de UM patch específico, então somar por patch
        dá o total histórico coletado pra aquele elo/região, não um
        recorte do patch atual."""
        rows = (
            self.db.query(
                SegmentTotal.region,
                SegmentTotal.tier,
                func.sum(SegmentTotal.total_matches),
            )
            .group_by(SegmentTotal.region, SegmentTotal.tier)
            .all()
        )
        return [(region, tier, int(total or 0)) for region, tier, total in rows]

    def get_bans_by_champion(self, patch: str, tier: str) -> dict[str, int]:
        return {
            row.champion_id: row.bans
            for row in self.db.query(ChampionBanStat)
            .filter_by(patch=patch, tier=tier)
            .all()
        }

    def list_lane_stats(
        self,
        patch: str,
        tier: str,
        lane: str | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[ChampionLaneStat]:
        """Revisão técnica §1.11 (Sprint A item 2): `limit`/`offset` com
        teto real, mesmo padrão de `ChampionScoreRepository.list_by_patch`."""
        query = self.db.query(ChampionLaneStat).filter_by(patch=patch, tier=tier)
        if lane:
            query = query.filter_by(lane=lane)
        return query.order_by(ChampionLaneStat.id).offset(offset).limit(limit).all()
