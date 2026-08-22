from __future__ import annotations

# Necessário porque o método abaixo se chama `list` — sem avaliação adiada
# de anotação, qualquer `-> list[...]` declarado DEPOIS dele nesta classe
# resolve `list` pro método (já vinculado no namespace da classe), não pro
# tipo embutido, e quebra em tempo de import (`'function' object is not
# subscriptable`). Achado real ao adicionar `search_by_name` (ajuste 21/08).
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
        return (
            query.order_by(PlayerRanking.rank_position)
            .offset(offset)
            .limit(limit)
            .all()
        )

    def search_by_name(
        self,
        queue: str,
        region: str,
        needle: str,
        limit: int = 8,
    ) -> list[PlayerRanking]:
        """Ajuste 21/08: busca "conforme digita" — `ILIKE` sobre
        `game_name` (índice `ix_player_rankings_game_name`). Exclui linhas
        sem `game_name` (job só resolve nome pro top N por tier/região,
        ver docstring do modelo) — sem nome não tem o que sugerir."""
        needle = f"%{needle}%"
        return (
            self.db.query(PlayerRanking)
            .filter_by(queue=queue, region=region)
            .filter(PlayerRanking.game_name.isnot(None))
            .filter(PlayerRanking.game_name.ilike(needle))
            .order_by(PlayerRanking.rank_position)
            .limit(limit)
            .all()
        )
