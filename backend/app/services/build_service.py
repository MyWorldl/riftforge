from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.stats import wilson_lower_bound
from app.repositories.build_recommendation_repository import (
    BuildRecommendationRepository,
)


def get_recommended_build(
    db: Session,
    champion_id: str,
    lane: str,
    elo_tier: str,
    patch: str | None,
    region: str,
) -> dict | None:
    """Item 4.1 (backlog) — build de itens e combinação de runas com maior
    win rate observado, por `(patch, tier, lane, campeão)`.

    Auditoria 16/08 §3.5: `*_win_rate_wilson` some junto do win rate bruto,
    mesmo motivo de `matchup_service.get_matchups` — `build_recommendation_
    min_games=5` é bem mais baixo que os 500 do blueprint externo, então o
    intervalo real costuma ser largo. `wins` reconstruído a partir do
    win rate já persistido (a tabela não guarda a contagem bruta) — erro
    de arredondamento de no máximo meia vitória, irrelevante pro piso de
    Wilson exibido."""
    repo = BuildRecommendationRepository(db)
    settings = get_settings()

    if patch is None:
        patch = repo.get_latest_patch(elo_tier, lane, champion_id, region)
        if patch is None:
            return None

    row = repo.get_one(patch, elo_tier, lane, champion_id, region)
    if row is None:
        return None

    return {
        "patch": row.patch,
        "item_build": row.item_build,
        "item_build_games": row.item_build_games,
        "item_build_win_rate": row.item_build_win_rate,
        "item_build_win_rate_wilson": wilson_lower_bound(
            round(row.item_build_win_rate * row.item_build_games),
            row.item_build_games,
            settings.wilson_z,
        ),
        "keystone_id": row.keystone_id,
        "primary_style_id": row.primary_style_id,
        "sub_style_id": row.sub_style_id,
        "rune_games": row.rune_games,
        "rune_win_rate": row.rune_win_rate,
        "rune_win_rate_wilson": wilson_lower_bound(
            round(row.rune_win_rate * row.rune_games), row.rune_games, settings.wilson_z
        ),
        "amostra_insuficiente": row.amostra_insuficiente,
    }
