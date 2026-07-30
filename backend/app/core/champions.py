"""Resolução do identificador de campeão, compartilhada pelos estágios do
pipeline.

Existe para garantir que `aggregate_stats.py` (que alimenta Performance e,
por consequência, Meta) e `compute_build.py` cheguem **sempre ao mesmo
`champion_id`** a partir do mesmo `riot_champion_id`. Antes os dois tinham
cadeias de fallback diferentes — um caía no `championName` bruto do
Match-V5, o outro no ID numérico como string. Enquanto o Data Dragon
conhecesse todos os campeões coletados isso nunca aparecia; no primeiro
campeão recém-lançado ainda não propagado para o ddragon daquele patch, o
mesmo campeão nasceria com duas identidades em tabelas diferentes, e o
join por `champion_id` em `compute_scores.py` descartaria a linha em
silêncio (contabilizada só como `linhas_puladas`).

Ordem de preferência, do mais estável ao menos:

1. `id` do Data Dragon — é a chave que o frontend usa para cruzar nome e
   imagem, então é a única que serve de verdade.
2. `championName` do Match-V5 — legível e quase sempre igual ao `id`, mas
   diverge de verdade. Dois casos confirmados nos dados reais deste
   projeto: apóstrofo ("Kai'Sa" vs "Kaisa"), que já quebrou o cruzamento
   de imagem no frontend, e **caixa** ("FiddleSticks" no Match-V5 vs
   "Fiddlesticks" no Data Dragon) — este último foi o único campeão de 173
   que não casou com a tabela de Kit antes desta unificação.
3. ID numérico como string — último recurso, garante que a linha não se
   perca mesmo sem nenhum nome disponível.
"""


def resolve_champion_id(
    name_by_riot_id: dict[int, str],
    riot_champion_id: int,
    raw_champion_name: str | None = None,
) -> str:
    """Identificador estável de campeão a partir do ID numérico da Riot."""
    resolved = name_by_riot_id.get(riot_champion_id)
    if resolved:
        return resolved
    if raw_champion_name:
        return raw_champion_name
    return str(riot_champion_id)
