"""Explicabilidade por camada (Core Fase 3, item 3.1) — o principal
diferencial do produto segundo `09_BACKLOG.md` §Fase 3 e
`08_BENCHMARK_CONCORRENTES.md` §5-6: os concorrentes entregam um número
fechado, sem dizer *por que* o campeão está naquele tier.

O documento pede "mostrar o que puxou o score" mas não define fórmula.
Interpretação usada aqui (decisão, não spec): decompor o score final em
contribuições por camada, medindo o quanto cada uma desvia do ponto
**neutro** e ponderando pelo peso realmente usado naquela linha.

    contribuicao_i = peso_normalizado_i * (score_i - NEUTRO)
    score_final    = NEUTRO + soma(contribuicoes)

A identidade acima é exata, não aproximada — é só a média ponderada
reescrita. Isso importa: a explicação nunca "não fecha" com o número
exibido, que é o problema clássico de explicação pós-hoc.

NEUTRO = 50 não é arbitrário; é o ponto neutro que o modelo inteiro já
usa: z-score 0 vira Nota_WR 50 na curva logística
(`02_MODELO_SCORE_TIERS.md` §4.1), a mediana de qualquer percentil é 50, e
Nota_Tendencia é definida como `50 + slope_normalizado*50` (§7). Uma
camada em 50 é "na média do grupo" e por definição não puxa o score pra
lado nenhum.

Usa `pesos_usados` persistido em cada linha de `champion_scores` em vez
das constantes do job: quando falta Kit pro patch, o peso foi
redistribuído entre as outras camadas, e a explicação precisa refletir o
que de fato entrou na conta daquela linha — não o peso nominal.
"""

NEUTRO = 50.0


def layer_contributions(layer_scores: dict[str, float], pesos_usados: dict[str, float]) -> list[dict]:
    """Contribuições por camada, ordenadas do maior impacto positivo ao
    maior negativo. Camadas sem score (ex: Kit ausente pro patch) são
    ignoradas — nunca tratadas como zero, mesmo princípio do resto do
    pipeline.

    Devolve, por camada: score bruto, peso normalizado (o que de fato
    pesou nesta linha) e contribuição em pontos do score final.
    """
    disponiveis = {
        nome: score
        for nome, score in layer_scores.items()
        if score is not None and nome in pesos_usados
    }
    soma_pesos = sum(pesos_usados[nome] for nome in disponiveis)
    if not disponiveis or soma_pesos == 0:
        return []

    contribuicoes = []
    for nome, score in disponiveis.items():
        peso_normalizado = pesos_usados[nome] / soma_pesos
        contribuicoes.append(
            {
                "camada": nome,
                "score": score,
                "peso": peso_normalizado,
                "contribuicao": peso_normalizado * (score - NEUTRO),
            }
        )

    contribuicoes.sort(key=lambda c: c["contribuicao"], reverse=True)
    return contribuicoes


def explain_score(layer_scores: dict[str, float], pesos_usados: dict[str, float]) -> dict:
    """Explicação completa de uma linha de score, pronta pra API.

    `camadas_ausentes` é explícito em vez de silencioso: se o Kit não
    existe pro patch, o usuário precisa saber que o score foi calculado
    sem ele — senão a explicação parece completa quando não é.
    """
    contribuicoes = layer_contributions(layer_scores, pesos_usados)
    ausentes = [nome for nome, score in layer_scores.items() if score is None]

    return {
        "base": NEUTRO,
        "camadas": contribuicoes,
        "camadas_ausentes": ausentes,
    }
