"""Distinção entre poder estrutural e poder emprestado do meta (Core Fase
3, item 3.2 — `09_BACKLOG.md` §Fase 3, prioridade Alta / esforço Baixo).

A pergunta que o item resolve: "esse campeão é bom" (característica do
próprio campeão, não muda de patch pra patch) ou "esse campeão está bom
agora" (favorecido pelo meta corrente, pode cair no próximo patch)?

O modelo já carrega essa distinção embutida nos pesos nominais — não é uma
interpretação nova, é uma releitura do que já existe:

    Kit + Build   = 0.25 + 0.25 = 50% do peso -> características do
                    próprio campeão (kit não muda de patch, build reflete
                    itens que ele consegue aproveitar bem, estrutural)
    Performance + Meta = 0.40 + 0.10 = 50% do peso -> desempenho e
                    contexto do patch corrente (o quanto o metagame de
                    agora favorece esse campeão)

Igual à explicabilidade por camada (item 3.1, `explain.py`), usa
`pesos_usados` persistido na linha, não as constantes nominais — quando
falta Kit pro patch, o peso estrutural que sobra é só o do Build, e o
resultado reflete isso honestamente em vez de fingir que a metade
"estrutural" continua intacta.

A classificação qualitativa (estrutural / meta / equilibrado) existe pra
tornar o número acionável sem o usuário precisar interpretar a diferença
sozinho. O limiar de 10 pontos é uma escolha pragmática, documentada como
decisão — o mesmo padrão já usado alhures neste projeto (ex.: `trap_flag`
em compute_scores.py) de expor um corte fixo em vez de deixar o dado bruto
sem leitura nenhuma.
"""

ESTRUTURAL = {"kit", "build"}
META_DEPENDENTE = {"performance", "meta"}

LIMIAR_CLASSIFICACAO = 10.0


def _media_ponderada(
    layer_scores: dict[str, float | None], pesos_usados: dict[str, float], camadas: set[str]
) -> tuple[float | None, float]:
    disponiveis = {
        nome: score
        for nome, score in layer_scores.items()
        if score is not None and nome in camadas and nome in pesos_usados
    }
    peso_total = sum(pesos_usados[nome] for nome in disponiveis)
    if not disponiveis or peso_total == 0:
        return None, 0.0
    media = sum(pesos_usados[nome] * score for nome, score in disponiveis.items()) / peso_total
    return media, peso_total


def _classificar(estrutural: float | None, meta: float | None) -> str:
    if estrutural is None or meta is None:
        return "indeterminado"
    diferenca = estrutural - meta
    if diferenca >= LIMIAR_CLASSIFICACAO:
        return "estrutural"
    if diferenca <= -LIMIAR_CLASSIFICACAO:
        return "meta"
    return "equilibrado"


def power_profile(layer_scores: dict[str, float | None], pesos_usados: dict[str, float]) -> dict:
    """Perfil de poder de uma linha de score: quanto vem de característica
    própria do campeão (Kit+Build) vs. quanto vem do momento do patch
    (Performance+Meta), mais uma leitura qualitativa da diferença."""
    estrutural_score, estrutural_peso = _media_ponderada(layer_scores, pesos_usados, ESTRUTURAL)
    meta_score, meta_peso = _media_ponderada(layer_scores, pesos_usados, META_DEPENDENTE)

    return {
        "estrutural": {"score": estrutural_score, "peso": estrutural_peso},
        "meta": {"score": meta_score, "peso": meta_peso},
        "classificacao": _classificar(estrutural_score, meta_score),
    }
