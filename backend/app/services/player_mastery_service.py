import asyncio
from collections import Counter

from sqlalchemy.orm import Session

from app.adapters.riot_api import PLATFORM_TO_CONTINENT
from app.core.adapters import data_dragon, riot_api
from app.core.cache import cached
from app.core.champions import resolve_champion_id
from app.core.config import Settings, get_settings
from app.db.models import PlayerChampionMasterySnapshot
from app.repositories.player_champion_mastery_snapshot_repository import (
    PlayerChampionMasterySnapshotRepository,
)
from app.services.player_roadmap_service import normalize_region


def _determine_monochampion(
    snapshots: list[PlayerChampionMasterySnapshot],
    threshold: float,
    min_snapshots: int,
) -> dict | None:
    """Selo Monochampion (16/08): usa o campeão que mais vezes liderou a
    maestria do jogador nos snapshots retidos (até 30 dias, decisão do
    usuário), e a média de concentração SÓ nos dias em que ele liderou —
    não em todos os dias, pra não diluir com um campeão diferente que
    tenha liderado num dia isolado (o problema que o histórico existe pra
    evitar, na direção contrária). `ativo` exige os dois pisos: amostra
    mínima E concentração média acima do limiar — mesmo espírito de
    `tier_provisorio`, os números aparecem sempre que há pelo menos 1
    snapshot, só o selo "aceso" fica condicionado. `None` só quando não
    existe snapshot nenhum ainda (primeira busca desse jogador)."""
    if not snapshots:
        return None
    leader_counts = Counter(s.champion_id for s in snapshots)
    champion_id, sample_count = leader_counts.most_common(1)[0]
    concentrations = [s.concentracao for s in snapshots if s.champion_id == champion_id]
    avg_concentration = sum(concentrations) / len(concentrations)
    return {
        "champion_id": champion_id,
        "concentracao_media": avg_concentration,
        "amostras": sample_count,
        "ativo": sample_count >= min_snapshots and avg_concentration >= threshold,
    }


async def get_top_mastery(
    db: Session,
    game_name: str,
    tag_line: str,
    region: str | None,
    settings: Settings | None = None,
) -> dict:
    """Aba Maestria (Sprint 4 bloco 3, 16/08) — estrutura base, prioridade
    baixa. Endpoint próprio (`GET /player/mastery`), sob demanda, em vez
    de embutido em `/player/lookup`: Champion Mastery V4 é uma chamada à
    Riot a mais por request, e a maioria dos lookups nunca abre essa aba
    — não faz sentido pagar a cota sempre.

    Resolve Account-V1 de novo (não reaproveita `puuid` de um lookup
    anterior): esta rota pode ser chamada isolada pelo frontend, sem
    garantia de que `/player/lookup` já rodou na mesma sessão.

    Busca a lista COMPLETA de maestria (`get_champion_mastery_all_by_puuid`,
    não só top N) — o selo Monochampion (16/08) precisa do total de pontos
    em todos os campeões pra calcular concentração; o top N exibido na aba
    é só um recorte do mesmo payload, sem chamada extra à Riot."""
    settings = settings or get_settings()
    score_region = normalize_region(region)
    continent = PLATFORM_TO_CONTINENT.get(score_region) if region else None

    account = await asyncio.to_thread(
        riot_api.get_account_by_riot_id,
        game_name,
        tag_line,
        continent_region=continent,
    )
    puuid = account["puuid"]

    all_entries = await asyncio.to_thread(
        riot_api.get_champion_mastery_all_by_puuid,
        puuid,
        platform_region=score_region,
    )

    version = await cached("ddragon:version", data_dragon.get_latest_version)
    name_by_riot_id = await cached(
        f"ddragon:name_by_riot_id:{version}",
        lambda: data_dragon.get_champion_name_by_riot_id(version),
    )

    top_entries = all_entries[: settings.player_mastery_top_n]
    maestrias = [
        {
            "champion_id": resolve_champion_id(name_by_riot_id, entry["championId"]),
            "champion_level": entry["championLevel"],
            "champion_points": entry["championPoints"],
            "last_play_time": entry["lastPlayTime"],
        }
        for entry in top_entries
    ]

    # Selo Monochampion: grava o snapshot do dia (se ainda não gravado)
    # usando o payload já buscado acima — sem chamada extra à Riot. Ver
    # docstring de `PlayerChampionMasterySnapshot` pro porquê de ser
    # chaveado por `puuid`, não por Riot ID como o resto do projeto.
    monochampion_repo = PlayerChampionMasterySnapshotRepository(db)
    total_points = sum(entry.get("championPoints", 0) for entry in all_entries)
    if all_entries and total_points > 0:
        leader = max(all_entries, key=lambda e: e.get("championPoints", 0))
        leader_champion_id = resolve_champion_id(name_by_riot_id, leader["championId"])
        concentracao = leader["championPoints"] / total_points
        monochampion_repo.create_if_new_day(
            puuid,
            leader_champion_id,
            concentracao,
            leader["championPoints"],
            total_points,
            settings.monochampion_puuid_retention_days,
        )
        db.commit()

    snapshots = monochampion_repo.list_for_puuid(puuid)
    monochampion = _determine_monochampion(
        snapshots,
        settings.monochampion_concentration_threshold,
        settings.monochampion_min_snapshots,
    )

    return {
        "maestrias": maestrias,
        "monochampion": monochampion,
    }
