from sqlalchemy.orm import Session

from app.repositories.kit_score_repository import KitScoreRepository


def get_kit_profile(db: Session, patch: str | None) -> dict:
    """Perfil de Kit por campeão (Dano/Alcance/Resiliência, eixos 0-10)
    pra recomendação por perfil de jogo (v1) — `ChampionKitScore` não
    depende de elo/rota/região, só de `(patch, champion_id)`, então esse
    endpoint fica fora de `score_service.py` (ver plano da rodada 27).
    `patch` omitido resolve pro mais recente com Kit calculado."""
    repo = KitScoreRepository(db)
    resolved_patch = patch or repo.get_latest_patch()
    if resolved_patch is None:
        return {"patch": None, "perfis": []}

    rows = repo.list_by_patch(resolved_patch)
    return {
        "patch": resolved_patch,
        "perfis": [
            {
                "champion_id": row.champion_id,
                "dano_score": row.dano_score,
                "alcance_score": row.alcance_score,
                "resiliencia_score": row.resiliencia_score,
            }
            for row in rows
        ],
    }
