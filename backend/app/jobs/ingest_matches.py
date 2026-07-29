"""Estágio de ingestão do pipeline (Core Fase 0, item 0.1).

Grava partidas brutas com deduplicação persistida no banco — antes desta
mudança, `collect_stats.py` deduplicava só dentro de uma execução (um
`set()` em memória), então rodar o job duas vezes contava as mesmas
partidas de novo (ver Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md §5).
Agora cada match_id é checado no banco antes do fetch: partidas já
ingeridas nem consomem cota da Riot de novo.

Não implementa ainda expansão "bola de neve" por participantes
(Core/Estrutura_roadmap/11_PIPELINE_INGESTAO.md §2.2) — cada execução
cobre só o histórico dos invocadores retornados pelo seed de League-V4
para o elo pedido. Identificação de rota aceita o `teamPosition` já
inferido pela Riot como está (item em aberto em
Core/Estrutura_roadmap/12_IDENTIFICACAO_ROTA.md), registrado como
`resolution_method="riot_team_position"` por rastreabilidade.

Uso: python -m app.jobs.ingest_matches --tier GOLD --division I
"""

import argparse

from app.adapters.riot_api import RiotApiAdapter
from app.db.models import Match, MatchBan, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

QUEUE_IDS = {"RANKED_SOLO_5x5": 420, "RANKED_FLEX_SR": 440}
CORE_ITEM_SLOTS = ["item0", "item1", "item2", "item3", "item4", "item5"]


def _patch_sequence(version_label: str) -> int:
    major, minor = (int(part) for part in version_label.split(".")[:2])
    return major * 1000 + minor


def _get_or_create_patch(session, version_label: str) -> Patch:
    patch = session.query(Patch).filter_by(version_label=version_label).one_or_none()
    if patch is None:
        patch = Patch(version_label=version_label, patch_sequence=_patch_sequence(version_label))
        session.add(patch)
        session.flush()
    return patch


def _already_ingested(session, match_id: str) -> bool:
    return session.query(Match.match_id).filter_by(match_id=match_id).first() is not None


def ingest(
    queue: str = "RANKED_SOLO_5x5",
    tier: str = "GOLD",
    division: str = "I",
    puuid_limit: int = 5,
    matches_per_summoner: int = 3,
) -> dict:
    print("Conectando ao banco...", flush=True)
    init_db()

    riot = RiotApiAdapter()
    queue_id = QUEUE_IDS[queue]

    print(f"Buscando invocadores {tier} {division} na Riot API...", flush=True)
    entries = riot.get_league_entries(queue, tier, division)
    puuids = [entry["puuid"] for entry in entries[:puuid_limit]]
    print(f"{len(puuids)} invocador(es) encontrado(s).", flush=True)

    new_matches = 0
    skipped_existing = 0

    session = SessionLocal()
    try:
        for i, puuid in enumerate(puuids, start=1):
            print(f"[{i}/{len(puuids)}] buscando histórico de partidas...", flush=True)
            match_ids = riot.get_match_ids_by_puuid(puuid, count=matches_per_summoner, queue=queue_id)

            for match_id in match_ids:
                if _already_ingested(session, match_id):
                    skipped_existing += 1
                    continue

                print(f"  ingerindo partida {match_id}...", flush=True)
                match_payload = riot.get_match(match_id)
                info = match_payload["info"]
                version_label = ".".join(info["gameVersion"].split(".")[:2])
                patch = _get_or_create_patch(session, version_label)

                session.add(
                    Match(
                        match_id=match_id,
                        patch_id=patch.id,
                        platform_region=info.get("platformId", "").lower(),
                        queue_id=info.get("queueId", queue_id),
                        game_start_ts=info.get("gameStartTimestamp", 0),
                        game_duration_s=info.get("gameDuration", 0),
                        raw_payload=match_payload,
                    )
                )

                for participant in info["participants"]:
                    session.add(
                        MatchParticipant(
                            match_id=match_id,
                            puuid=participant["puuid"],
                            riot_champion_id=participant["championId"],
                            champion_name=participant["championName"],
                            team_id=participant["teamId"],
                            win=participant["win"],
                            raw_role=participant.get("role"),
                            raw_lane=participant.get("lane"),
                            resolved_position=participant.get("teamPosition") or None,
                            resolution_method="riot_team_position",
                            kills=participant["kills"],
                            deaths=participant["deaths"],
                            assists=participant["assists"],
                            core_items=[participant.get(slot, 0) for slot in CORE_ITEM_SLOTS],
                            elo_tier=tier,
                        )
                    )

                for team in info["teams"]:
                    for ban in team.get("bans", []):
                        champion_id = ban.get("championId", -1)
                        if champion_id == -1:
                            continue
                        session.add(
                            MatchBan(
                                match_id=match_id,
                                riot_champion_id=champion_id,
                                team_id=team["teamId"],
                                ban_order=ban.get("pickTurn", 0),
                            )
                        )

                new_matches += 1

            # Commit incrementally so Ctrl+C ou uma queda no meio não perde
            # o trabalho já feito de partidas anteriores nesta execução.
            session.commit()
    finally:
        session.close()

    return {"summoners": len(puuids), "new_matches": new_matches, "skipped_existing": skipped_existing}


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingere partidas brutas da Riot API no banco próprio.")
    parser.add_argument("--queue", default="RANKED_SOLO_5x5", choices=list(QUEUE_IDS))
    parser.add_argument("--tier", default="GOLD")
    parser.add_argument("--division", default="I")
    parser.add_argument("--puuid-limit", type=int, default=5)
    parser.add_argument("--matches-per-summoner", type=int, default=3)
    args = parser.parse_args()

    result = ingest(
        queue=args.queue,
        tier=args.tier,
        division=args.division,
        puuid_limit=args.puuid_limit,
        matches_per_summoner=args.matches_per_summoner,
    )
    print(
        f"Ingestão concluída: {result['summoners']} invocadores, "
        f"{result['new_matches']} partidas novas, {result['skipped_existing']} já existiam no banco."
    )


if __name__ == "__main__":
    main()
