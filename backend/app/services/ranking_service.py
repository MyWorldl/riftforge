from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.repositories.ranking_repository import RankingRepository

# Ordem de exibição quando `tier` não é passado ("Todos os tiers") —
# Desafiante > Grão-Mestre > Mestre é a ordem real da Riot, não alfabética.
_TIER_ORDER = {"CHALLENGER": 0, "GRANDMASTER": 1, "MASTER": 2}


def get_rankings(db: Session, queue: str, tier: str | None, region: str | None) -> list[dict]:
    """"Rankings" — lê só de `player_rankings`, nunca consulta a Riot em
    tempo real. Ranking direto das ligas apex da própria Riot.

    `tier` omitido retorna os 3 tiers combinados, ordenados
    Desafiante->Grão-Mestre->Mestre e por posição dentro de cada um.
    `puuid` não entra na resposta (revisão técnica §2.1)."""
    region = region or get_settings().riot_platform_region
    rows = RankingRepository(db).list(queue=queue, region=region, tier=tier)
    rows.sort(key=lambda r: (_TIER_ORDER.get(r.tier, 99), r.rank_position))

    return [
        {
            "tier": row.tier,
            "region": row.region,
            "rank_position": row.rank_position,
            "game_name": row.game_name,
            "tag_line": row.tag_line,
            "summoner_level": row.summoner_level,
            "profile_icon_id": row.profile_icon_id,
            "league_points": row.league_points,
            "wins": row.wins,
            "losses": row.losses,
            "delta_posicao": row.delta_posicao,
        }
        for row in rows
    ]
