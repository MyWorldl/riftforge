import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  championImageUrl,
  fetchAvailablePatches,
  fetchChampionScores,
  fetchChampions,
  fetchPatchNotes,
  type ChampionMeta,
  type ChampionScoreRow,
  type PatchDeltaRow,
  type PatchNotesResult,
} from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { CHAMPIONS_COUNTRY_OPTIONS } from '../constants/regions'
import HistoryChart from '../HistoryChart'
import {
  ComparatorPanel,
  IconChart,
  IconInfo,
  LaneCell,
  LayerContributionBar,
  ScoreExplanationPanel,
  formatPct,
  matchesNameSearch,
  rowKey,
} from '../components/championDisplay'
import roleIconAll from '../assets/roles/all.png'
import roleIconTop from '../assets/roles/top.png'
import roleIconJungle from '../assets/roles/jungle.png'
import roleIconMiddle from '../assets/roles/middle.png'
import roleIconBottom from '../assets/roles/bottom.png'
import roleIconUtility from '../assets/roles/utility.png'

/** Só `br1` é funcional hoje (ver comentário em `CHAMPIONS_COUNTRY_OPTIONS`
 *  em `constants/regions.ts`) — os demais ficam visíveis no dropdown mas
 *  desabilitados. */
const COUNTRY_SELECT_OPTIONS = CHAMPIONS_COUNTRY_OPTIONS.map((c) => ({
  ...c,
  disabled: c.value !== 'br1',
}))

/** Item novo (revisão técnica §7.6): esses 10 PNGs (~95KB) só aparecem se
 *  o usuário abrir o dropdown de Tier — antes vinham como `import`
 *  (bundlados no chunk JS inicial via Vite), agora ficam em
 *  `public/tiers/` e são carregados só quando o `<img>` realmente
 *  renderiza, por caminho de string comum. */
const TIER_ICONS: Record<string, string> = {
  IRON: '/tiers/iron.png',
  BRONZE: '/tiers/bronze.png',
  SILVER: '/tiers/silver.png',
  GOLD: '/tiers/gold.png',
  PLATINUM: '/tiers/platinum.png',
  EMERALD: '/tiers/emerald.png',
  DIAMOND: '/tiers/diamond.png',
  MASTER: '/tiers/master.png',
  GRANDMASTER: '/tiers/grandmaster.png',
  CHALLENGER: '/tiers/challenger.png',
}

const ELO_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]

/** Item novo (revisão técnica §6, Tier 3): hoje o CI só coleta partidas em
 *  GOLD (`collect-matches.yml`) — os outros elos sempre caem no estado
 *  vazio. Mesmo tratamento que `COUNTRY_SELECT_OPTIONS` já dá pra região:
 *  desabilita no dropdown em vez de deixar escolher e mostrar uma
 *  mensagem de operador ("rode o pipeline..."). */
const TIER_SELECT_OPTIONS = ELO_TIERS.map((t) => ({
  value: t,
  label: t,
  flag: TIER_ICONS[t],
  disabled: t !== 'GOLD',
}))

const LANES = [
  { value: '', label: 'Todas as rotas' },
  { value: 'TOP', label: 'Topo' },
  { value: 'JUNGLE', label: 'Selva' },
  { value: 'MIDDLE', label: 'Meio' },
  { value: 'BOTTOM', label: 'Atirador' },
  { value: 'UTILITY', label: 'Suporte' },
]

/** Item novo (revisão técnica §6, Tier 1): `ChampionMeta.tags` já vem do
 *  Data Dragon (`client.ts`) e nunca foi usado na UI. Classes fixas do
 *  próprio Data Dragon (não mudam por patch) — filtra client-side sobre
 *  `championsMeta`, mesmo padrão de `matchesNameSearch`. */
const CHAMPION_CLASSES = [
  { value: '', label: 'Todas as classes' },
  { value: 'Fighter', label: 'Lutador' },
  { value: 'Tank', label: 'Tanque' },
  { value: 'Mage', label: 'Mago' },
  { value: 'Assassin', label: 'Assassino' },
  { value: 'Marksman', label: 'Atirador' },
  { value: 'Support', label: 'Suporte' },
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

/** Item novo: o nome do campeão abre a página de detalhe própria
 *  (`ChampionDetailPage.tsx` — Matchups/Build/Comparar). Explicação e
 *  Histórico ficaram só na lista, expandindo inline na própria linha
 *  (ver `ExpandedPanel` abaixo) — pedido explícito do usuário depois de
 *  ver a página de detalhe pronta. Usa os valores da própria linha (elo/
 *  rota/patch), não o filtro da página, porque com "Todas as rotas"
 *  selecionado cada linha pode ter uma rota diferente. */
function detailHref(row: ChampionScoreRow): string {
  const params = new URLSearchParams({ eloTier: row.elo_tier, lane: row.lane, patch: row.patch })
  return `/campeoes/${row.champion_id}?${params}`
}

type ExpandedPanel = { key: string; type: 'explain' | 'history' } | null

/** Item novo: "Variação" na lista de Campeões — reaproveita o mesmo diff
 *  que já alimenta `/patch-notes` (Data Dragon§, `patch_diff.py`), em vez
 *  de recalcular algo novo. Só compara os 2 patches mais recentes do
 *  elo — por isso o índice é aplicado somente quando a linha exibida É
 *  esse patch mais recente (`patch_atual`), nunca num patch histórico
 *  filtrado manualmente. */
function buildDeltaIndex(patchNotes: PatchNotesResult | null): Map<string, PatchDeltaRow> {
  const index = new Map<string, PatchDeltaRow>()
  if (!patchNotes) return index
  for (const row of [...patchNotes.altas, ...patchNotes.quedas, ...patchNotes.mudancas_tier]) {
    index.set(`${row.champion_id}-${row.lane}`, row)
  }
  return index
}

function VariationBadge({ delta }: { delta: PatchDeltaRow | undefined }) {
  if (!delta) return <span className="delta-position delta-position-none">—</span>
  const up = delta.delta >= 0
  const hint =
    delta.tier_anterior === delta.tier_atual
      ? undefined
      : `Tier: ${delta.tier_anterior} → ${delta.tier_atual}`
  return (
    <span className={`delta-position ${up ? 'delta-position-up' : 'delta-position-down'}`} title={hint}>
      {up ? '▲' : '▼'} {Math.abs(delta.delta).toFixed(1)}
    </span>
  )
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

function ChampionsPage() {
  useDocumentTitle('Campeões — RiftForge')
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
  const [classFilter, setClassFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [compareKeys, setCompareKeys] = useState<string[]>([])

  const [patchNotes, setPatchNotes] = useState<PatchNotesResult | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)

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

  // Item novo: "Variação" — mesmo diff que já alimenta Patch Notes,
  // buscado à parte porque `/patch-notes` compara sempre os 2 patches
  // mais recentes do elo, independente do filtro de patch específico
  // desta página (ver `buildDeltaIndex`/`VariationBadge`).
  useEffect(() => {
    fetchPatchNotes(eloTier)
      .then(setPatchNotes)
      .catch(() => setPatchNotes(null))
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
    setExpandedPanel(null)
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

  const filteredScores = scores
    ? scores
        .filter((row) => matchesNameSearch(row, search, championsMeta))
        .filter((row) => !classFilter || championsMeta?.[row.champion_id]?.tags.includes(classFilter))
    : null
  const displayedScores = filteredScores ? sortScores(filteredScores, sortKey, sortDir) : null

  const scoreByKey = new Map((scores ?? []).map((row) => [rowKey(row), row]))
  const compareRows = compareKeys.map((key) => scoreByKey.get(key)).filter((r): r is ChampionScoreRow => !!r)

  const deltaIndex = buildDeltaIndex(patchNotes)

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

        {loading && <span className="filters-loading" role="status">Buscando...</span>}
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

      <div className="role-filter">
        {CHAMPION_CLASSES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`role-filter-btn ${classFilter === c.value ? 'role-filter-btn-active' : ''}`}
            onClick={() => setClassFilter(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {metaError && <p className="error" role="alert">Não foi possível carregar dados do Data Dragon: {metaError}</p>}
      {scoresError && <p className="error" role="alert">Backend indisponível: {scoresError}</p>}

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
              <th title="Diferença de score em relação ao patch anterior">Variação</th>
              <th title="Contribuição de cada camada no score (Performance/Kit/Build/Meta)">Score</th>
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
              const delta =
                row.patch === patchNotes?.patch_atual
                  ? deltaIndex.get(`${row.champion_id}-${row.lane}`)
                  : undefined
              const activePanel = expandedPanel?.key === key ? expandedPanel.type : null
              const toggle = (type: 'explain' | 'history') =>
                setExpandedPanel(activePanel === type ? null : { key, type })
              const colSpan = lane ? 10 : 11
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
                    <Link to={detailHref(row)} className="champion-cell">
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
                  <td><VariationBadge delta={delta} /></td>
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
