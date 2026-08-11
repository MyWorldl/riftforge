from sqlalchemy.orm import Session

from app.core.patch_diff import diff_patches
from app.repositories.patch_notes_repository import PatchNotesRepository
from app.repositories.player_roadmap_repository import PlayerRoadmapRepository
from app.services.player_roadmap_service import resolve_identity

# Sprint B item 2 (revisão técnica §5.3): "replaced" nunca chegou a
# terminar (foi substituído por um gap pior antes de completar) — não é
# um campeão que o jogador ainda está de olho, nem um que "concluiu".
_RELEVANT_ROADMAP_STATUSES = {"active", "completed"}


def get_patch_notes(db: Session, elo_tier: str, top_n: int, region: str) -> dict:
    """ "Patch Notes" — não reproduz as notas oficiais da Riot (direitos
    autorais); deriva do próprio modelo de score, comparando os dois
    patches mais recentes com dado calculado pro elo. Nenhuma chamada Riot."""
    repo = PatchNotesRepository(db)
    patches = repo.get_two_latest_patches(elo_tier, region)

    if len(patches) < 2:
        return {
            "patch_atual": patches[0] if patches else None,
            "patch_anterior": None,
            "altas": [],
            "quedas": [],
            "mudancas_tier": [],
            "comparados": 0,
        }

    patch_atual, patch_anterior = patches[0], patches[1]
    rows_atual = repo.list_scores(elo_tier, patch_atual, region)
    rows_anterior = repo.list_scores(elo_tier, patch_anterior, region)

    diff = diff_patches(
        [
            {
                "champion_id": r.champion_id,
                "lane": r.lane,
                "score_final": r.score_final,
                "score_tier": r.score_tier,
            }
            for r in rows_atual
        ],
        [
            {
                "champion_id": r.champion_id,
                "lane": r.lane,
                "score_final": r.score_final,
                "score_tier": r.score_tier,
            }
            for r in rows_anterior
        ],
        top_n=top_n,
    )
    return {"patch_atual": patch_atual, "patch_anterior": patch_anterior, **diff}


def get_patch_changes(
    db: Session,
    patch: str | None,
    game_name: str | None = None,
    tag_line: str | None = None,
    region: str | None = None,
) -> dict:
    """Complementa `/patch-notes`: mudança numérica bruta que a Riot de fato
    publicou no Data Dragon pro patch. Nenhuma chamada Riot/Data Dragon ao
    vivo aqui.

    Revisão técnica §5.3 (Sprint B item 2) — "Mudanças que te afetam":
    `game_name`/`tag_line` (com `region`) opcionais filtram `mudancas` pros
    campeões que estão no Roadmap de Progressão do jogador (ativos e
    concluídos — "replaced" não conta, nunca chegou a ser relevante de
    verdade). Sem esses três parâmetros, comportamento idêntico a antes
    (lista completa, sem filtro). Cruzamento puro sobre dado já persistido
    — zero chamada Riot nova, mesmo espírito do resto da página."""
    repo = PatchNotesRepository(db)

    if patch is None:
        patch = repo.get_latest_patch_with_changes()
        if patch is None:
            return {"patch_atual": None, "patch_anterior": None, "mudancas": []}

    rows = repo.list_changes(patch)
    if not rows:
        return {"patch_atual": patch, "patch_anterior": None, "mudancas": []}

    mudancas = [
        {
            "champion_id": r.champion_id,
            "category": r.category,
            "spell_key": r.spell_key,
            "spell_name": r.spell_name,
            "field_label": r.field_label,
            "before_value": r.before_value,
            "after_value": r.after_value,
        }
        for r in rows
    ]

    if game_name and tag_line:
        identity = resolve_identity(game_name, tag_line, region)
        roadmap_champion_ids = {
            s.champion_id
            for s in PlayerRoadmapRepository(db).get_all_for_player(
                identity.game_name_key, identity.tag_line_key, identity.region
            )
            if s.status in _RELEVANT_ROADMAP_STATUSES
        }
        mudancas = [m for m in mudancas if m["champion_id"] in roadmap_champion_ids]

    return {
        "patch_atual": patch,
        "patch_anterior": rows[0].patch_anterior,
        "mudancas": mudancas,
    }
