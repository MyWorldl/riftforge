const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface ChampionMeta {
  id: string
  name: string
  title: string
  tags: string[]
  image: { full: string }
}

export interface ChampionsResponse {
  patch: string
  champions: Record<string, ChampionMeta>
}

export async function fetchChampions(): Promise<ChampionsResponse> {
  const response = await fetch(`${API_URL}/champions`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar campeões: ${response.status}`)
  }
  return response.json()
}

export interface ChampionStat {
  champion_id: string
  lane: string
  patch: string
  tier: string
  games: number
  win_rate: number
  pick_rate: number
  ban_rate: number
  kda: number
}

export interface ChampionStatsFilters {
  tier: string
  lane?: string
  patch?: string
}

export async function fetchChampionStats(filters: ChampionStatsFilters): Promise<ChampionStat[]> {
  const params = new URLSearchParams({ tier: filters.tier })
  if (filters.lane) params.set('lane', filters.lane)
  if (filters.patch) params.set('patch', filters.patch)

  const response = await fetch(`${API_URL}/stats/champions?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar estatísticas: ${response.status}`)
  }
  return response.json()
}

export function championImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/champion/${imageFile}`
}
