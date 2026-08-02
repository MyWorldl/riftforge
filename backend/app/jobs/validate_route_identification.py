"""Item 0.2 do backlog: valida `teamPosition` (o que o pipeline usa como
`resolved_position` desde a Fase 0) contra o Método 1 de
`Core/Estrutura_roadmap/12_IDENTIFICACAO_ROTA.md` §2 — item registrado
como `EM ABERTO` desde a rodada 9 ("nunca validado contra os ~95% do
Método playrate").

Por que Método 1 e não Método 2 (playrate, ~95% de acurácia, recomendado
pelo doc): Método 2 calcula a posição mais provável de um campeão a
partir do próprio histórico de posições dele — mas esse histórico, hoje,
**é** `resolved_position` (teamPosition). Usar Método 2 pra validar
teamPosition seria circular: a "verdade" de comparação viria do mesmo
dado que queremos checar. Método 1 usa só `raw_role`/`raw_lane` (os
campos brutos `role`/`lane` do Match-V5), guardados desde a ingestão
especificamente para isso (`ingest_matches.py`, Core Fase 0) — não
depende de teamPosition em nada, então é uma segunda opinião genuinamente
independente, mesmo sendo uma acurácia menor (o doc credita ~87,5% ao
Método 1 sozinho, contra ~95% do Método 2).

Mapa adaptado aos valores **reais** observados no banco de produção — o
doc usa nomenclatura mais antiga da API ("DUO_CARRY", "TOP_LANE"), a
Match-V5 atual retorna "CARRY"/"SUPPORT"/"SOLO"/"NONE" para `role` e
"TOP"/"JUNGLE"/"MIDDLE"/"BOTTOM"/"NONE" para `lane` (confirmado via SQL
direto antes de escrever este mapa, não copiado do doc às cegas):

    (NONE, JUNGLE)     -> JUNGLE
    (SOLO, TOP)        -> TOP
    (SOLO, MIDDLE)     -> MIDDLE
    (CARRY, BOTTOM)    -> BOTTOM
    (SUPPORT, BOTTOM)  -> UTILITY

Combos fora desses 5 (ex: DUO puro, SUPPORT em MIDDLE) não têm
mapeamento inequívoco no Método 1 — ficam de fora da amostra avaliada,
não viram um palpite.

**Resultado real (rodada 18, banco de produção, 52.780 participantes):**
concordância geral 82,8%, mas bem desigual — Selva 58,3%, Topo 79,8%,
Meio/Atirador/Suporte 98,9-99,9%. Investigado por identidade de campeão
em vez de aceitar o número isolado: nos casos de discordância "Selva
esperado, teamPosition diz Topo", os campeões são majoritariamente
topo puro (Mordekaiser, Garen, Teemo, Darius, Malphite...); nos casos
"Topo esperado, teamPosition diz Meio", são majoritariamente meio puro
(Yasuo, Zed, Akali, Ahri, Veigar...). Ou seja: **teamPosition está
corrigindo exatamente o erro que o campo bruto `lane` comete** (ele é
calculado por proximidade de minion/torre, e se confunde quando o
jogador sai da rota) — a discordância é evidência a favor de
teamPosition, não contra. Conclusão: manter teamPosition como está é
justificado pela evidência, não só por conveniência. Detalhe completo em
`Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md` rodada 18.

Uso: python -m app.jobs.validate_route_identification
"""

from collections import defaultdict

from app.core.logging import get_logger, new_correlation_id
from app.db.models import MatchParticipant
from app.db.session import SessionLocal, init_db

log = get_logger(__name__)

METODO_1_MAPA: dict[tuple[str, str], str] = {
    ("NONE", "JUNGLE"): "JUNGLE",
    ("SOLO", "TOP"): "TOP",
    ("SOLO", "MIDDLE"): "MIDDLE",
    ("CARRY", "BOTTOM"): "BOTTOM",
    ("SUPPORT", "BOTTOM"): "UTILITY",
}


def metodo_1(raw_role: str | None, raw_lane: str | None) -> str | None:
    """Posição esperada pelo mapeamento direto Role+Lane, sem depender de
    teamPosition. `None` quando o combo não está nos 5 casos canônicos —
    "sem opinião" é a resposta honesta, não uma posição chutada."""
    if raw_role is None or raw_lane is None:
        return None
    return METODO_1_MAPA.get((raw_role, raw_lane))


def validate() -> dict:
    new_correlation_id()
    init_db()
    session = SessionLocal()
    try:
        rows = (
            session.query(
                MatchParticipant.raw_role,
                MatchParticipant.raw_lane,
                MatchParticipant.resolved_position,
            )
            .filter(
                MatchParticipant.raw_role.isnot(None),
                MatchParticipant.raw_lane.isnot(None),
                MatchParticipant.resolved_position.isnot(None),
            )
            .all()
        )

        por_posicao: dict[str, dict[str, int]] = defaultdict(lambda: {"concorda": 0, "total": 0})
        cobertos = 0
        for raw_role, raw_lane, resolved_position in rows:
            esperado = metodo_1(raw_role, raw_lane)
            if esperado is None:
                continue
            cobertos += 1
            por_posicao[esperado]["total"] += 1
            if resolved_position == esperado:
                por_posicao[esperado]["concorda"] += 1

        total_concorda = sum(v["concorda"] for v in por_posicao.values())
        total_geral = sum(v["total"] for v in por_posicao.values())

        return {
            "participantes_avaliados": len(rows),
            "cobertos_pelo_metodo_1": cobertos,
            "concordancia_geral_pct": round(100 * total_concorda / total_geral, 1) if total_geral else None,
            "por_posicao": {
                pos: {
                    "concordancia_pct": round(100 * v["concorda"] / v["total"], 1),
                    "n": v["total"],
                }
                for pos, v in sorted(por_posicao.items())
            },
        }
    finally:
        session.close()


def main() -> None:
    result = validate()
    log.info(
        "job_concluido",
        job="validate_route_identification",
        participantes_avaliados=result["participantes_avaliados"],
        cobertos_pelo_metodo_1=result["cobertos_pelo_metodo_1"],
        concordancia_geral_pct=result["concordancia_geral_pct"],
        por_posicao=result["por_posicao"],
    )


if __name__ == "__main__":
    main()
