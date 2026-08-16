from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.stats import wilson_lower_bound
from app.repositories.matchup_repository import MatchupRepository


def get_matchups(
    db: Session,
    champion_id: str,
    lane: str,
    elo_tier: str,
    patch: str | None,
    region: str,
) -> dict:
    """Item 3.5 (Matchups) — "campeão A vs. todos os B" na mesma rota.
    Ordenado por win rate desc (melhores confrontos primeiro).

    Auditoria 16/08 §3.5: `win_rate_wilson` (o mesmo piso de confiança já
    usado na Camada 1 do score, `wilson_lower_bound`) some junto do win
    rate bruto — o piso `matchup_min_games=5` é bem mais baixo que os 300
    do blueprint externo, então o intervalo real costuma ser largo; expor
    o piso deixa isso visível em vez de escondido atrás de um número só."""
    repo = MatchupRepository(db)
    settings = get_settings()

    if patch is None:
        patch = repo.get_latest_patch(elo_tier, lane, region)
        if patch is None:
            return {"patch": None, "confrontos": []}

    rows = repo.list_for_champion(patch, elo_tier, lane, champion_id, region)
    confrontos = sorted(
        (
            {
                "opponent_champion_id": row.opponent_champion_id,
                "games": row.games,
                "wins": row.wins,
                "win_rate": row.wins / row.games if row.games else 0.0,
                "win_rate_wilson": wilson_lower_bound(
                    row.wins, row.games, settings.wilson_z
                ),
                "amostra_insuficiente": row.amostra_insuficiente,
            }
            for row in rows
        ),
        key=lambda c: c["win_rate"],
        reverse=True,
    )
    return {"patch": patch, "confrontos": confrontos}
