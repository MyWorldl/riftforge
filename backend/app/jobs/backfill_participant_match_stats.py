"""Rodada única (rodada 29) — não entra no workflow diário.

Mesmo padrão de `backfill_participant_runes.py`: `ingest_matches.py` nunca
leu CS/ouro/dano/visão/multikills/participação em abate do participante, e
`matches.raw_payload` guarda o payload bruto completo desde o início (Core
Fase 0, item 0.1) — dá pra preencher essas colunas reprocessando o que já
está no banco, zero chamadas novas à Riot.

Todo o trabalho roda dentro do Postgres (um `UPDATE ... FROM` sobre JSON),
mesmo motivo documentado no módulo das runas: processar em loop Python trava
contra o pooler do Supabase (conexão parada, sem nem levantar exceção).

`kill_participation`/`team_damage_percentage` vêm prontos de
`participant["challenges"]` — a própria Riot já calcula, não precisa somar
o time manualmente. Esse campo é ausente em partidas muito antigas (a Riot
adicionou depois); nesse caso os dois ficam `NULL`, mesma semântica de
"não calculável" já usada nas colunas de runa.

Casa por `(match_id, riot_champion_id)`, não por `puuid` — mesmo motivo do
backfill de runas (campeão não se repete numa partida ranqueada, e
continua funcionando em linhas com `puuid` já zerado pela retenção).

Uso: python -m app.jobs.backfill_participant_match_stats
"""

from sqlalchemy import text

from app.core.logging import get_logger, new_correlation_id
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)

_BACKFILL_SQL = text(
    """
    WITH participants AS (
        SELECT
            m.match_id,
            (p->>'championId')::int AS riot_champion_id,
            -- Sem COALESCE de propósito: se o payload foi cortado (rodada
            -- 2, revisão técnica §2.2/§4.3), essas duas chaves não
            -- existem, e a soma vira NULL em vez de "0 CS" — 0 seria
            -- indistinguível de "sem dado" pra quem consumir a coluna.
            (p->>'totalMinionsKilled')::int + (p->>'neutralMinionsKilled')::int AS total_cs,
            (p->>'goldEarned')::int AS gold_earned,
            (p->>'totalDamageDealtToChampions')::int AS damage_to_champions,
            (p->>'totalDamageTaken')::int AS damage_taken,
            (p->>'visionScore')::int AS vision_score,
            (p->>'doubleKills')::int AS double_kills,
            (p->>'tripleKills')::int AS triple_kills,
            (p->>'quadraKills')::int AS quadra_kills,
            (p->>'pentaKills')::int AS penta_kills,
            (p->'challenges'->>'killParticipation')::float AS kill_participation,
            (p->'challenges'->>'teamDamagePercentage')::float AS team_damage_percentage
        FROM matches m
        CROSS JOIN LATERAL jsonb_array_elements(m.raw_payload::jsonb->'info'->'participants') AS p
    )
    UPDATE match_participants mp
    SET
        total_cs = participants.total_cs,
        gold_earned = participants.gold_earned,
        damage_to_champions = participants.damage_to_champions,
        damage_taken = participants.damage_taken,
        vision_score = participants.vision_score,
        double_kills = participants.double_kills,
        triple_kills = participants.triple_kills,
        quadra_kills = participants.quadra_kills,
        penta_kills = participants.penta_kills,
        kill_participation = participants.kill_participation,
        team_damage_percentage = participants.team_damage_percentage
    FROM participants
    WHERE mp.match_id = participants.match_id
      AND mp.riot_champion_id = participants.riot_champion_id
    """
)


def backfill() -> int:
    new_correlation_id()
    init_db()
    session = SessionLocal()
    try:
        result = session.execute(_BACKFILL_SQL)
        session.commit()
        return result.rowcount
    finally:
        session.close()


def main() -> None:
    updated = backfill()
    log.info(
        "job_concluido",
        job="backfill_participant_match_stats",
        linhas_atualizadas=updated,
    )


if __name__ == "__main__":
    main()
