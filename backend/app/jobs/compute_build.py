"""Sexto estágio do pipeline (Core Fase 1, item 1.3): Camada 3 do score —
Sinergia de Build (Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §6).

    B_patch = 0.40*Nota_Flex + 0.30*Nota_Dep + 0.30*Nota_Spike
    Build   = 0.50*B(patch) + 0.30*B(patch-1) + 0.20*B(patch-2)

Lê `match_participants.core_items` (item0-item5 de cada partida, gravados
na ingestão especificamente para este estágio) e `patches.patch_sequence`
— primeiro consumidor real desse campo desde que foi criado. Nunca chama a
Riot. Depende só do item 0.1 (ingestão), não da Camada 1 nem da 2.

Nota_Flex: entropia de Shannon sobre a distribuição de builds distintos
(conjunto de itens, ordem ignorada) por (patch, tier, lane, campeão). Um
único build observado = entropia zero (Nota_Flex=0), não indefinida.

Nota_Dep: WR_build_otimo (win rate do build de melhor desempenho
observado) menos WR_build_medio (win rate geral do campeão no grupo),
invertida por percentil dentro do grupo — delta grande = frágil a build
errado, delta pequeno = qualquer build razoável funciona.

Nota_Spike: o documento fala em "o item core atual", que pressupõe
curadoria externa (patch notes, consenso de patch) que não temos. Nesta
versão automática, "item atual" é inferido como o item individual mais
frequente nas partidas do campeão dentro do grupo — uma aproximação
declarada, não a definição literal do documento.

Média móvel: quando faltam patches anteriores no histórico coletado
(campeão novo, ou início da coleta), redistribui peso proporcionalmente em
vez de tratar o termo ausente como zero — mesma regra já decidida em
Core/Estrutura_roadmap/16_BASELINES_CALIBRACAO.md §7.1. "Patch-1"/"patch-2"
aqui significam os dois patches anteriores **que de fato temos no banco**
para aquele (tier, lane, campeão), não necessariamente os patches
imediatamente anteriores na sequência real do jogo — nossa coleta tem
buracos (nem todo patch é coletado), então usar sequência estrita deixaria
a média móvel praticamente sempre incompleta.

Uso: python -m app.jobs.compute_build
"""

import asyncio
import math
from collections import defaultdict

from app.adapters.data_dragon import DataDragonAdapter
from app.core.champions import resolve_champion_id
from app.core.logging import get_logger, new_correlation_id
from app.core.stats import percentile_rank
from app.db.models import ChampionBuildPatch, ChampionBuildScore, Match, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def _build_key(core_items: list[int]) -> tuple[int, ...]:
    return tuple(sorted(item for item in (core_items or []) if item))


def _shannon_entropy(counts: list[int]) -> float:
    total = sum(counts)
    if total == 0:
        return 0.0
    entropy = 0.0
    for count in counts:
        if count == 0:
            continue
        p = count / total
        entropy -= p * math.log(p)
    return entropy


def _item_spike(participants: list[MatchParticipant]) -> tuple[int | None, float]:
    """Item mais frequente do campeão no grupo ("item atual" inferido) e o
    delta de win rate com/sem ele presente no build."""
    item_games: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for p in participants:
        for item in set(item for item in (p.core_items or []) if item):
            item_games[item][0] += 1
            item_games[item][1] += int(p.win)

    if not item_games:
        return None, 0.0

    item_atual = max(item_games.items(), key=lambda kv: kv[1][0])[0]
    games_with, wins_with = item_games[item_atual]
    wr_with = wins_with / games_with if games_with else 0.0

    total_games = len(participants)
    total_wins = sum(int(p.win) for p in participants)
    games_without = total_games - games_with
    wr_without = (total_wins - wins_with) / games_without if games_without else wr_with

    return item_atual, wr_with - wr_without


def _compute_b_patch() -> int:
    data_dragon = DataDragonAdapter()
    all_versions = None  # resolvido preguiçosamente, só se houver dados

    def resolve_names(version_prefix: str) -> dict[int, str]:
        nonlocal all_versions
        if all_versions is None:
            all_versions = asyncio.run(data_dragon.get_versions())
        version = next((v for v in all_versions if v.startswith(version_prefix)), all_versions[0])
        return asyncio.run(data_dragon.get_champion_name_by_riot_id(version))

    session = SessionLocal()
    try:
        session.query(ChampionBuildPatch).delete()

        rows = (
            session.query(MatchParticipant, Patch.version_label)
            .join(Match, Match.match_id == MatchParticipant.match_id)
            .join(Patch, Patch.id == Match.patch_id)
            .all()
        )

        by_lane_group: dict[tuple[str, str, str], list[MatchParticipant]] = defaultdict(list)
        for participant, version_label in rows:
            lane = participant.resolved_position or "UNKNOWN"
            by_lane_group[(version_label, participant.elo_tier, lane)].append(participant)

        name_cache: dict[str, dict[int, str]] = {}
        created = 0

        for (version_label, tier, lane), group_participants in by_lane_group.items():
            if version_label not in name_cache:
                name_cache[version_label] = resolve_names(version_label)
            names = name_cache[version_label]

            by_champion: dict[int, list[MatchParticipant]] = defaultdict(list)
            for p in group_participants:
                by_champion[p.riot_champion_id].append(p)

            champion_stats = {}
            for riot_champion_id, champ_participants in by_champion.items():
                total_games = len(champ_participants)
                total_wins = sum(int(p.win) for p in champ_participants)
                wr_medio = total_wins / total_games if total_games else 0.0

                build_counts: dict[tuple[int, ...], list[int]] = defaultdict(lambda: [0, 0])
                for p in champ_participants:
                    key = _build_key(p.core_items)
                    build_counts[key][0] += 1
                    build_counts[key][1] += int(p.win)

                counts_only = [c[0] for c in build_counts.values()]
                entropia = _shannon_entropy(counts_only)
                h_max = math.log(len(build_counts)) if len(build_counts) > 1 else 0.0
                nota_flex = (entropia / h_max * 100) if h_max > 0 else 0.0

                wr_otimo = max(
                    (wins / games for games, wins in build_counts.values() if games), default=wr_medio
                )
                delta_dep = wr_otimo - wr_medio

                item_atual, delta_spike = _item_spike(champ_participants)

                champion_stats[riot_champion_id] = {
                    "n_builds_distintos": len(build_counts),
                    "entropia_itens": entropia,
                    "nota_flex": nota_flex,
                    "wr_build_otimo": wr_otimo,
                    "wr_build_medio": wr_medio,
                    "delta_dep": delta_dep,
                    "item_atual": item_atual,
                    "delta_spike": delta_spike,
                }

            dep_values = [s["delta_dep"] for s in champion_stats.values()]
            spike_values = [s["delta_spike"] for s in champion_stats.values()]

            for riot_champion_id, stats in champion_stats.items():
                nota_dep = 100 - percentile_rank(dep_values, stats["delta_dep"])
                nota_spike = percentile_rank(spike_values, stats["delta_spike"])
                b_patch = 0.40 * stats["nota_flex"] + 0.30 * nota_dep + 0.30 * nota_spike

                champion_name = resolve_champion_id(
                    names, riot_champion_id, by_champion[riot_champion_id][0].champion_name
                )

                session.add(
                    ChampionBuildPatch(
                        patch=version_label,
                        tier=tier,
                        lane=lane,
                        champion_id=champion_name,
                        n_builds_distintos=stats["n_builds_distintos"],
                        entropia_itens=stats["entropia_itens"],
                        nota_flex=stats["nota_flex"],
                        wr_build_otimo=stats["wr_build_otimo"],
                        wr_build_medio=stats["wr_build_medio"],
                        nota_dep=nota_dep,
                        item_atual=str(stats["item_atual"]) if stats["item_atual"] else None,
                        delta_spike=stats["delta_spike"],
                        nota_spike=nota_spike,
                        b_patch=b_patch,
                    )
                )
                created += 1

        session.commit()
    finally:
        session.close()

    return created


def _compute_smoothed_scores() -> int:
    session = SessionLocal()
    try:
        session.query(ChampionBuildScore).delete()

        entries_by_key: dict[tuple[str, str, str], list[ChampionBuildPatch]] = defaultdict(list)
        for row in session.query(ChampionBuildPatch).all():
            entries_by_key[(row.tier, row.lane, row.champion_id)].append(row)

        patch_sequence = {p.version_label: p.patch_sequence for p in session.query(Patch).all()}

        created = 0
        for entries in entries_by_key.values():
            entries.sort(key=lambda r: patch_sequence.get(r.patch, 0))

            for i, entry in enumerate(entries):
                b_now = entry.b_patch
                b_prev1 = entries[i - 1].b_patch if i >= 1 else None
                b_prev2 = entries[i - 2].b_patch if i >= 2 else None

                if b_prev2 is not None:
                    build_score = 0.50 * b_now + 0.30 * b_prev1 + 0.20 * b_prev2
                    patches_disponiveis = 3
                elif b_prev1 is not None:
                    build_score = (0.50 / 0.80) * b_now + (0.30 / 0.80) * b_prev1
                    patches_disponiveis = 2
                else:
                    build_score = b_now
                    patches_disponiveis = 1

                session.add(
                    ChampionBuildScore(
                        patch=entry.patch,
                        tier=entry.tier,
                        lane=entry.lane,
                        champion_id=entry.champion_id,
                        build_score=build_score,
                        patches_disponiveis=patches_disponiveis,
                    )
                )
                created += 1

        session.commit()
        return created
    finally:
        session.close()


def compute() -> dict:
    new_correlation_id()
    init_db()
    b_patch_rows = _compute_b_patch()
    smoothed_rows = _compute_smoothed_scores()
    return {"linhas_b_patch": b_patch_rows, "linhas_suavizadas": smoothed_rows}


def main() -> None:
    result = compute()
    log.info("job_concluido", job="compute_build", **result)


if __name__ == "__main__":
    main()
