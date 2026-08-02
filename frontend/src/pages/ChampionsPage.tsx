import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  championImageUrl,
  fetchAvailablePatches,
  fetchChampionScores,
  fetchChampions,
  type ChampionMeta,
  type ChampionScoreRow,
} from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { CHAMPIONS_COUNTRY_OPTIONS } from '../constants/regions'
import {
  IconBuild,
  IconChart,
  IconInfo,
  IconSwords,
  LaneCell,
  LayerContributionBar,
  formatPct,
} from '../components/championDisplay'
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

/** Só `br1` é funcional hoje (ver comentário em `CHAMPIONS_COUNTRY_OPTIONS`
 *  em `constants/regions.ts`) — os demais ficam visíveis no dropdown mas
 *  desabilitados. */
const COUNTRY_SELECT_OPTIONS = CHAMPIONS_COUNTRY_OPTIONS.map((c) => ({
  ...c,
  disabled: c.value !== 'br1',
}))

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

/** Ícones oficiais de posição da Riot (position-select do client),
 *  servidos pelo CommunityDragon — mesma categoria de asset que o Data
 *  Dragon já usado pro resto do site, só que o Data Dragon não tem esse
 *  conjunto. Usado só pelos botões de filtro aqui — `LaneCell` (a versão
 *  usada na própria linha da tabela e na página de detalhe) mora em
 *  `components/championDisplay.tsx`. */
const LANE_ICONS: Partial<Record<string, string>> = {
  '': roleIconAll,
  TOP: roleIconTop,
  JUNGLE: roleIconJungle,
  MIDDLE: roleIconMiddle,
  BOTTOM: roleIconBottom,
  UTILITY: roleIconUtility,
}

function rowKey(row: ChampionScoreRow): string {
  return `${row.champion_id}-${row.lane}-${row.patch}`
}

/** Item novo: cada linha agora abre uma página de detalhe própria em vez
 *  de expandir inline (ver `ChampionDetailPage.tsx`) — usa os valores da
 *  própria linha (elo/rota/patch), não o filtro da página, porque com
 *  "Todas as rotas" selecionado cada linha pode ter uma rota diferente. */
function detailHref(row: ChampionScoreRow, tab: 'explain' | 'history' | 'matchups' | 'build'): string {
  const params = new URLSearchParams({ eloTier: row.elo_tier, lane: row.lane, patch: row.patch, tab })
  return `/campeoes/${row.champion_id}?${params}`
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

/** Item 5.1 — comparador lado a lado: até 3 campeões selecionados via
 *  checkbox na tabela, mesmos dados que já vêm em `ChampionScoreRow`
 *  (sem fetch extra). Continua na lista de propósito (não virou aba da
 *  página de detalhe) — é inerentemente multi-campeão. */
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
  const [searchParams] = useSearchParams()

  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)

  // Estado inicial lido da URL — volta da página de detalhe (ver
  // `detailHref`/`backHref` em `ChampionDetailPage.tsx`) restaura o
  // filtro em vez de resetar sempre pra GOLD/todas as rotas.
  const [eloTier, setEloTier] = useState(() => searchParams.get('eloTier') || 'GOLD')
  const [lane, setLane] = useState(() => searchParams.get('lane') || '')
  const [patch, setPatch] = useState(() => searchParams.get('patch') || '') // '' = mais recente
  const [country, setCountry] = useState('br1')

  const [availablePatches, setAvailablePatches] = useState<string[]>([])

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    <main className="center center-wide">
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
              const isComparing = compareKeys.includes(key)
              return (
                <tr key={key}>
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
                    <Link to={detailHref(row, 'explain')} className="champion-cell">
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
                    </Link>
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
                      <Link
                        className="icon-toggle"
                        to={detailHref(row, 'explain')}
                        title="Por que esse tier?"
                        aria-label="Explicação do score"
                      >
                        <IconInfo />
                      </Link>
                      <Link
                        className="icon-toggle"
                        to={detailHref(row, 'history')}
                        title="Ver histórico entre patches"
                        aria-label="Histórico entre patches"
                      >
                        <IconChart />
                      </Link>
                      <Link
                        className="icon-toggle"
                        to={detailHref(row, 'matchups')}
                        title="Ver matchups na rota"
                        aria-label="Matchups na rota"
                      >
                        <IconSwords />
                      </Link>
                      <Link
                        className="icon-toggle"
                        to={detailHref(row, 'build')}
                        title="Ver build recomendado"
                        aria-label="Build recomendado"
                      >
                        <IconBuild />
                      </Link>
                    </div>
                  </td>
                </tr>
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
