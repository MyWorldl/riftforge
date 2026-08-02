"""Rodada única (rodada 21) — não entra no workflow diário.

`ingest_matches.py` nunca leu `participant["perks"]`, então nenhuma linha
de `match_participants` tem runa gravada. Como `matches.raw_payload`
guarda o payload bruto completo desde o início (Core Fase 0, item 0.1),
dá pra preencher essas colunas reprocessando o que já está no banco —
zero chamadas novas à Riot.

**Todo o trabalho roda dentro do Postgres** (um `UPDATE ... FROM` sobre
JSON), não em Python linha a linha: a primeira versão deste job buscava
os ~5.700 payloads brutos pro cliente e processava em loop, o que travou
contra o pooler do Supabase (conexão parada, 0% de CPU, sem nem levantar
exceção — mesmo tipo de problema de conexão de vida longa já documentado
em `ingest_matches.py`, só que pior porque cada payload bruto é grande).
Resolvendo tudo com uma query só, o trabalho pesado fica no banco e o
Python só manda a instrução — de horas estimadas pra segundos, na prática.

Casa por `(match_id, riot_champion_id)`, não por `puuid`: um campeão não
se repete dentro da mesma partida ranqueada (draft), então a chave é
segura, e continua funcionando em linhas com `puuid` já zerado pela
política de retenção (rodada 18).

Uso: python -m app.jobs.backfill_participant_runes
"""

from sqlalchemy import text

from app.db.session import SessionLocal, init_db

_BACKFILL_SQL = text(
    """
    WITH participants AS (
        SELECT
            m.match_id,
            (p->>'championId')::int AS riot_champion_id,
            (
                SELECT s FROM jsonb_array_elements(p->'perks'->'styles') AS s
                WHERE s->>'description' = 'primaryStyle'
                LIMIT 1
            ) AS primary_style,
            (
                SELECT s FROM jsonb_array_elements(p->'perks'->'styles') AS s
                WHERE s->>'description' = 'subStyle'
                LIMIT 1
            ) AS sub_style
        FROM matches m
        CROSS JOIN LATERAL jsonb_array_elements(m.raw_payload::jsonb->'info'->'participants') AS p
    )
    UPDATE match_participants mp
    SET
        keystone_id = (participants.primary_style->'selections'->0->>'perk')::int,
        primary_style_id = (participants.primary_style->>'style')::int,
        sub_style_id = (participants.sub_style->>'style')::int
    FROM participants
    WHERE mp.match_id = participants.match_id
      AND mp.riot_champion_id = participants.riot_champion_id
    """
)


def backfill() -> int:
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
    print(f"Backfill de runas concluído: {updated} linhas de match_participants atualizadas.")


if __name__ == "__main__":
    main()
