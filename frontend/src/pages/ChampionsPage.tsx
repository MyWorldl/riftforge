import { Fragment, useEffect, useState } from 'react'
import {
  championImageUrl,
  fetchAvailablePatches,
  fetchChampionExplanation,
  fetchChampionScores,
  fetchChampions,
  fetchItems,
  fetchRunes,
  type ChampionExplanation,
  type ChampionMeta,
  type ChampionScoreRow,
  type ItemMeta,
  type PowerProfile,
  type RuneTree,
  type ScoreExplanation,
} from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { CHAMPIONS_COUNTRY_OPTIONS } from '../constants/regions'
import BuildRecommendationPanel from '../BuildRecommendationPanel'
import HistoryChart from '../HistoryChart'
import MatchupPanel from '../MatchupPanel'
import roleIconAll from '../assets/roles/all.png'
import roleIconTop from '../assets/roles/top.png'
import roleIconJungle from '../assets/roles/jungle.png'
import roleIconMiddle from '../assets/roles/middle.png'
import roleIconBottom from '../assets/roles/bottom.png'
import roleIconUtility from '../assets/roles/utility.png'
import tierIconIron from '../assets/tiers/iron.png'
import tierIconBronze from '../assets/tiers/bronze.png'
import tierIconSilver from '../assets/tiers/silver.png'
import tierIconGold from '../assets/tiers/gold.png'
import tierIconPlatinum from '../assets/tiers/platinum.png'
import tierIconEmerald from '../assets/tiers/emerald.png'
import tierIconDiamond from '../assets/tiers/diamond.png'
import tierIconMaster from '../assets/tiers/master.png'
import tierIconGrandmaster from '../assets/tiers/grandmaster.png'
import tierIconChallenger from '../assets/tiers/challenger.png'

function formatPct(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

/** Só `br1` é funcional hoje (ver comentário em `CHAMPIONS_COUNTRY_OPTIONS`
 *  em `constants/regions.ts`) — os demais ficam visíveis no dropdown mas
 *  desabilitados. */
const COUNTRY_SELECT_OPTIONS = CHAMPIONS_COUNTRY_OPTIONS.map((c) => ({
  ...c,
  disabled: c.value !== 'br1',
}))

type ExpandedPanel = { key: string; type: 'explain' | 'history' | 'matchups' | 'build' } | null

const TIER_ICONS: Record<string, string> = {
  IRON: tierIconIron,
  BRONZE: tierIconBronze,
  SILVER: tierIconSilver,
  GOLD: tierIconGold,
  PLATINUM: tierIconPlatinum,
  EMERALD: tierIconEmerald,
  DIAMOND: tierIconDiamond,
  MASTER: tierIconMaster,
  GRANDMASTER: tierIconGrandmaster,
  CHALLENGER: tierIconChallenger,
}

const ELO_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]

const TIER_SELECT_OPTIONS = ELO_TIERS.map((t) => ({ value: t, label: t, flag: TIER_ICONS[t] }))

const LANES = [
  { value: '', label: 'Todas as rotas' },
  { value: 'TOP', label: 'Topo' },
  { value: 'JUNGLE', label: 'Selva' },
  { value: 'MIDDLE', label: 'Meio' },
  { value: 'BOTTOM', label: 'Atirador' },
  { value: 'UTILITY', label: 'Suporte' },
]

const LANE_LABELS: Record<string, string> = Object.fromEntries(
  LANES.filter((l) => l.value).map((l) => [l.value, l.label]),
)

/** Ícones oficiais de posição da Riot (position-select do client),
 *  servidos pelo CommunityDragon — mesma categoria de asset que o Data
 *  Dragon já usado pro resto do site, só que o Data Dragon não tem esse
 *  conjunto. `UNKNOWN` (partidas sem rota detectada) não tem ícone. */
const LANE_ICONS: Partial<Record<string, string>> = {
  '': roleIconAll,
  TOP: roleIconTop,
  JUNGLE: roleIconJungle,
  MIDDLE: roleIconMiddle,
  BOTTOM: roleIconBottom,
  UTILITY: roleIconUtility,
}

function LaneCell({ lane }: { lane: string }) {
  const icon = LANE_ICONS[lane]
  return (
    <div className="lane-cell">
      {icon && <img src={icon} alt="" width={18} height={18} />}
      <span>{LANE_LABELS[lane] ?? lane}</span>
    </div>
  )
}

function rowKey(row: ChampionScoreRow): string {
  return `${row.champion_id}-${row.lane}-${row.patch}`
}

function matchesNameSearch(
  row: ChampionScoreRow,
  search: string,
  championsMeta: Record<string, ChampionMeta> | null,
): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  const name = championsMeta?.[row.champion_id]?.name ?? row.champion_id
  return name.toLowerCase().includes(needle) || row.champion_id.toLowerCase().includes(needle)
}

type SortKey = 'score' | 'win_rate' | 'pick_rate' | 'ban_rate'

/** Item 5.1 (revisão técnica): ordenação por coluna client-side — a lista
 *  inteira já vem carregada de uma vez (nunca paginada, ver Lote B da
 *  revisão), então não há motivo pra ida ao backend só pra reordenar. */
function sortScores(rows: ChampionScoreRow[], sortKey: SortKey, sortDir: 'asc' | 'desc'): ChampionScoreRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  const valueOf = (row: ChampionScoreRow): number => {
    switch (sortKey) {
      case 'win_rate':
        return row.win_rate ?? -1
      case 'pick_rate':
        return row.pick_rate ?? -1
      case 'ban_rate':
        return row.ban_rate ?? -1
      default:
        return row.score_final
    }
  }
  return [...rows].sort((a, b) => (valueOf(a) - valueOf(b)) * dir)
}

function SortableHeader({
  label,
  sortKeyFor,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string
  sortKeyFor: SortKey
  currentKey: SortKey
  currentDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
}) {
  const active = currentKey === sortKeyFor
  return (
    <th className="sortable-th" onClick={() => onSort(sortKeyFor)}>
      {label}
      <span className={`sort-caret ${active ? 'sort-caret-active' : ''}`}>
        {active ? (currentDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  )
}

/** Item 5.1 — barra de 4 segmentos reaproveitando os scores de camada já
 *  presentes em `ChampionScoreRow` (`performance_score`/`kit_score`/
 *  `build_score`/`meta_score`), sem nenhuma chamada extra ao backend —
 *  a explicação completa (`ScoreExplanationPanel`) continua sob demanda,
 *  isto aqui é só um resumo visual de "de onde vem o score" na própria
 *  linha. Contribuição = nota da camada × peso do modelo (mesmos pesos de
 *  `compute_scores.py`), não a nota bruta — senão uma camada de peso baixo
 *  com nota alta pareceria mais importante do que realmente é. */
const LAYER_WEIGHTS: Record<string, number> = { performance: 0.4, kit: 0.25, build: 0.25, meta: 0.1 }

function LayerContributionBar({ row }: { row: ChampionScoreRow }) {
  const layers = (
    [
      ['performance', row.performance_score],
      ['kit', row.kit_score],
      ['build', row.build_score],
      ['meta', row.meta_score],
    ] as [string, number | null][]
  )
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, score]) => ({ key, contribuicao: score * LAYER_WEIGHTS[key] }))

  const total = layers.reduce((sum, l) => sum + l.contribuicao, 0) || 1
  const hint = layers
    .map((l) => `${LAYER_LABELS[l.key] ?? l.key}: ${((l.contribuicao / total) * 100).toFixed(0)}%`)
    .join(' · ')

  return (
    <div className="mini-contribution-bar" title={hint}>
      {layers.map((l) => (
        <span
          key={l.key}
          className={`mini-contribution-seg mini-contribution-${l.key}`}
          style={{ width: `${(l.contribuicao / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

const LAYER_LABELS: Record<string, string> = {
  performance: 'Performance',
  kit: 'Kit',
  build: 'Build',
  meta: 'Meta',
}

const LAYER_HINTS: Record<string, string> = {
  performance: 'Win rate ajustado, presença (pick/ban) e KDA',
  kit: 'Poder intrínseco do kit do campeão',
  build: 'Flexibilidade de build, dependência do item certo e power spike',
  meta: 'Saúde do metagame da rota e tendência entre patches',
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}

const POWER_LABELS: Record<PowerProfile['classificacao'], string> = {
  estrutural: 'Estrutural',
  meta: 'Depende do meta',
  equilibrado: 'Equilibrado',
  indeterminado: '—',
}

const POWER_HINTS: Record<PowerProfile['classificacao'], string> = {
  estrutural: 'Poder vem majoritariamente do próprio campeão (Kit+Build) — deve se manter em patches futuros',
  meta: 'Poder vem majoritariamente do patch atual (Performance+Meta) — pode cair quando o meta mudar',
  equilibrado: 'Poder próprio e favorecimento do patch atual pesam de forma parecida',
  indeterminado: 'Sem dado suficiente pra classificar',
}

function PowerProfileBadge({ perfil }: { perfil: PowerProfile }) {
  return (
    <span
      className={`power-badge power-${perfil.classificacao}`}
      title={POWER_HINTS[perfil.classificacao]}
    >
      {POWER_LABELS[perfil.classificacao]}
    </span>
  )
}

/** Ícones das ações da linha — texto ("Por quê?"/"Histórico") ocupava
 *  espaço demais quando somado às outras 8 colunas. `currentColor` puxa a
 *  cor do botão, então hover/estado ativo funcionam sem CSS extra. */
function IconInfo() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.8" r="0.9" fill="currentColor" />
      <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 13V9M6.4 13V5M10.7 13V7.5M15 13V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconSwords() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 2l5 5M14 2 9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 14l5-5M14 14 9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
    </svg>
  )
}

function IconBuild() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  )
}

/** Frase em linguagem natural — o ponto do item 3.1 é o usuário entender
 *  sem precisar ler a tabela de números. */
function explanationHeadline(explanation: ScoreExplanation): string {
  const layers = explanation.camadas
  if (layers.length === 0) return 'Sem camadas disponíveis para explicar este score.'

  const top = layers[0]
  const bottom = layers[layers.length - 1]
  const label = (c: typeof top) => LAYER_LABELS[c.camada] ?? c.camada

  if (top.contribuicao <= 0) {
    return `Nenhuma camada puxou para cima — ${label(bottom)} é o que mais segura o score.`
  }
  if (bottom.contribuicao >= 0) {
    return `Todas as camadas puxam para cima — ${label(top)} é a que mais contribui.`
  }
  return `${label(top)} puxa para cima; ${label(bottom)} é o que mais segura.`
}

/** Item 4.3 (revisão técnica): busca a explicação sob demanda em vez de ler
 *  de `row.explicacao`/`row.perfil_poder` (removidos de `ChampionScoreRow`)
 *  — mesmo padrão lazy-fetch já usado por `MatchupPanel`/
 *  `BuildRecommendationPanel`. */
function ScoreExplanationPanel({ row }: { row: ChampionScoreRow }) {
  const [data, setData] = useState<ChampionExplanation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    fetchChampionExplanation({
      championId: row.champion_id,
      lane: row.lane,
      eloTier: row.elo_tier,
      patch: row.patch,
    })
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [row.champion_id, row.lane, row.elo_tier, row.patch])

  if (error) return <p className="error">Não foi possível carregar a explicação: {error}</p>
  if (!data) return <p className="filters-loading">Buscando explicação...</p>

  const { explicacao } = data
  const layers = explicacao.camadas
  const maxAbs = Math.max(...layers.map((c) => Math.abs(c.contribuicao)), 0.01)

  return (
    <div className="explain">
      <p className="explain-headline">{explanationHeadline(explicacao)}</p>
      <p className="explain-sample">
        Amostra: {row.n_matches} {row.n_matches === 1 ? 'partida' : 'partidas'} ({row.confianca.toFixed(1)}% de confiança)
      </p>

      <div className="explain-rows">
        <div className="explain-row explain-base">
          <span className="explain-label">Base neutra</span>
          <span className="explain-bar-cell" />
          <span className="explain-value">{explicacao.base.toFixed(1)}</span>
        </div>

        {layers.map((c) => {
          const positive = c.contribuicao >= 0
          const width = `${(Math.abs(c.contribuicao) / maxAbs) * 100}%`
          return (
            <div className="explain-row" key={c.camada}>
              <span className="explain-label" title={LAYER_HINTS[c.camada]}>
                {LAYER_LABELS[c.camada] ?? c.camada}
                <span className="explain-sub">
                  nota {c.score.toFixed(1)} · peso {(c.peso * 100).toFixed(0)}%
                </span>
              </span>
              <span className="explain-bar-cell">
                <span className="explain-bar-half explain-bar-neg">
                  {!positive && <span className="explain-bar bar-neg" style={{ width }} />}
                </span>
                <span className="explain-bar-half explain-bar-pos">
                  {positive && <span className="explain-bar bar-pos" style={{ width }} />}
                </span>
              </span>
              <span className={`explain-value ${positive ? 'value-pos' : 'value-neg'}`}>
                {signed(c.contribuicao)}
              </span>
            </div>
          )
        })}

        <div className="explain-row explain-total">
          <span className="explain-label">Score final</span>
          <span className="explain-bar-cell" />
          <span className="explain-value">{row.score_final.toFixed(1)}</span>
        </div>
      </div>

      {explicacao.camadas_ausentes.length > 0 && (
        <p className="explain-missing">
          Sem dado de{' '}
          {explicacao.camadas_ausentes.map((c) => LAYER_LABELS[c] ?? c).join(', ')} para este patch — o
          peso foi redistribuído entre as camadas acima, não contado como zero.
        </p>
      )}

      <PowerProfileDetail perfil={data.perfil_poder} />
      <SkillExpressionBadges skill={row.skill_expression} />
    </div>
  )
}

/** Item 3.3 — heurística v1 baseada na variação de KDA por partida
 *  (não é métrica oficial da Riot, ver `compute_skill_expression.py`). */
function SkillExpressionBadges({ skill }: { skill: ChampionScoreRow['skill_expression'] }) {
  if (!skill) return null
  const hint =
    'Aproximação baseada na variação do KDA entre as partidas do campeão, não uma métrica oficial da Riot.'
  return (
    <div className="skill-expression-row" title={hint}>
      <span className="skill-expression-label">Skill Expression:</span>
      <span className={`skill-badge skill-level-${skill.ceiling_label}`}>Ceiling: {skill.ceiling_label}</span>
      <span className={`skill-badge skill-level-${skill.floor_label}`}>Floor: {skill.floor_label}</span>
      {skill.amostra_insuficiente && <span className="explain-sub">(amostra pequena)</span>}
    </div>
  )
}

/** Item 3.2, versão detalhada: duas barras lado a lado (Kit+Build vs.
 *  Performance+Meta) com os pesos reais usados naquela linha. */
function PowerProfileDetail({ perfil }: { perfil: PowerProfile }) {
  const { estrutural, meta, classificacao } = perfil
  if (estrutural.score === null || meta.score === null) return null

  const maxScore = Math.max(estrutural.score, meta.score, 1)

  return (
    <div className="power-detail">
      <span className="power-detail-title">
        Perfil de poder: <PowerProfileBadge perfil={perfil} />
      </span>
      <div className="power-detail-bars">
        <div className="power-detail-row">
          <span className="power-detail-label">Estrutural (Kit+Build)</span>
          <span className="power-detail-bar-cell">
            <span
              className="power-detail-bar bar-estrutural"
              style={{ width: `${(estrutural.score / maxScore) * 100}%` }}
            />
          </span>
          <span className="power-detail-value">
            {estrutural.score.toFixed(1)} <span className="explain-sub">({(estrutural.peso * 100).toFixed(0)}%)</span>
          </span>
        </div>
        <div className="power-detail-row">
          <span className="power-detail-label">Meta (Performance+Meta)</span>
          <span className="power-detail-bar-cell">
            <span
              className="power-detail-bar bar-meta"
              style={{ width: `${(meta.score / maxScore) * 100}%` }}
            />
          </span>
          <span className="power-detail-value">
            {meta.score.toFixed(1)} <span className="explain-sub">({(meta.peso * 100).toFixed(0)}%)</span>
          </span>
        </div>
      </div>
      {classificacao === 'meta' && (
        <p className="explain-missing">Cuidado ao projetar esse campeão pro próximo patch — boa parte do score de hoje vem do momento atual, não de característica própria.</p>
      )}
    </div>
  )
}

/** Item 5.1 — comparador lado a lado: até 3 campeões selecionados via
 *  checkbox na tabela, mesmos dados que já vêm em `ChampionScoreRow`
 *  (sem fetch extra). */
function ComparatorPanel({
  rows,
  championsMeta,
  ddragonPatch,
  onRemove,
  onClear,
}: {
  rows: ChampionScoreRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  onRemove: (key: string) => void
  onClear: () => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="comparator-panel">
      <div className="comparator-header">
        <span>Comparando {rows.length} {rows.length === 1 ? 'campeão' : 'campeões'}</span>
        <button type="button" className="comparator-clear" onClick={onClear}>Limpar</button>
      </div>
      <div className="comparator-grid">
        {rows.map((row) => {
          const meta = championsMeta?.[row.champion_id]
          return (
            <div className="comparator-card" key={rowKey(row)}>
              <div className="comparator-card-header">
                {meta && ddragonPatch && (
                  <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={28} height={28} />
                )}
                <span>{meta?.name ?? row.champion_id}</span>
                <button
                  type="button"
                  className="comparator-remove"
                  onClick={() => onRemove(rowKey(row))}
                  aria-label="Remover da comparação"
                >
                  ×
                </button>
              </div>
              <div className="comparator-stat">
                <span>Score</span>
                <strong>
                  {row.score_final.toFixed(1)}{' '}
                  <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                </strong>
              </div>
              <div className="comparator-stat">
                <span>Performance</span>
                <strong>{row.performance_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Kit</span>
                <strong>{row.kit_score !== null ? row.kit_score.toFixed(1) : '—'}</strong>
              </div>
              <div className="comparator-stat">
                <span>Build</span>
                <strong>{row.build_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Meta</span>
                <strong>{row.meta_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Vitória</span>
                <strong>{formatPct(row.win_rate)}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChampionsPage() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)
  const [itemsMeta, setItemsMeta] = useState<Record<string, ItemMeta> | null>(null)
  const [runeTrees, setRuneTrees] = useState<RuneTree[] | null>(null)

  const [eloTier, setEloTier] = useState('GOLD')
  const [lane, setLane] = useState('')
  const [patch, setPatch] = useState('') // '' = mais recente
  const [country, setCountry] = useState('br1')

  const [availablePatches, setAvailablePatches] = useState<string[]>([])

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [compareKeys, setCompareKeys] = useState<string[]>([])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function toggleCompare(key: string) {
    setCompareKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 3) return prev
      return [...prev, key]
    })
  }

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch((err: Error) => setMetaError(err.message))
    // Itens/runas só alimentam o painel de "Build" — carregados uma vez
    // aqui (não a cada linha expandida) e passados como prop.
    fetchItems()
      .then((data) => setItemsMeta(data.items))
      .catch(() => {})
    fetchRunes()
      .then((data) => setRuneTrees(data.paths))
      .catch(() => {})
  }, [])

  // Patches disponíveis dependem do elo (nem todo patch tem dado
  // calculado pra todo elo) — refaz a lista sempre que o elo muda, e
  // some com a seleção atual se ela não existir mais nesse elo, em vez
  // de deixar o filtro preso num valor que não bate com nada.
  useEffect(() => {
    fetchAvailablePatches(eloTier)
      .then((patches) => {
        setAvailablePatches(patches)
        setPatch((current) => (current && patches.includes(current) ? current : ''))
      })
      .catch(() => setAvailablePatches([]))
  }, [eloTier])

  // Filtros aplicam na hora, sem botão "Aplicar" — um seletor não
  // precisa de confirmação extra, e remove qualquer risco de o botão
  // ficar mal posicionado se a tabela apertar o layout.
  useEffect(() => {
    // Item 1.3 (revisão técnica): sem AbortController, trocar os filtros
    // rapidamente (ex: GOLD → PLATINUM → DIAMOND) podia deixar a tabela
    // mostrando dados de um filtro anterior se a resposta dele chegasse
    // depois da mais recente — silencioso e difícil de reproduzir.
    const controller = new AbortController()
    setExpandedPanel(null)
    setCompareKeys([])
    setLoading(true)
    setScoresError(null)
    fetchChampionScores({ eloTier, lane: lane || undefined, patch: patch || undefined }, controller.signal)
      .then((data) => setScores(data))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setScoresError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [eloTier, lane, patch])

  const filteredScores = scores ? scores.filter((row) => matchesNameSearch(row, search, championsMeta)) : null
  const displayedScores = filteredScores ? sortScores(filteredScores, sortKey, sortDir) : null

  const scoreByKey = new Map((scores ?? []).map((row) => [rowKey(row), row]))
  const compareRows = compareKeys.map((key) => scoreByKey.get(key)).filter((r): r is ChampionScoreRow => !!r)

  return (
    <main className="center">
      <h1>Campeões</h1>
      <p>Poder dos campeões de League of Legends por elo, rota e patch — score em camadas com tier God-E.</p>

      <div className="filters">
        <label>
          Região
          <FlagSelect options={COUNTRY_SELECT_OPTIONS} value={country} onChange={setCountry} />
        </label>

        <label>
          Tier
          <FlagSelect options={TIER_SELECT_OPTIONS} value={eloTier} onChange={setEloTier} iconShape="contain" />
        </label>

        <label>
          Patch
          <select value={patch} onChange={(e) => setPatch(e.target.value)}>
            <option value="">Mais recente</option>
            {availablePatches.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label>
          Campeão
          <input
            type="text"
            placeholder="Buscar por nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {loading && <span className="filters-loading">Buscando...</span>}
      </div>

      <ComparatorPanel
        rows={compareRows}
        championsMeta={championsMeta}
        ddragonPatch={ddragonPatch}
        onRemove={(key) => setCompareKeys((prev) => prev.filter((k) => k !== key))}
        onClear={() => setCompareKeys([])}
      />

      <div className="role-filter">
        {LANES.map((l) => (
          <button
            key={l.value}
            type="button"
            className={`role-filter-btn ${lane === l.value ? 'role-filter-btn-active' : ''}`}
            onClick={() => setLane(l.value)}
            title={l.label}
          >
            <img src={LANE_ICONS[l.value]} alt={l.label} width={18} height={18} />
          </button>
        ))}
      </div>

      {metaError && <p className="error">Não foi possível carregar dados do Data Dragon: {metaError}</p>}
      {scoresError && <p className="error">Backend indisponível: {scoresError}</p>}

      {!scoresError && scores && scores.length === 0 && (
        <p className="empty-state">
          Sem score calculado para esse filtro ainda. Rode o pipeline completo
          (<code>ingest_matches</code> → <code>aggregate_stats</code> → <code>compute_baselines</code> →{' '}
          <code>compute_performance</code> → <code>compute_build</code> → <code>compute_meta</code> →{' '}
          <code>compute_scores</code>) para o elo {eloTier}.
        </p>
      )}

      {!scoresError && scores && scores.length > 0 && displayedScores && displayedScores.length === 0 && (
        <p className="empty-state">Nenhum campeão encontrado com esse nome.</p>
      )}

      {displayedScores && displayedScores.length > 0 && (
        <>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th title="Selecionar para comparar (até 3)"></th>
              <th>#</th>
              <th>Campeão</th>
              <SortableHeader label="Tier" sortKeyFor="score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th title="Contribuição de cada camada no score (Performance/Kit/Build/Meta)">Composição</th>
              {!lane && <th>Função</th>}
              <SortableHeader label="Taxa de Vitória" sortKeyFor="win_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Taxa de escolha" sortKeyFor="pick_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Taxa de banimento" sortKeyFor="ban_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayedScores.map((row, index) => {
              const meta = championsMeta?.[row.champion_id]
              const key = rowKey(row)
              const activePanel = expandedPanel?.key === key ? expandedPanel.type : null
              const toggle = (type: 'explain' | 'history' | 'matchups' | 'build') =>
                setExpandedPanel(activePanel === type ? null : { key, type })
              const isComparing = compareKeys.includes(key)
              const colSpan = lane ? 9 : 10
              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        checked={isComparing}
                        onChange={() => toggleCompare(key)}
                        disabled={!isComparing && compareKeys.length >= 3}
                        aria-label={`Comparar ${meta?.name ?? row.champion_id}`}
                      />
                    </td>
                    <td>{index + 1}</td>
                    <td>
                      <div className="champion-cell">
                        {meta && ddragonPatch && (
                          <img
                            src={championImageUrl(ddragonPatch, meta.image.full)}
                            alt=""
                            width={32}
                            height={32}
                          />
                        )}
                        <span>{meta?.name ?? row.champion_id}</span>
                        {row.trap_flag && <span className="trap-badge" title="Alta presença (pick/ban) com win rate abaixo do esperado">Trap</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                      {row.tier_provisorio && <span className="provisional-mark" title="Amostra pequena — tier provisório, teto em A">*</span>}
                    </td>
                    <td><LayerContributionBar row={row} /></td>
                    {!lane && <td><LaneCell lane={row.lane} /></td>}
                    <td>{formatPct(row.win_rate)}</td>
                    <td>{formatPct(row.pick_rate)}</td>
                    <td>{formatPct(row.ban_rate)}</td>
                    <td>
                      <div className="actions-cell">
                        <button
                          type="button"
                          className={`icon-toggle ${activePanel === 'explain' ? 'icon-toggle-active' : ''}`}
                          onClick={() => toggle('explain')}
                          title={activePanel === 'explain' ? 'Ocultar explicação' : 'Por que esse tier?'}
                          aria-label="Explicação do score"
                        >
                          <IconInfo />
                        </button>
                        <button
                          type="button"
                          className={`icon-toggle ${activePanel === 'history' ? 'icon-toggle-active' : ''}`}
                          onClick={() => toggle('history')}
                          title={activePanel === 'history' ? 'Ocultar histórico' : 'Ver histórico entre patches'}
                          aria-label="Histórico entre patches"
                        >
                          <IconChart />
                        </button>
                        <button
                          type="button"
                          className={`icon-toggle ${activePanel === 'matchups' ? 'icon-toggle-active' : ''}`}
                          onClick={() => toggle('matchups')}
                          title={activePanel === 'matchups' ? 'Ocultar matchups' : 'Ver matchups na rota'}
                          aria-label="Matchups na rota"
                        >
                          <IconSwords />
                        </button>
                        <button
                          type="button"
                          className={`icon-toggle ${activePanel === 'build' ? 'icon-toggle-active' : ''}`}
                          onClick={() => toggle('build')}
                          title={activePanel === 'build' ? 'Ocultar build recomendado' : 'Ver build recomendado'}
                          aria-label="Build recomendado"
                        >
                          <IconBuild />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {activePanel === 'explain' && (
                    <tr className="layer-row">
                      <td colSpan={colSpan}>
                        <ScoreExplanationPanel row={row} />
                      </td>
                    </tr>
                  )}
                  {activePanel === 'history' && (
                    <tr className="layer-row">
                      <td colSpan={colSpan}>
                        <HistoryChart
                          championId={row.champion_id}
                          championName={meta?.name ?? row.champion_id}
                          eloTier={row.elo_tier}
                          lane={row.lane}
                        />
                      </td>
                    </tr>
                  )}
                  {activePanel === 'matchups' && (
                    <tr className="layer-row">
                      <td colSpan={colSpan}>
                        <MatchupPanel
                          championId={row.champion_id}
                          lane={row.lane}
                          eloTier={row.elo_tier}
                          patch={row.patch}
                          championsMeta={championsMeta}
                          ddragonPatch={ddragonPatch}
                        />
                      </td>
                    </tr>
                  )}
                  {activePanel === 'build' && (
                    <tr className="layer-row">
                      <td colSpan={colSpan}>
                        <BuildRecommendationPanel
                          championId={row.champion_id}
                          lane={row.lane}
                          eloTier={row.elo_tier}
                          patch={row.patch}
                          itemsMeta={itemsMeta}
                          ddragonPatch={ddragonPatch}
                          runeTrees={runeTrees}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
        </>
      )}

      {scores && scores.length > 0 && (
        <p className="table-footnote">* tier provisório: amostra ainda abaixo do piso de confiança, travado no máximo em A.</p>
      )}
    </main>
  )
}

export default ChampionsPage
