const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Erro de fetch que preserva o status HTTP — necessário pra distinguir
 *  "backend fora do ar" de "endpoint desativado de propósito" (501, ver
 *  `_ensure_riot_proxy_enabled` no backend). */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

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

export interface ChampionHistoryPoint {
  patch: string
  lane: string
  score_final: number
  score_tier: string
  confianca: number
  tier_provisorio: boolean
  n_matches: number
}

export interface ChampionHistoryFilters {
  championId: string
  eloTier: string
  lane?: string
}

export async function fetchChampionHistory(filters: ChampionHistoryFilters): Promise<ChampionHistoryPoint[]> {
  const params = new URLSearchParams({ champion_id: filters.championId, elo_tier: filters.eloTier })
  if (filters.lane) params.set('lane', filters.lane)

  const response = await fetch(`${API_URL}/scores/history?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar histórico: ${response.status}`)
  }
  return response.json()
}

export function championImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/champion/${imageFile}`
}

export interface LayerContribution {
  camada: string
  score: number
  peso: number
  contribuicao: number
}

export interface ScoreExplanation {
  base: number
  camadas: LayerContribution[]
  camadas_ausentes: string[]
}

export interface PowerProfile {
  estrutural: { score: number | null; peso: number }
  meta: { score: number | null; peso: number }
  classificacao: 'estrutural' | 'meta' | 'equilibrado' | 'indeterminado'
}

export interface SkillExpression {
  ceiling_label: 'Baixo' | 'Médio' | 'Alto'
  floor_label: 'Baixo' | 'Médio' | 'Alto'
  amostra_insuficiente: boolean
}

export interface ChampionScoreRow {
  champion_id: string
  lane: string
  patch: string
  elo_tier: string
  n_matches: number
  win_rate: number | null
  pick_rate: number | null
  ban_rate: number | null
  score_final: number
  score_tier: string
  confianca: number
  tier_provisorio: boolean
  trap_flag: boolean
  performance_score: number
  kit_score: number | null
  build_score: number
  meta_score: number
  explicacao: ScoreExplanation
  perfil_poder: PowerProfile
  skill_expression: SkillExpression | null
}

export async function fetchAvailablePatches(eloTier: string): Promise<string[]> {
  const params = new URLSearchParams({ elo_tier: eloTier })
  const response = await fetch(`${API_URL}/scores/patches?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar patches: ${response.status}`)
  }
  return response.json()
}

export interface ChampionScoreFilters {
  eloTier: string
  lane?: string
  patch?: string
}

export async function fetchChampionScores(filters: ChampionScoreFilters): Promise<ChampionScoreRow[]> {
  const params = new URLSearchParams({ elo_tier: filters.eloTier })
  if (filters.lane) params.set('lane', filters.lane)
  if (filters.patch) params.set('patch', filters.patch)

  const response = await fetch(`${API_URL}/scores/champions?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar scores: ${response.status}`)
  }
  return response.json()
}

export interface PlayerScoreSummary {
  patch: string
  score_final: number
  score_tier: string
  tier_provisorio: boolean
}

export interface PlayerChampionSummary {
  champion_id: string
  lane: string
  partidas: number
  vitorias: number
  kda_medio: number
  score_atual: PlayerScoreSummary | null
}

export interface PlayerLookupResult {
  puuid: string
  game_name: string
  tag_line: string
  elo_tier_comparado: string
  partidas_analisadas: number
  campeoes: PlayerChampionSummary[]
}

export interface PlayerLookupFilters {
  region: string
  gameName: string
  tagLine: string
  eloTier?: string
}

export interface RankingRow {
  tier: string
  region: string
  rank_position: number
  puuid: string
  game_name: string | null
  tag_line: string | null
  summoner_level: number | null
  profile_icon_id: number | null
  league_points: number
  wins: number
  losses: number
}

export interface RankingFilters {
  queue?: string
  tier?: string
  region?: string
}

export async function fetchRankings(filters: RankingFilters): Promise<RankingRow[]> {
  const params = new URLSearchParams()
  if (filters.queue) params.set('queue', filters.queue)
  if (filters.tier) params.set('tier', filters.tier)
  if (filters.region) params.set('region', filters.region)

  const response = await fetch(`${API_URL}/rankings?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar ranking: ${response.status}`)
  }
  return response.json()
}

export function profileIconUrl(ddragonPatch: string, profileIconId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/profileicon/${profileIconId}.png`
}

export interface PatchDeltaRow {
  champion_id: string
  lane: string
  score_anterior: number
  score_atual: number
  delta: number
  tier_anterior: string
  tier_atual: string
}

export interface PatchNotesResult {
  patch_atual: string | null
  patch_anterior: string | null
  altas: PatchDeltaRow[]
  quedas: PatchDeltaRow[]
  mudancas_tier: PatchDeltaRow[]
  comparados: number
}

export async function fetchPatchNotes(eloTier: string): Promise<PatchNotesResult> {
  const params = new URLSearchParams({ elo_tier: eloTier })
  const response = await fetch(`${API_URL}/patch-notes?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar patch notes: ${response.status}`)
  }
  return response.json()
}

export interface PatchChangeRow {
  champion_id: string
  category: 'stat' | 'spell' | 'passive'
  spell_key: string | null
  spell_name: string | null
  field_label: string
  before_value: string
  after_value: string
}

export interface PatchChangesResult {
  patch_atual: string | null
  patch_anterior: string | null
  mudancas: PatchChangeRow[]
}

export async function fetchPatchChanges(): Promise<PatchChangesResult> {
  const response = await fetch(`${API_URL}/patch-notes/changes`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar mudanças do patch: ${response.status}`)
  }
  return response.json()
}

export interface MatchupRow {
  opponent_champion_id: string
  games: number
  wins: number
  win_rate: number
  amostra_insuficiente: boolean
}

export interface MatchupsResult {
  patch: string | null
  confrontos: MatchupRow[]
}

export interface MatchupFilters {
  championId: string
  lane: string
  eloTier: string
  patch?: string
}

export async function fetchMatchups(filters: MatchupFilters): Promise<MatchupsResult> {
  const params = new URLSearchParams({
    champion_id: filters.championId,
    lane: filters.lane,
    elo_tier: filters.eloTier,
  })
  if (filters.patch) params.set('patch', filters.patch)

  const response = await fetch(`${API_URL}/matchups?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar matchups: ${response.status}`)
  }
  return response.json()
}

export interface ItemMeta {
  name: string
  image: { full: string }
}

export interface ItemsResponse {
  patch: string
  items: Record<string, ItemMeta>
}

export async function fetchItems(): Promise<ItemsResponse> {
  const response = await fetch(`${API_URL}/items`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar itens: ${response.status}`)
  }
  return response.json()
}

export interface RuneMeta {
  id: number
  name: string
  icon: string
}

export interface RuneTree {
  id: number
  name: string
  icon: string
  slots: { runes: RuneMeta[] }[]
}

export interface RunesResponse {
  patch: string
  paths: RuneTree[]
}

export async function fetchRunes(): Promise<RunesResponse> {
  const response = await fetch(`${API_URL}/runes`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar runas: ${response.status}`)
  }
  return response.json()
}

export function itemImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/item/${imageFile}`
}

export function runeIconUrl(icon: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`
}

export interface BuildRecommendation {
  patch: string
  item_build: number[]
  item_build_games: number
  item_build_win_rate: number
  keystone_id: number | null
  primary_style_id: number | null
  sub_style_id: number | null
  rune_games: number
  rune_win_rate: number
  amostra_insuficiente: boolean
}

export interface BuildRecommendationFilters {
  championId: string
  lane: string
  eloTier: string
  patch?: string
}

export async function fetchBuildRecommendation(
  filters: BuildRecommendationFilters,
): Promise<BuildRecommendation | null> {
  const params = new URLSearchParams({
    champion_id: filters.championId,
    lane: filters.lane,
    elo_tier: filters.eloTier,
  })
  if (filters.patch) params.set('patch', filters.patch)

  const response = await fetch(`${API_URL}/builds/recommended?${params}`)
  if (!response.ok) {
    throw new Error(`Falha ao buscar build recomendado: ${response.status}`)
  }
  return response.json()
}

export async function fetchPlayerLookup(filters: PlayerLookupFilters): Promise<PlayerLookupResult> {
  const params = new URLSearchParams({
    region: filters.region,
    game_name: filters.gameName,
    tag_line: filters.tagLine,
  })
  if (filters.eloTier) params.set('elo_tier', filters.eloTier)

  const response = await fetch(`${API_URL}/player/lookup?${params}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new HttpError(response.status, body?.detail ?? `Falha ao buscar jogador: ${response.status}`)
  }
  return response.json()
}
