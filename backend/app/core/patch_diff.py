"""Item novo (rodada 19, "Patch Notes"): calcula os maiores aumentos/quedas
de `score_final` de um patch pro seguinte, por `(champion_id, lane)`.

Não é uma reprodução das notas de patch oficiais da Riot — isso seria
conteúdo protegido por direitos autorais, arriscado hospedar na íntegra
(ver decisão registrada em `Core/Estrutura_roadmap/17_ESTADO_IMPLEMENTADO.md`
§rodada 19). É derivado só do próprio modelo de score: compara duas listas
de `champion_scores` já calculadas e mostra quem mais subiu/caiu.

Função pura, testável sem banco — quem monta as duas listas (dois patches
consecutivos) é `GET /patch-notes` em `app/main.py`."""


def diff_patches(
    linhas_patch_atual: list[dict],
    linhas_patch_anterior: list[dict],
    top_n: int = 10,
) -> dict:
    """Cada linha de entrada precisa de `champion_id`, `lane`, `score_final`.
    Casa por `(champion_id, lane)` — um campeão sem a mesma combinação no
    patch anterior (recém-jogado, ou rota nova pra ele) não entra no diff,
    não é contado como queda de 100%."""
    score_anterior_por_chave = {
        (r["champion_id"], r["lane"]): r["score_final"] for r in linhas_patch_anterior
    }

    deltas = []
    for row in linhas_patch_atual:
        chave = (row["champion_id"], row["lane"])
        score_anterior = score_anterior_por_chave.get(chave)
        if score_anterior is None:
            continue
        deltas.append(
            {
                "champion_id": row["champion_id"],
                "lane": row["lane"],
                "score_anterior": score_anterior,
                "score_atual": row["score_final"],
                "delta": row["score_final"] - score_anterior,
            }
        )

    altas = sorted((d for d in deltas if d["delta"] > 0), key=lambda d: d["delta"], reverse=True)
    quedas = sorted((d for d in deltas if d["delta"] < 0), key=lambda d: d["delta"])

    return {
        "altas": altas[:top_n],
        "quedas": quedas[:top_n],
        "comparados": len(deltas),
    }
