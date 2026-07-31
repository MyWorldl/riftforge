"""Item novo (rodada 19, "Rankings"; filtro por região na rodada 20): coleta
o ranking de jogadores das ligas apex (Desafiante/Grão-Mestre/Mestre) direto
da Riot — não um conceito de classificação inventado pelo app, decisão
explícita do usuário.

Diferente de "Análise do Jogador" (busca sob demanda, por requisição), isso
é o mesmo dado pra todo mundo, atualizado periodicamente — então segue
exatamente o padrão do resto do pipeline: um job batch com a chave, grava
numa tabela, o backend público só lê do banco (nunca chama a Riot ao vivo
por requisição de usuário). Por isso pode ir ao ar já, sem esperar a
aprovação da Production Key — ao contrário de `/player/lookup`.

Cobre `settings.rankings_platform_regions` (só as de maior audiência, não as
8 do seletor da Home — cobrir todas multiplicaria a cota da Riot por 8) e
mantém só o top N por tier por região (`rankings_top_n_per_tier`, reduzido
de 50 pra 20 nesta rodada pra compensar o número de regiões) com
nome/nível/ícone resolvidos via Account-V1 + Summoner-V4 — resolver a liga
inteira (~2000+ jogadores por região) gastaria cota à toa.

Uso: python -m app.jobs.collect_rankings
"""

from riotwatcher import ApiError

from app.adapters.riot_api import PLATFORM_TO_CONTINENT, RiotApiAdapter
from app.core.config import get_settings
from app.db.models import PlayerRanking
from app.db.session import SessionLocal, init_db

QUEUE = "RANKED_SOLO_5x5"
TIERS = ("CHALLENGER", "GRANDMASTER", "MASTER")


def _top_n(league_payload: dict, tier: str, top_n: int) -> list[dict]:
    """Ordena por LP e numera a posição **dentro do próprio tier** (1..N) —
    Challenger/GM/Mestre são exibidos como listas separadas na interface,
    não um ranking global único."""
    entries = sorted(league_payload["entries"], key=lambda e: e["leaguePoints"], reverse=True)
    return [
        {**entry, "tier": tier, "rank_position": position}
        for position, entry in enumerate(entries[:top_n], start=1)
    ]


def collect() -> dict:
    settings = get_settings()
    init_db()
    riot_api = RiotApiAdapter()
    top_n = settings.rankings_top_n_per_tier
    regioes = [r.strip() for r in settings.rankings_platform_regions.split(",") if r.strip()]

    session = SessionLocal()
    try:
        nomes_resolvidos = 0
        nomes_falhos = 0
        niveis_resolvidos = 0
        niveis_falhos = 0
        total_gravados = 0

        for region in regioes:
            continent = PLATFORM_TO_CONTINENT.get(region, settings.riot_continent_region)

            ranked_entries = (
                _top_n(riot_api.get_challenger_league(QUEUE, platform_region=region), "CHALLENGER", top_n)
                + _top_n(riot_api.get_grandmaster_league(QUEUE, platform_region=region), "GRANDMASTER", top_n)
                + _top_n(riot_api.get_master_league(QUEUE, platform_region=region), "MASTER", top_n)
            )

            for tier in TIERS:
                session.query(PlayerRanking).filter_by(queue=QUEUE, tier=tier, region=region).delete()

            for entry in ranked_entries:
                game_name = None
                tag_line = None
                summoner_level = None
                profile_icon_id = None

                try:
                    account = riot_api.get_account_by_puuid(entry["puuid"], continent_region=continent)
                    game_name = account.get("gameName")
                    tag_line = account.get("tagLine")
                    nomes_resolvidos += 1
                except ApiError:
                    # Conta pode ter passivo de privacidade (nome oculto) ou
                    # nunca ter migrado pra Riot ID — segue sem nome em vez
                    # de abortar o job inteiro por causa de um jogador.
                    nomes_falhos += 1

                try:
                    summoner = riot_api.get_summoner_by_puuid(entry["puuid"], platform_region=region)
                    summoner_level = summoner.get("summonerLevel")
                    profile_icon_id = summoner.get("profileIconId")
                    niveis_resolvidos += 1
                except ApiError:
                    niveis_falhos += 1

                session.add(
                    PlayerRanking(
                        queue=QUEUE,
                        tier=entry["tier"],
                        region=region,
                        puuid=entry["puuid"],
                        game_name=game_name,
                        tag_line=tag_line,
                        summoner_level=summoner_level,
                        profile_icon_id=profile_icon_id,
                        league_points=entry["leaguePoints"],
                        wins=entry["wins"],
                        losses=entry["losses"],
                        rank_position=entry["rank_position"],
                    )
                )
                total_gravados += 1

        session.commit()
        return {
            "jogadores_gravados": total_gravados,
            "regioes_cobertas": len(regioes),
            "nomes_resolvidos": nomes_resolvidos,
            "nomes_falhos": nomes_falhos,
            "niveis_resolvidos": niveis_resolvidos,
            "niveis_falhos": niveis_falhos,
        }
    finally:
        session.close()


def main() -> None:
    result = collect()
    print(
        f"Ranking gravado: {result['jogadores_gravados']} jogadores em "
        f"{result['regioes_cobertas']} regiões (top {get_settings().rankings_top_n_per_tier} por tier), "
        f"{result['nomes_resolvidos']} nomes resolvidos ({result['nomes_falhos']} falharam), "
        f"{result['niveis_resolvidos']} níveis/ícones resolvidos ({result['niveis_falhos']} falharam)."
    )


if __name__ == "__main__":
    main()
