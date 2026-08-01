export interface RegionOption {
  value: string
  label: string
  flag: string
}

/** Todas as regiões que a Riot suporta pra Análise do Jogador (busca por
 * Riot ID via Account-V1, qualquer região funciona). `flag` é emoji de
 * bandeira — LAN/LAS cobrem vários países, então usam 🌎 em vez de
 * escolher um país arbitrário; EUW/EUNE usam 🇪🇺 pelo mesmo motivo. */
export const REGIONS: RegionOption[] = [
  { value: 'br1', label: 'Brasil', flag: '🇧🇷' },
  { value: 'na1', label: 'América do Norte', flag: '🇺🇸' },
  { value: 'lan', label: 'LAN', flag: '🌎' },
  { value: 'las', label: 'LAS', flag: '🌎' },
  { value: 'euw1', label: 'Europa Ocidental', flag: '🇪🇺' },
  { value: 'eun1', label: 'Europa Nórdica/Leste', flag: '🇪🇺' },
  { value: 'kr', label: 'Coreia', flag: '🇰🇷' },
  { value: 'jp1', label: 'Japão', flag: '🇯🇵' },
]

/** Regiões cobertas pelo job de Rankings (`rankings_platform_regions` em
 * `backend/app/core/config.py`) — subconjunto menor de propósito, cobrir
 * as 8 acima multiplicaria a cota da Riot gasta pelo job por 8. Mantenha
 * os dois em sincronia se a lista do backend mudar. */
export const RANKINGS_REGIONS: RegionOption[] = REGIONS.filter((r) =>
  ['br1', 'na1', 'euw1', 'kr'].includes(r.value),
)

/** Países mostrados no filtro de Campeões (rodada 22) — só `br1` é
 * funcional hoje, porque TODO o pipeline de score (não só um snapshot
 * como o Rankings) coleta partidas de uma única região. Os demais ficam
 * visíveis mas desabilitados, prontos pra quando a coleta expandir —
 * decisão explícita do usuário pra não fingir suporte que não existe. */
export const CHAMPIONS_COUNTRY_OPTIONS: RegionOption[] = REGIONS
