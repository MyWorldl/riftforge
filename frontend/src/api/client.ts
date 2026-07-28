const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface ChampionsResponse {
  patch: string
  champions: Record<string, { id: string; name: string; title: string; tags: string[] }>
}

export async function fetchChampions(): Promise<ChampionsResponse> {
  const response = await fetch(`${API_URL}/champions`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar campeões: ${response.status}`)
  }
  return response.json()
}
