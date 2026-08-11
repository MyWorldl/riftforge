from sqlalchemy.orm import Session

from app.db.models import PlayerRanking


class RankingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        queue: str,
        region: str,
        tier: str | None = None,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[PlayerRanking]:
        """Revisão técnica §1.11 (Sprint A item 2): `limit`/`offset` com
        teto real. `order_by(rank_position)` é aproximado quando `tier` é
        omitido (as 3 ligas apex combinadas) — `ranking_service.get_rankings`
        já reordena por `(tier, rank_position)` em Python depois; a paginação
        aqui é sobre o volume bruto lido do banco, não a página final exibida."""
        query = self.db.query(PlayerRanking).filter_by(queue=queue, region=region)
        if tier:
            query = query.filter_by(tier=tier)
        return query.order_by(PlayerRanking.rank_position).offset(offset).limit(limit).all()
