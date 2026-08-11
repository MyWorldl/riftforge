"""Item novo (rodada 19, "Patch Notes"): calcula os maiores aumentos/quedas
de `score_final` de um patch pro seguinte, por `(champion_id, lane)`.

Não é uma reprodução das notas de patch oficiais da Riot — isso seria
conteúdo protegido por direitos autorais, arriscado hospedar na íntegra
(ver decisão registrada em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`
§rodada 19). É derivado só do próprio modelo de score: compara duas listas
de `champion_scores` já calculadas e mostra quem mais subiu/caiu.

Rodada 21 (backlog 4.3, "notificação de mudança de tier"): a mesma
comparação passa a carregar `score_tier` de cada linha e separa quem
mudou de tier de letra (God-E) entre os dois patches — não é uma feature
nova, é o mesmo diff exposto de um jeito diferente. Não existe sistema de
conta/autenticação no projeto, então isso vira uma seção visível na
página de Patch Notes, não uma notificação push/e-mail de verdade.

Função pura, testável sem banco — quem monta as duas listas (dois patches
consecutivos) é `GET /patch-notes` em `app/main.py`."""


def _rank_by_lane(linhas: list[dict]) -> dict[tuple[str, str], int]:
    """Posição (1 = melhor) de cada campeão dentro do ranking por score da
    própria rota — pedido do usuário (revisão pós-repaginação): "Variação"
    em Campeões vira posição, não score/tier, e só faz sentido comparar
    posição entre campeões da MESMA rota (Xerath TOP e Xerath UTILITY
    competem em rankings separados, misturar as duas seria comparar coisas
    diferentes)."""
    por_rota: dict[str, list[dict]] = {}
    for row in linhas:
        por_rota.setdefault(row["lane"], []).append(row)
    posicoes: dict[tuple[str, str], int] = {}
    for lane, rows in por_rota.items():
        ordenado = sorted(rows, key=lambda r: r["score_final"], reverse=True)
        for index, row in enumerate(ordenado):
            posicoes[(row["champion_id"], lane)] = index + 1
    return posicoes


def diff_patches(
    linhas_patch_atual: list[dict],
    linhas_patch_anterior: list[dict],
    top_n: int = 10,
) -> dict:
    """Cada linha de entrada precisa de `champion_id`, `lane`, `score_final`,
    `score_tier`. Casa por `(champion_id, lane)` — um campeão sem a mesma
    combinação no patch anterior (recém-jogado, ou rota nova pra ele) não
    entra no diff, não é contado como queda de 100%."""
    anterior_por_chave = {(r["champion_id"], r["lane"]): r for r in linhas_patch_anterior}
    posicao_atual_por_chave = _rank_by_lane(linhas_patch_atual)
    posicao_anterior_por_chave = _rank_by_lane(linhas_patch_anterior)

    deltas = []
    for row in linhas_patch_atual:
        chave = (row["champion_id"], row["lane"])
        anterior = anterior_por_chave.get(chave)
        if anterior is None:
            continue
        posicao_atual = posicao_atual_por_chave[chave]
        posicao_anterior = posicao_anterior_por_chave[chave]
        deltas.append(
            {
                "champion_id": row["champion_id"],
                "lane": row["lane"],
                "score_anterior": anterior["score_final"],
                "score_atual": row["score_final"],
                "delta": row["score_final"] - anterior["score_final"],
                "tier_anterior": anterior["score_tier"],
                "tier_atual": row["score_tier"],
                # Positivo = subiu (posição numérica menor é melhor, por
                # isso a subtração é anterior - atual, não o contrário) —
                # mesmo sinal de `PlayerRanking.delta_posicao` em Rankings.
                "posicao_anterior": posicao_anterior,
                "posicao_atual": posicao_atual,
                "delta_posicao": posicao_anterior - posicao_atual,
            }
        )

    altas = sorted((d for d in deltas if d["delta"] > 0), key=lambda d: d["delta"], reverse=True)
    quedas = sorted((d for d in deltas if d["delta"] < 0), key=lambda d: d["delta"])
    # Sem limite de top_n: mudança de tier é sempre relevante de mostrar,
    # não só as N maiores por score_final (uma queda pequena que cruza a
    # fronteira do tier importa mais pro usuário que uma queda grande que
    # não muda a letra).
    mudancas_tier = [d for d in deltas if d["tier_anterior"] != d["tier_atual"]]

    return {
        "altas": altas[:top_n],
        "quedas": quedas[:top_n],
        "mudancas_tier": mudancas_tier,
        "comparados": len(deltas),
    }
