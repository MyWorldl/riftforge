import flagBr1 from '../assets/flags/br.svg'
import flagNa1 from '../assets/flags/na1.svg'
import flagLan from '../assets/flags/lan.svg'
import flagLas from '../assets/flags/las.svg'
import flagEuw1 from '../assets/flags/euw1.svg'
import flagEun1 from '../assets/flags/eun1.svg'
import flagKr from '../assets/flags/kr.svg'
import flagJp1 from '../assets/flags/jp1.svg'

export interface RegionOption {
  value: string
  label: string
  flag: string
}

/** Todas as regiões que a Riot suporta pra Análise do Jogador (busca por
 * Riot ID via Account-V1, qualquer região funciona). `flag` é a imagem
 * (recortada em círculo via CSS) mostrada no dropdown customizado —
 * LAN/LAS e as duas regiões da Europa não têm um único país "dono", então
 * usam uma bandeira representativa (México/Argentina/UE/Polônia) em vez
 * de fingir uma nacionalidade única pro servidor. */
export const REGIONS: RegionOption[] = [
  { value: 'br1', label: 'Brasil', flag: flagBr1 },
  { value: 'na1', label: 'América do Norte', flag: flagNa1 },
  { value: 'lan', label: 'LAN', flag: flagLan },
  { value: 'las', label: 'LAS', flag: flagLas },
  { value: 'euw1', label: 'Europa Ocidental', flag: flagEuw1 },
  { value: 'eun1', label: 'Europa Nórdica/Leste', flag: flagEun1 },
  { value: 'kr', label: 'Coreia', flag: flagKr },
  { value: 'jp1', label: 'Japão', flag: flagJp1 },
]

/** Regiões cobertas pelo job de Rankings (`rankings_platform_regions` em
 * `backend/app/core/config.py`) — subconjunto menor de propósito, cobrir
 * as 8 acima multiplicaria a cota da Riot gasta pelo job por 8. Mantenha
 * os dois em sincronia se a lista do backend mudar. */
export const RANKINGS_REGIONS: RegionOption[] = REGIONS.filter((r) =>
  ['br1', 'na1', 'euw1', 'kr'].includes(r.value),
)

/** Países mostrados no filtro de Campeões (rodada 22) — precisa ficar em
 * sincronia com `pipeline_platform_regions` do backend
 * (`backend/app/core/config.py`), mesmo padrão de `RANKINGS_REGIONS`
 * acima. `br1` sempre funcional; `euw1` piloto (rodada 25, filtro de
 * região) — os demais ficam visíveis mas desabilitados, prontos pra
 * quando a coleta expandir, decisão explícita do usuário pra não fingir
 * suporte que não existe. */
export const CHAMPIONS_ENABLED_REGIONS = ['br1', 'euw1']

export const CHAMPIONS_COUNTRY_OPTIONS: RegionOption[] = REGIONS
