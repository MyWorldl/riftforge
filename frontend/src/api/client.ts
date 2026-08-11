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

const REQUEST_TIMEOUT_MS = 10_000

/** Sprint 2 item 16 (revisão técnica §4.4): wrapper único por trás das 18
 *  funções `fetch*`/`deletePlayerRoadmap` abaixo — sem dependência nova,
 *  mesmo padrão já usado no projeto (zero libs de estado/fetch até aqui).
 *  Resolve duas inconsistências que cresceram função a função:
 *
 *  1. Timeout ausente — uma resposta lenta do backend travava a página
 *     sem feedback nenhum, sem limite. `AbortSignal.timeout` cobre isso
 *     pra toda chamada, não só as que já passavam `signal` manual.
 *  2. Cancelamento inconsistente — só 5 das 18 funções aceitavam um
 *     `signal` externo antes desta mudança (as que já usavam
 *     `AbortController` pra descartar resposta obsoleta ao trocar filtro
 *     rápido). `AbortSignal.any` combina esse `signal` externo (quando
 *     existe) com o timeout interno — funciona pros dois motivos de
 *     cancelamento ao mesmo tempo, sem a página precisar saber disso.
 *
 *  `cacheKey`: opcional, só pros 3 catálogos do Data Dragon sem parâmetro
 *  variável por chamada (`/champions`, `/items`, `/runes`) — resolve
 *  `/champions` sendo rebaixado de novo a cada navegação
 *  Campeões→Detalhe→Campeões. `Map` simples (sem TTL/LRU): mesmo catálogo
 *  vale a sessão de página inteira, e são só 3 chaves possíveis — não
 *  compensa a complexidade de expiração aqui (o backend já tem TTL de 1h
 *  do lado dele, `app/core/cache.py`). Falha não fica cacheada (a promise
 *  rejeitada é removida do cache), pra uma falha transitória não grudar. */
const _getCache = new Map<string, Promise<unknown>>()

interface RequestOptions {
  signal?: AbortSignal
  cacheKey?: string
  method?: string
}

async function request<T>(path: string, errorLabel: string, options: RequestOptions = {}): Promise<T> {
  const { signal, cacheKey, method = 'GET' } = options

  if (cacheKey) {
    const cached = _getCache.get(cacheKey)
    if (cached) return cached as Promise<T>
  }

  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  const promise = (async (): Promise<T> => {
    const response = await fetch(`${API_URL}${path}`, { method, signal: combinedSignal })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new HttpError(response.status, body?.detail ?? `${errorLabel}: ${response.status}`)
    }
    return response.json() as Promise<T>
  })()

  if (cacheKey) {
    _getCache.set(cacheKey, promise)
    promise.catch(() => _getCache.delete(cacheKey))
  }

  return promise
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
  return request('/champions', 'Falha ao buscar campeões', { cacheKey: '/champions' })
}

export interface ChampionAbility {
  image: { full: string }
  name: string
}

export interface ChampionDetail {
  passive: ChampionAbility
  spells: ChampionAbility[]
}

export interface ChampionDetailResponse {
  patch: string
  champion: ChampionDetail
}

/** Item novo: cabeçalho estilo OP.GG na página de detalhe do campeão
 *  (passiva + Q/W/E/R abaixo do nome) — `fetchChampions()` (resumo) não
 *  traz habilidades, só o endpoint por campeão. */
export async function fetchChampionAbilities(championId: string): Promise<ChampionDetailResponse> {
  return request(`/champions/${encodeURIComponent(championId)}`, 'Falha ao buscar habilidades do campeão')
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

  return request(`/stats/champions?${params}`, 'Falha ao buscar estatísticas')
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
  region?: string
}

export async function fetchChampionHistory(filters: ChampionHistoryFilters): Promise<ChampionHistoryPoint[]> {
  const params = new URLSearchParams({ champion_id: filters.championId, elo_tier: filters.eloTier })
  if (filters.lane) params.set('lane', filters.lane)
  if (filters.region) params.set('region', filters.region)

  return request(`/scores/history?${params}`, 'Falha ao buscar histórico')
}

export function championImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/champion/${imageFile}`
}

export function spellImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/spell/${imageFile}`
}

export function passiveImageUrl(ddragonPatch: string, imageFile: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonPatch}/img/passive/${imageFile}`
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
  region: string
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
  skill_expression: SkillExpression | null
}

export interface ChampionExplanation {
  explicacao: ScoreExplanation
  perfil_poder: PowerProfile
}

export interface ChampionExplanationFilters {
  championId: string
  lane: string
  eloTier: string
  patch?: string
  region?: string
}

/** Item 4.3 (revisão técnica): `explicacao`/`perfil_poder` saíram de
 *  `ChampionScoreRow` — pesavam por linha (4 camadas + 2 barras) num
 *  payload de ~300-700 linhas pra uma informação só lida quando o usuário
 *  clica no ícone (ⓘ). Busca sob demanda, mesmo padrão de `fetchMatchups`/
 *  `fetchBuildRecommendation`. */
export async function fetchChampionExplanation(
  filters: ChampionExplanationFilters,
): Promise<ChampionExplanation> {
  const params = new URLSearchParams({ lane: filters.lane, elo_tier: filters.eloTier })
  if (filters.patch) params.set('patch', filters.patch)
  if (filters.region) params.set('region', filters.region)

  return request(
    `/scores/champions/${encodeURIComponent(filters.championId)}/explain?${params}`,
    'Falha ao buscar explicação do score',
  )
}

export async function fetchAvailablePatches(eloTier: string, region?: string): Promise<string[]> {
  const params = new URLSearchParams({ elo_tier: eloTier })
  if (region) params.set('region', region)
  return request(`/scores/patches?${params}`, 'Falha ao buscar patches')
}

export interface ChampionScoreFilters {
  eloTier: string
  lane?: string
  patch?: string
  region?: string
}

export async function fetchChampionScores(
  filters: ChampionScoreFilters,
  signal?: AbortSignal,
): Promise<ChampionScoreRow[]> {
  const params = new URLSearchParams({ elo_tier: filters.eloTier })
  if (filters.lane) params.set('lane', filters.lane)
  if (filters.patch) params.set('patch', filters.patch)
  if (filters.region) params.set('region', filters.region)

  return request(`/scores/champions?${params}`, 'Falha ao buscar scores', { signal })
}

export interface PlayerScoreSummary {
  patch: string
  score_final: number
  score_tier: string
  tier_provisorio: boolean
}

export interface BaselineComparison {
  win_rate_jogador: number
  win_rate_medio_elo: number
  delta_pct: number
}

export interface PlayerChampionSummary {
  champion_id: string
  lane: string
  partidas: number
  vitorias: number
  kda_medio: number
  score_atual: PlayerScoreSummary | null
  comparativo_baseline: BaselineComparison | null
}

export interface PlayerRoadmapStep {
  champion_id: string
  lane: string
  status: string
  delta_pct_inicial: number
  delta_pct_atual: number
  partidas_base: number
  partidas_atual: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface PlayerRoadmapSummary {
  ativos: PlayerRoadmapStep[]
  concluidos: PlayerRoadmapStep[]
  // Revisão técnica 09/08 §2.3: token opaco pro DELETE, não autenticação
  // — null quando o jogador nunca teve um passo.
  roadmap_token: string | null
}

export interface PlayerLookupResult {
  game_name: string
  tag_line: string
  elo_tier_comparado: string
  elo_tier_detectado: boolean
  partidas_analisadas: number
  campeoes: PlayerChampionSummary[]
  roadmap: PlayerRoadmapSummary
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
  game_name: string | null
  tag_line: string | null
  summoner_level: number | null
  profile_icon_id: number | null
  league_points: number
  wins: number
  losses: number
  delta_posicao: number | null
}

export interface RankingFilters {
  queue?: string
  tier?: string
  region?: string
}

export async function fetchRankings(filters: RankingFilters, signal?: AbortSignal): Promise<RankingRow[]> {
  const params = new URLSearchParams()
  if (filters.queue) params.set('queue', filters.queue)
  if (filters.tier) params.set('tier', filters.tier)
  if (filters.region) params.set('region', filters.region)

  return request(`/rankings?${params}`, 'Falha ao buscar ranking', { signal })
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
  posicao_anterior: number
  posicao_atual: number
  delta_posicao: number
}

export interface PatchNotesResult {
  patch_atual: string | null
  patch_anterior: string | null
  altas: PatchDeltaRow[]
  quedas: PatchDeltaRow[]
  mudancas_tier: PatchDeltaRow[]
  comparados: number
}

export async function fetchPatchNotes(
  eloTier: string,
  signal?: AbortSignal,
  region?: string,
): Promise<PatchNotesResult> {
  const params = new URLSearchParams({ elo_tier: eloTier })
  if (region) params.set('region', region)
  return request(`/patch-notes?${params}`, 'Falha ao buscar patch notes', { signal })
}

export interface LaneCoverage {
  lane: string
  cobertura: number
}

export interface MetaCoverageResult {
  patch: string | null
  elo_tier: string
  cobertura: LaneCoverage[]
}

/** Item novo (revisão técnica §6, "contexto por rota"): saúde do metagame
 *  por rota — reaproveita `cobertura`/`nota_cobertura` já calculados por
 *  `compute_meta.py`, nunca expostos antes. */
export async function fetchMetaCoverage(
  eloTier: string,
  signal?: AbortSignal,
  region?: string,
): Promise<MetaCoverageResult> {
  const params = new URLSearchParams({ elo_tier: eloTier })
  if (region) params.set('region', region)
  return request(`/meta/coverage?${params}`, 'Falha ao buscar contexto de meta', { signal })
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

export async function fetchPatchChanges(identity?: {
  gameName: string
  tagLine: string
  region: string
}): Promise<PatchChangesResult> {
  const params = new URLSearchParams()
  if (identity) {
    params.set('game_name', identity.gameName)
    params.set('tag_line', identity.tagLine)
    params.set('region', identity.region)
  }
  const query = params.toString()
  return request(`/patch-notes/changes${query ? `?${query}` : ''}`, 'Falha ao buscar mudanças do patch')
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
  region?: string
}

export async function fetchMatchups(filters: MatchupFilters): Promise<MatchupsResult> {
  const params = new URLSearchParams({
    champion_id: filters.championId,
    lane: filters.lane,
    elo_tier: filters.eloTier,
  })
  if (filters.patch) params.set('patch', filters.patch)
  if (filters.region) params.set('region', filters.region)

  return request(`/matchups?${params}`, 'Falha ao buscar matchups')
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
  return request('/items', 'Falha ao buscar itens', { cacheKey: '/items' })
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
  return request('/runes', 'Falha ao buscar runas', { cacheKey: '/runes' })
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
  region?: string
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
  if (filters.region) params.set('region', filters.region)

  return request(`/builds/recommended?${params}`, 'Falha ao buscar build recomendado')
}

export async function fetchPlayerLookup(filters: PlayerLookupFilters): Promise<PlayerLookupResult> {
  const params = new URLSearchParams({
    region: filters.region,
    game_name: filters.gameName,
    tag_line: filters.tagLine,
  })
  if (filters.eloTier) params.set('elo_tier', filters.eloTier)

  return request(`/player/lookup?${params}`, 'Falha ao buscar jogador')
}

export async function deletePlayerRoadmap(
  filters: PlayerLookupFilters,
  roadmapToken?: string | null,
): Promise<{ deleted: number }> {
  const params = new URLSearchParams({
    region: filters.region,
    game_name: filters.gameName,
    tag_line: filters.tagLine,
  })
  if (roadmapToken) params.set('roadmap_token', roadmapToken)
  return request(`/player/roadmap?${params}`, 'Falha ao apagar roadmap', { method: 'DELETE' })
}

export interface KitProfileRow {
  champion_id: string
  dano_score: number | null
  alcance_score: number | null
  resiliencia_score: number | null
}

export interface KitProfileResult {
  patch: string | null
  perfis: KitProfileRow[]
}

export async function fetchKitProfile(patch?: string, signal?: AbortSignal): Promise<KitProfileResult> {
  const params = new URLSearchParams()
  if (patch) params.set('patch', patch)
  return request(`/scores/kit-profile?${params}`, 'Falha ao buscar perfil de kit', { signal })
}
