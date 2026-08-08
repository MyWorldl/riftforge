"""Item novo (rodada 21, backlog 3.5): "campeão A vs. campeão B" na mesma
rota — comparador de matchups.

Casa adversários dentro da mesma partida: agrupa `match_participants` por
`(match_id, resolved_position)`. Quando exatamente 2 participantes de
times diferentes ocupam a mesma posição, os dois entram como adversários
um do outro (duas linhas por confronto observado — uma de cada
perspectiva, porque `win_rate` só faz sentido com um lado fixo). Partidas
com 0, 1 ou 3+ participantes na mesma posição (rota não resolvida por
algum dos dois, ou dado inconsistente) são ignoradas, não forçadas.

Nunca chama a Riot — lê só `match_participants`/`matches`/`patches` já
persistidos. Delete-and-recompute total a cada execução, mesmo padrão do
resto do pipeline.

Uso: python -m app.jobs.compute_matchups
"""

from collections import defaultdict

from app.core.champions import resolve_champion_id
from app.core.config import get_settings
from app.core.logging import get_logger, new_correlation_id
from app.db.models import ChampionMatchup, Match, MatchParticipant, Patch
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)


def compute() -> int:
    import asyncio

    from app.adapters.data_dragon import DataDragonAdapter

    new_correlation_id()
    init_db()
    settings = get_settings()
    data_dragon = DataDragonAdapter()

    # Item novo (filtro de região, piloto br1+euw1): região é constante
    # dentro de uma mesma partida (os dois lados do confronto sempre
    # compartilham `Match.platform_region`) — carregada junto com
    # `version_label` e propagada até a chave final e o delete escopado.
    regioes = [
        r.strip() for r in settings.pipeline_platform_regions.split(",") if r.strip()
    ]

    session = SessionLocal()
    try:
        for region in regioes:
            session.query(ChampionMatchup).filter_by(region=region).delete()

        rows = (
            session.query(
                MatchParticipant,
                Match.match_id,
                Patch.version_label,
                Match.platform_region,
            )
            .join(Match, Match.match_id == MatchParticipant.match_id)
            .join(Patch, Patch.id == Match.patch_id)
            .filter(Match.platform_region.in_(regioes))
            .all()
        )

        # Agrupa por (match_id, rota) pra achar os confrontos.
        by_match_lane: dict[
            tuple[str, str], list[tuple[MatchParticipant, str, str]]
        ] = defaultdict(list)
        for participant, match_id, version_label, region in rows:
            lane = participant.resolved_position or "UNKNOWN"
            by_match_lane[(match_id, lane)].append((participant, version_label, region))

        # Contagem bruta por (patch, tier, lane, campeão, adversário, região),
        # ainda com riot_champion_id — resolve pro nome do Data Dragon só
        # uma vez no final, evita reresolver por confronto.
        raw_counts: dict[tuple[str, str, str, int, int, str], list[int]] = defaultdict(
            lambda: [0, 0]
        )
        versions_seen: set[str] = set()
        champion_name_hint: dict[int, str] = {}

        for (_match_id, lane), entries in by_match_lane.items():
            if len(entries) != 2:
                continue
            (p1, version_label, region), (p2, _, _) = entries
            if p1.team_id == p2.team_id:
                continue
            versions_seen.add(version_label)
            champion_name_hint.setdefault(p1.riot_champion_id, p1.champion_name)
            champion_name_hint.setdefault(p2.riot_champion_id, p2.champion_name)

            key_1 = (
                version_label,
                p1.elo_tier,
                lane,
                p1.riot_champion_id,
                p2.riot_champion_id,
                region,
            )
            raw_counts[key_1][0] += 1
            raw_counts[key_1][1] += int(p1.win)

            key_2 = (
                version_label,
                p2.elo_tier,
                lane,
                p2.riot_champion_id,
                p1.riot_champion_id,
                region,
            )
            raw_counts[key_2][0] += 1
            raw_counts[key_2][1] += int(p2.win)

        all_versions = asyncio.run(data_dragon.get_versions())
        names_by_version: dict[str, dict[int, str]] = {}
        for version_label in versions_seen:
            version = next(
                (v for v in all_versions if v.startswith(version_label)),
                all_versions[0],
            )
            names_by_version[version_label] = asyncio.run(
                data_dragon.get_champion_name_by_riot_id(version)
            )

        created = 0
        for (version_label, tier, lane, riot_id, opponent_riot_id, region), (
            games,
            wins,
        ) in raw_counts.items():
            names = names_by_version[version_label]
            champion_id = resolve_champion_id(
                names, riot_id, champion_name_hint.get(riot_id)
            )
            opponent_champion_id = resolve_champion_id(
                names, opponent_riot_id, champion_name_hint.get(opponent_riot_id)
            )

            session.add(
                ChampionMatchup(
                    patch=version_label,
                    tier=tier,
                    lane=lane,
                    champion_id=champion_id,
                    opponent_champion_id=opponent_champion_id,
                    region=region,
                    games=games,
                    wins=wins,
                    amostra_insuficiente=games < settings.matchup_min_games,
                )
            )
            created += 1

        session.commit()
        return created
    finally:
        session.close()


def main() -> None:
    created = compute()
    log.info("job_concluido", job="compute_matchups", linhas_criadas=created)


if __name__ == "__main__":
    main()
