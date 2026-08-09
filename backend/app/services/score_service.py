from sqlalchemy.orm import Session

from app.core.explain import explain_score
from app.core.power_profile import power_profile
from app.repositories.champion_score_repository import ChampionScoreRepository
from app.repositories.performance_repository import PerformanceRepository
from app.repositories.skill_expression_repository import SkillExpressionRepository

# Item novo (filtro de região, piloto br1+euw1): nenhuma função aqui usa
# `cached()` (app/core/cache.py) hoje. Se alguém adicionar cache a
# `list_scores`/`get_explanation`/etc. depois, a chave PRECISA incluir
# `region` — senão uma request `?region=euw1` corre o risco de servir
# resposta cacheada de `br1` em silêncio.


def list_scores(
    db: Session, elo_tier: str, lane: str | None, patch: str | None, region: str
) -> list[dict]:
    """Placar com o modelo de score em camadas (Performance/Kit/Build/Meta),
    tier God-E, indicador de confiança e selo Trap — lê só de
    `champion_scores`, nunca consulta a Riot em tempo real.

    Item 4.3 (revisão técnica): `explicacao`/`perfil_poder` NÃO entram mais
    aqui — cada um pesava por linha (4 camadas + 2 barras), multiplicado por
    ~300-700 linhas, pra uma informação que só é lida quando o usuário clica
    no ícone (ⓘ) de uma linha específica. Ver `get_explanation` abaixo,
    exposta em `GET /scores/champions/{champion_id}/explain`."""
    score_repo = ChampionScoreRepository(db)
    perf_repo = PerformanceRepository(db)
    skill_repo = SkillExpressionRepository(db)

    if patch is None:
        patch = score_repo.get_latest_patch(elo_tier, region)
        if patch is None:
            return []

    rows = score_repo.list_by_patch(elo_tier, patch, region, lane)

    # Win rate/pick rate/ban rate já existem em ChampionPerformanceScore
    # (calculados na Camada 1) — reaproveita a mesma linha já buscada pra
    # n_matches em vez de mais uma tabela/consulta. "Taxa de Vitória" usa
    # win_rate_raw (o número observado de verdade), não win_rate_adjusted
    # (Wilson, só pra pontuação interna).
    perf_by_key = {
        (r.patch, r.tier, r.lane, r.champion_id, r.region): r
        for r in perf_repo.list_by_patch(elo_tier, patch, region)
    }
    skill_by_key = {
        (r.patch, r.tier, r.lane, r.champion_id, r.region): r
        for r in skill_repo.list_by_patch(elo_tier, patch, region)
    }

    result = []
    for row in rows:
        key = (row.patch, row.elo_tier, row.lane, row.champion_id, row.region)
        perf = perf_by_key.get(key)
        skill = skill_by_key.get(key)
        result.append(
            {
                "champion_id": row.champion_id,
                "lane": row.lane,
                "patch": row.patch,
                "elo_tier": row.elo_tier,
                "region": row.region,
                "n_matches": perf.n_matches if perf else 0,
                "win_rate": perf.win_rate_raw if perf else None,
                "pick_rate": perf.pick_rate if perf else None,
                "ban_rate": perf.ban_rate if perf else None,
                "score_final": row.score_final,
                "score_tier": row.score_tier,
                "confianca": row.confianca,
                "tier_provisorio": row.tier_provisorio,
                "trap_flag": row.trap_flag,
                "performance_score": row.performance_score,
                "kit_score": row.kit_score,
                "build_score": row.build_score,
                "meta_score": row.meta_score,
                "skill_expression": (
                    {
                        "ceiling_label": skill.ceiling_label,
                        "floor_label": skill.floor_label,
                        "amostra_insuficiente": skill.amostra_insuficiente,
                    }
                    if skill
                    else None
                ),
            }
        )
    return result


def get_explanation(
    db: Session,
    champion_id: str,
    lane: str,
    elo_tier: str,
    patch: str | None,
    region: str,
) -> dict | None:
    """Item 3.1 (explicabilidade) + item 4.3 (sob demanda, não mais embutido
    em `list_scores`). Mesma matemática de antes, só que calculada por linha
    específica em vez de pra toda a lista de uma vez."""
    score_repo = ChampionScoreRepository(db)

    if patch is None:
        patch = score_repo.get_latest_patch(elo_tier, region)
        if patch is None:
            return None

    row = score_repo.get_one(champion_id, lane, elo_tier, patch, region)
    if row is None:
        return None

    layer_scores = {
        "performance": row.performance_score,
        "kit": row.kit_score,
        "build": row.build_score,
        "meta": row.meta_score,
    }
    pesos_usados = row.pesos_usados or {}
    return {
        "explicacao": explain_score(layer_scores, pesos_usados),
        "perfil_poder": power_profile(layer_scores, pesos_usados),
    }


def list_available_patches(db: Session, elo_tier: str, region: str) -> list[str]:
    """Patches com score calculado pro elo, do mais recente pro mais
    antigo — alimenta o filtro de patch da interface."""
    return ChampionScoreRepository(db).list_available_patches(elo_tier, region)


def get_champion_history(
    db: Session, champion_id: str, elo_tier: str, lane: str | None, region: str
) -> list[dict]:
    """Item 3.4: evolução do score de um campeão entre patches."""
    score_repo = ChampionScoreRepository(db)
    perf_repo = PerformanceRepository(db)

    rows = score_repo.get_history(champion_id, elo_tier, region, lane)
    n_matches_by_key = {
        (r.patch, r.tier, r.lane, r.champion_id, r.region): r.n_matches
        for r in perf_repo.list_by_champion(elo_tier, champion_id, region, lane)
    }

    return [
        {
            "patch": row.patch,
            "lane": row.lane,
            "score_final": row.score_final,
            "score_tier": row.score_tier,
            "confianca": row.confianca,
            "tier_provisorio": row.tier_provisorio,
            "n_matches": n_matches_by_key.get(
                (row.patch, row.elo_tier, row.lane, row.champion_id, row.region), 0
            ),
        }
        for row, _sequence in rows
    ]
