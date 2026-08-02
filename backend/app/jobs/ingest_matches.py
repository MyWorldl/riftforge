"""Estágio de ingestão do pipeline (Core Fase 0, item 0.1).

Grava partidas brutas com deduplicação persistida no banco — antes desta
mudança, `collect_stats.py` deduplicava só dentro de uma execução (um
`set()` em memória), então rodar o job duas vezes contava as mesmas
partidas de novo (ver Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md §5).
Agora cada match_id é checado no banco antes do fetch: partidas já
ingeridas nem consomem cota da Riot de novo.

**Janela de tempo (`--since-days`)**: sem ela, o histórico de cada
invocador se estende por mais de um ano. Medido na prática numa coleta de
1.545 partidas: elas caíram em **38 patches diferentes**, com só 24% no
patch mais recente e 2,3% no atual do Data Dragon. Como a confiança do
score é medida por `(patch, elo, rota, campeão)`, cada linha só enxerga a
fatia do próprio patch — ou seja, ~76% da cota da Riot ia para patches que
nenhuma consulta alcança. O corte é aplicado via `start_time` na própria
Riot, então partida antiga nem consome chamada.

Não implementa ainda expansão "bola de neve" por participantes
(Core/Estrutura_roadmap/11_PIPELINE_INGESTAO.md §2.2) — cada execução
cobre só o histórico dos invocadores retornados pelo seed de League-V4
para o elo pedido. Identificação de rota aceita o `teamPosition` já
inferido pela Riot como está (item em aberto em
Core/Estrutura_roadmap/12_IDENTIFICACAO_ROTA.md), registrado como
`resolution_method="riot_team_position"` por rastreabilidade.

Rodada 22 (backlog 6.2): invocadores são processados em paralelo via
threads (`settings.ingest_concurrency`), não sequencialmente. Seguro
porque (a) o limitador de taxa da RiotWatcher usa locks internos e uma
única instância de `RiotApiAdapter`/`requests.Session` é compartilhada
entre as threads (`requests.Session` é thread-safe pra esse uso — o
pooling de conexão do urllib3 por baixo já é feito pra isso), e (b) cada
invocador continua com sua própria sessão de banco, mesmo princípio já
usado antes de virar paralelo. Uma falha de rate limit (429) numa thread
não derruba as outras — o try/except por invocador já existente cobre
isso, só que agora rodando concorrente em vez de sequencial.

Uso: python -m app.jobs.ingest_matches --tier GOLD --division I
"""

import argparse
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.adapters.riot_api import RiotApiAdapter
from app.core.config import get_settings
from app.db.models import Match, MatchBan, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

QUEUE_IDS = {"RANKED_SOLO_5x5": 420, "RANKED_FLEX_SR": 440}
CORE_ITEM_SLOTS = ["item0", "item1", "item2", "item3", "item4", "item5"]


def _extract_runes(participant: dict) -> tuple[int | None, int | None, int | None]:
    """Mesma extração de `app/jobs/backfill_participant_runes.py` (partidas
    ingeridas antes desta mudança foram preenchidas por aquele backfill,
    reprocessando `raw_payload`; daqui pra frente, direto na ingestão)."""
    styles = (participant.get("perks") or {}).get("styles") or []
    primary = next((s for s in styles if s.get("description") == "primaryStyle"), None)
    sub = next((s for s in styles if s.get("description") == "subStyle"), None)

    keystone_id = None
    if primary and primary.get("selections"):
        keystone_id = primary["selections"][0].get("perk")

    primary_style_id = primary.get("style") if primary else None
    sub_style_id = sub.get("style") if sub else None
    return keystone_id, primary_style_id, sub_style_id


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


def _process_summoner(
    index: int,
    puuid: str,
    riot: RiotApiAdapter,
    queue_id: int,
    tier: str,
    matches_per_summoner: int,
    start_time: int,
) -> dict:
    """Todo o trabalho de um invocador — chamado de dentro de uma thread do
    pool em `ingest()`. Sessão própria, escopada só a este invocador (mesmo
    motivo de antes da paralelização: o Supabase derruba conexão de vida
    longa, e agora também evita que threads diferentes compartilhem uma
    sessão do SQLAlchemy, que não é thread-safe)."""
    print(f"[{index}] buscando histórico de partidas...", flush=True)

    session = SessionLocal()
    try:
        match_ids = riot.get_match_ids_by_puuid(
            puuid, count=matches_per_summoner, queue=queue_id, start_time=start_time
        )

        new_matches = 0
        skipped_existing = 0

        for match_id in match_ids:
            if _already_ingested(session, match_id):
                skipped_existing += 1
                continue

            print(f"  [{index}] ingerindo partida {match_id}...", flush=True)
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
                keystone_id, primary_style_id, sub_style_id = _extract_runes(participant)
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
                        keystone_id=keystone_id,
                        primary_style_id=primary_style_id,
                        sub_style_id=sub_style_id,
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

        # Commit por invocador: Ctrl+C ou uma queda no meio não perde o
        # trabalho já feito nesta execução.
        session.commit()
        return {"new_matches": new_matches, "skipped_existing": skipped_existing, "failed": False}
    except Exception as exc:
        # Uma falha pontual (conexão derrubada, timeout/429 da Riot) não
        # deve abortar uma coleta de dezenas de minutos — o invocador é
        # pulado e a execução segue. Como a dedup é por match_id no banco,
        # rodar de novo depois recupera o que faltou sem recontar nada.
        session.rollback()
        print(f"  ! [{index}] invocador falhou, seguindo: {type(exc).__name__}: {exc}", flush=True)
        return {"new_matches": 0, "skipped_existing": 0, "failed": True}
    finally:
        session.close()


def ingest(
    queue: str = "RANKED_SOLO_5x5",
    tier: str = "GOLD",
    division: str = "I",
    puuid_limit: int = 5,
    matches_per_summoner: int = 3,
    since_days: int | None = None,
    concurrency: int | None = None,
) -> dict:
    print("Conectando ao banco...", flush=True)
    init_db()

    settings = get_settings()
    if since_days is None:
        since_days = settings.ingest_days_window
    if concurrency is None:
        concurrency = settings.ingest_concurrency
    start_time = int(time.time()) - since_days * 86400

    # Uma instância só, compartilhada entre as threads: o limitador de taxa
    # da RiotWatcher precisa ver todas as chamadas pra funcionar (limitador
    # por instância, não global) — cada thread com seu próprio adapter
    # ignoraria o rate limit das outras.
    riot = RiotApiAdapter()
    queue_id = QUEUE_IDS[queue]

    print(f"Buscando invocadores {tier} {division} na Riot API...", flush=True)
    entries = riot.get_league_entries(queue, tier, division)
    puuids = [entry["puuid"] for entry in entries[:puuid_limit]]
    print(
        f"{len(puuids)} invocador(es) encontrado(s). "
        f"Coletando só partidas dos últimos {since_days} dias ({concurrency} em paralelo).",
        flush=True,
    )

    new_matches = 0
    skipped_existing = 0
    failed_summoners = 0

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {
            executor.submit(
                _process_summoner, i, puuid, riot, queue_id, tier, matches_per_summoner, start_time
            ): i
            for i, puuid in enumerate(puuids, start=1)
        }
        for future in as_completed(futures):
            result = future.result()
            new_matches += result["new_matches"]
            skipped_existing += result["skipped_existing"]
            failed_summoners += int(result["failed"])

    return {
        "summoners": len(puuids),
        "new_matches": new_matches,
        "skipped_existing": skipped_existing,
        "failed_summoners": failed_summoners,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingere partidas brutas da Riot API no banco próprio.")
    parser.add_argument("--queue", default="RANKED_SOLO_5x5", choices=list(QUEUE_IDS))
    parser.add_argument("--tier", default="GOLD")
    parser.add_argument("--division", default="I")
    parser.add_argument("--puuid-limit", type=int, default=5)
    parser.add_argument("--matches-per-summoner", type=int, default=3)
    parser.add_argument(
        "--since-days",
        type=int,
        default=None,
        help="Janela de coleta em dias (padrão: ingest_days_window da config). "
        "Partidas mais antigas são descartadas pela própria Riot, sem gastar chamada.",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=None,
        help="Quantos invocadores processar em paralelo (padrão: ingest_concurrency da config).",
    )
    args = parser.parse_args()

    result = ingest(
        queue=args.queue,
        tier=args.tier,
        division=args.division,
        puuid_limit=args.puuid_limit,
        matches_per_summoner=args.matches_per_summoner,
        since_days=args.since_days,
        concurrency=args.concurrency,
    )
    print(
        f"Ingestão concluída: {result['summoners']} invocadores, "
        f"{result['new_matches']} partidas novas, {result['skipped_existing']} já existiam no banco"
        + (f", {result['failed_summoners']} invocadores falharam." if result["failed_summoners"] else ".")
    )


if __name__ == "__main__":
    main()
