"""Política de retenção de PUUID (Core §06_SEGURANCA_PRIVACIDADE.md §7,
item registrado como `EM ABERTO` desde a rodada 9, resolvido na rodada 18).

`match_participants.puuid` existe desde a Fase 0 só pra viabilizar a
expansão "bola de neve" por participantes (11_PIPELINE_INGESTAO.md §2.2,
ainda não construída) — nenhum estágio de agregação ou score (Camadas
1-4) lê `puuid`, só `riot_champion_id`, `resolved_position`, resultado da
partida e itens. Aplicando o teste de minimização de dados do próprio doc
("qual funcionalidade deixa de funcionar sem isso?"): passada a janela de
coleta ativa (`ingest_days_window`, mesmo valor por decisão deliberada —
ver `puuid_retention_days` em core/config.py), a resposta vira "nenhuma",
e o campo deve ser zerado.

Zera (`NULL`), não deleta a linha: `kills`/`deaths`/`assists`/`core_items`
continuam necessários pra qualquer reprocessamento futuro das Camadas 1 e
3 sobre esse patch. Só o vínculo com o jogador é removido.

Uso: python -m app.jobs.purge_puuid
"""

from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.db.models import Match, MatchParticipant
from app.db.session import SessionLocal, init_db


def purge(retention_days: int | None = None) -> dict:
    init_db()
    settings = get_settings()
    if retention_days is None:
        retention_days = settings.puuid_retention_days

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    cutoff_ts_ms = int(cutoff.timestamp() * 1000)

    session = SessionLocal()
    try:
        old_match_ids = (
            session.query(Match.match_id).filter(Match.game_start_ts < cutoff_ts_ms).subquery()
        )

        affected = (
            session.query(MatchParticipant)
            .filter(MatchParticipant.match_id.in_(old_match_ids.select()), MatchParticipant.puuid.isnot(None))
            .update({MatchParticipant.puuid: None}, synchronize_session=False)
        )

        session.commit()
        return {"linhas_zeradas": affected, "cutoff_dias": retention_days}
    finally:
        session.close()


def main() -> None:
    result = purge()
    print(
        f"PUUID zerado em {result['linhas_zeradas']} participantes de partidas "
        f"com mais de {result['cutoff_dias']} dias."
    )


if __name__ == "__main__":
    main()
