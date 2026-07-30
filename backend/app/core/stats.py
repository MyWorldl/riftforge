"""Funções estatísticas puras compartilhadas entre os estágios do pipeline
de score (Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md)."""

import math


def wilson_lower_bound(wins: int, n: int, z: float) -> float:
    """Limite inferior do intervalo de Wilson para uma proporção — ver
    Core/Estrutura_roadmap/02_MODELO_SCORE_TIERS.md §4.1 para a fórmula."""
    if n == 0:
        return 0.0
    p = wins / n
    denominator = 1 + z**2 / n
    center = p + z**2 / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z**2 / (4 * n**2))
    return (center - margin) / denominator


def percentile_rank(values: list[float], value: float) -> float:
    """Percentil por rank médio: empates recebem o percentil do meio do
    grupo empatado, em vez de favorecer o maior ou o menor valor."""
    n = len(values)
    if n == 0:
        return 0.0
    less = sum(1 for v in values if v < value)
    equal = sum(1 for v in values if v == value)
    return (less + 0.5 * equal) / n * 100
