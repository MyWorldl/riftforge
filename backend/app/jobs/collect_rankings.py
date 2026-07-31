"""Item novo (rodada 19, "Classificações"): coleta o ranking de jogadores
das ligas apex (Desafiante/Grão-Mestre/Mestre) direto da Riot — não um
conceito de classificação inventado pelo app, decisão explícita do usuário.

Diferente de "Análise do Jogador" (busca sob demanda, por requisição), isso
é o mesmo dado pra todo mundo, atualizado periodicamente — então segue
exatamente o padrão do resto do pipeline: um job batch com a chave, grava
numa tabela, o backend público só lê do banco (nunca chama a Riot ao vivo
por requisição de usuário). Por isso pode ir ao ar já, sem esperar a
aprovação da Production Key — ao contrário de `/player/lookup`.

Mantém só o top N por tier (`rankings_top_n_per_tier`) com nome resolvido
via Account-V1 — resolver a liga inteira (~2000+ jogadores somados entre as
3 ligas) gastaria cota à toa, já que ninguém rola até a posição 800 de um
leaderboard.

Uso: python -m app.jobs.collect_rankings
"""

from riotwatcher import ApiError

from app.adapters.riot_api import RiotApiAdapter
from app.core.config import get_settings
from app.db.models import PlayerRanking
from app.db.session import SessionLocal, init_db

QUEUE = "RANKED_SOLO_5x5"


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

    ranked_entries = (
        _top_n(riot_api.get_challenger_league(QUEUE), "CHALLENGER", top_n)
        + _top_n(riot_api.get_grandmaster_league(QUEUE), "GRANDMASTER", top_n)
        + _top_n(riot_api.get_master_league(QUEUE), "MASTER", top_n)
    )

    session = SessionLocal()
    try:
        nomes_resolvidos = 0
        nomes_falhos = 0
        for tier in ("CHALLENGER", "GRANDMASTER", "MASTER"):
            session.query(PlayerRanking).filter_by(queue=QUEUE, tier=tier).delete()

        for entry in ranked_entries:
            game_name = None
            tag_line = None
            try:
                account = riot_api.get_account_by_puuid(entry["puuid"])
                game_name = account.get("gameName")
                tag_line = account.get("tagLine")
                nomes_resolvidos += 1
            except ApiError:
                # Conta pode ter passivo de privacidade (nome oculto) ou
                # nunca ter migrado pra Riot ID — segue sem nome em vez de
                # abortar o job inteiro por causa de um jogador.
                nomes_falhos += 1

            session.add(
                PlayerRanking(
                    queue=QUEUE,
                    tier=entry["tier"],
                    puuid=entry["puuid"],
                    game_name=game_name,
                    tag_line=tag_line,
                    league_points=entry["leaguePoints"],
                    wins=entry["wins"],
                    losses=entry["losses"],
                    rank_position=entry["rank_position"],
                )
            )

        session.commit()
        return {
            "jogadores_gravados": len(ranked_entries),
            "nomes_resolvidos": nomes_resolvidos,
            "nomes_falhos": nomes_falhos,
        }
    finally:
        session.close()


def main() -> None:
    result = collect()
    print(
        f"Ranking gravado: {result['jogadores_gravados']} jogadores "
        f"(top {get_settings().rankings_top_n_per_tier} por tier), "
        f"{result['nomes_resolvidos']} nomes resolvidos, {result['nomes_falhos']} falharam."
    )


if __name__ == "__main__":
    main()
