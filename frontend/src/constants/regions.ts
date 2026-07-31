export interface RegionOption {
  value: string
  label: string
}

/** Todas as regiões que a Riot suporta pra Análise do Jogador (busca por
 * Riot ID via Account-V1, qualquer região funciona). */
export const REGIONS: RegionOption[] = [
  { value: 'br1', label: 'Brasil' },
  { value: 'na1', label: 'América do Norte' },
  { value: 'lan', label: 'LAN' },
  { value: 'las', label: 'LAS' },
  { value: 'euw1', label: 'Europa Ocidental' },
  { value: 'eun1', label: 'Europa Nórdica/Leste' },
  { value: 'kr', label: 'Coreia' },
  { value: 'jp1', label: 'Japão' },
]

/** Regiões cobertas pelo job de Rankings (`rankings_platform_regions` em
 * `backend/app/core/config.py`) — subconjunto menor de propósito, cobrir
 * as 8 acima multiplicaria a cota da Riot gasta pelo job por 8. Mantenha
 * os dois em sincronia se a lista do backend mudar. */
export const RANKINGS_REGIONS: RegionOption[] = REGIONS.filter((r) =>
  ['br1', 'na1', 'euw1', 'kr'].includes(r.value),
)
