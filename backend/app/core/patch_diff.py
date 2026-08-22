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

# Ajuste 21/08: "Variação" em Campeões (`delta_posicao`) virou posição
# numa rodada anterior (pedido do usuário, ver `_rank_by_lane`), mas
# sempre ranqueada por `score_final`, mesmo quando a tabela está ordenada
# por Win/Pick/Ban Rate — pedido novo do usuário: a posição deve refletir
# a métrica ativa. Em vez de expor só um `delta_posicao`, calcula pras 4
# métricas que `ChampionsPage.tsx::SortKey` já suporta; o frontend escolhe
# qual campo mostrar com base no que a tabela está ordenando no momento.
_RANK_METRICS = ("score_final", "win_rate", "pick_rate", "ban_rate")


def _rank_by_lane(linhas: list[dict], metric: str) -> dict[tuple[str, str], int]:
    """Posição (1 = melhor) de cada campeão dentro do ranking POR MÉTRICA
    da própria rota — pedido do usuário (revisão pós-repaginação): "Variação"
    em Campeões vira posição, não score/tier, e só faz sentido comparar
    posição entre campeões da MESMA rota (Xerath TOP e Xerath UTILITY
    competem em rankings separados, misturar as duas seria comparar coisas
    diferentes). Sempre ordena decrescente (maior valor = posição 1) —
    vale tanto pra score/win_rate (mais alto é melhor) quanto pra
    pick_rate/ban_rate (mais alto = mais relevante no meta), mesma
    convenção de `sortScores` no frontend. Linhas sem a métrica (win/pick/
    ban rate ausente por falta de `ChampionPerformanceScore` pro patch)
    ficam de fora do ranking dessa métrica específica, não travam."""
    por_rota: dict[str, list[dict]] = {}
    for row in linhas:
        por_rota.setdefault(row["lane"], []).append(row)
    posicoes: dict[tuple[str, str], int] = {}
    for lane, rows in por_rota.items():
        elegiveis = [r for r in rows if r.get(metric) is not None]
        ordenado = sorted(elegiveis, key=lambda r: r[metric], reverse=True)
        for index, row in enumerate(ordenado):
            posicoes[(row["champion_id"], lane)] = index + 1
    return posicoes


def diff_patches(
    linhas_patch_atual: list[dict],
    linhas_patch_anterior: list[dict],
    top_n: int = 10,
) -> dict:
    """Cada linha de entrada precisa de `champion_id`, `lane`, `score_final`,
    `score_tier` — `win_rate`/`pick_rate`/`ban_rate` são opcionais (`None`
    quando ausentes), usados só pra `delta_posicao_<métrica>`. Casa por
    `(champion_id, lane)` — um campeão sem a mesma combinação no patch
    anterior (recém-jogado, ou rota nova pra ele) não entra no diff, não é
    contado como queda de 100%."""
    anterior_por_chave = {
        (r["champion_id"], r["lane"]): r for r in linhas_patch_anterior
    }
    posicoes_atual = {
        metric: _rank_by_lane(linhas_patch_atual, metric) for metric in _RANK_METRICS
    }
    posicoes_anterior = {
        metric: _rank_by_lane(linhas_patch_anterior, metric) for metric in _RANK_METRICS
    }

    deltas = []
    for row in linhas_patch_atual:
        chave = (row["champion_id"], row["lane"])
        anterior = anterior_por_chave.get(chave)
        if anterior is None:
            continue

        # Positivo = subiu (posição numérica menor é melhor, por isso a
        # subtração é anterior - atual, não o contrário) — mesmo sinal de
        # `PlayerRanking.delta_posicao` em Rankings. `None` quando o
        # campeão não tinha a métrica num dos dois patches (fora do
        # ranking daquela métrica específica).
        deltas_posicao = {}
        for metric in _RANK_METRICS:
            pos_atual = posicoes_atual[metric].get(chave)
            pos_anterior = posicoes_anterior[metric].get(chave)
            deltas_posicao[metric] = (
                pos_anterior - pos_atual
                if pos_atual is not None and pos_anterior is not None
                else None
            )

        deltas.append(
            {
                "champion_id": row["champion_id"],
                "lane": row["lane"],
                "score_anterior": anterior["score_final"],
                "score_atual": row["score_final"],
                "delta": row["score_final"] - anterior["score_final"],
                "tier_anterior": anterior["score_tier"],
                "tier_atual": row["score_tier"],
                "posicao_anterior": posicoes_anterior["score_final"].get(chave),
                "posicao_atual": posicoes_atual["score_final"].get(chave),
                "delta_posicao": deltas_posicao["score_final"],
                "delta_posicao_win_rate": deltas_posicao["win_rate"],
                "delta_posicao_pick_rate": deltas_posicao["pick_rate"],
                "delta_posicao_ban_rate": deltas_posicao["ban_rate"],
            }
        )

    altas = sorted(
        (d for d in deltas if d["delta"] > 0), key=lambda d: d["delta"], reverse=True
    )
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
