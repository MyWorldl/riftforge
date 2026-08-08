from sqlalchemy.orm import Session

from app.repositories.meta_context_repository import MetaContextRepository


def get_coverage(db: Session, elo_tier: str, patch: str | None) -> dict:
    """"Contexto por rota" — `cobertura` é uma propriedade do grupo
    (patch, tier, lane), não de um campeão específico (ver docstring de
    `ChampionMetaContext`). `patch` omitido resolve pro mais recente com
    dado calculado nesse elo, mesmo padrão de `/scores/champions`."""
    repo = MetaContextRepository(db)
    resolved_patch = patch or repo.get_latest_patch(elo_tier)
    if resolved_patch is None:
        return {"patch": None, "elo_tier": elo_tier, "cobertura": []}

    rows = repo.list_coverage_by_lane(elo_tier, resolved_patch)
    return {
        "patch": resolved_patch,
        "elo_tier": elo_tier,
        "cobertura": [{"lane": lane, "cobertura": cobertura} for lane, cobertura in rows],
    }
