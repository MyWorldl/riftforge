import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  championImageUrl,
  fetchAvailablePatches,
  fetchChampionScores,
  fetchChampions,
  fetchCollectionSummary,
  fetchPatchNotes,
  type ChampionMeta,
  type ChampionScoreRow,
  type CollectionSummaryRow,
  type PatchDeltaRow,
  type PatchNotesResult,
} from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { PositionDeltaBadge } from '../components/positionDelta'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFilterParam } from '../hooks/useFilterParam'
import { CHAMPIONS_COUNTRY_OPTIONS, CHAMPIONS_ENABLED_REGIONS } from '../constants/regions'
import { TIER_ICONS } from '../constants/tiers'
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

/** `br1` + `euw1` são funcionais hoje (ver `CHAMPIONS_ENABLED_REGIONS` em
 *  `constants/regions.ts`) — os demais ficam visíveis no dropdown mas
 *  desabilitados. */
const COUNTRY_SELECT_OPTIONS = CHAMPIONS_COUNTRY_OPTIONS.map((c) => ({
  ...c,
  disabled: !CHAMPIONS_ENABLED_REGIONS.includes(c.value),
}))

const ELO_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]

/** Item novo (revisão técnica §6, Tier 3; auditoria 16/08 §3.2): o CI só
 *  coleta partidas nos elos abaixo (`collect-matches.yml`) — os outros
 *  sempre caem no estado vazio. Ouro era o único até 16/08; Platina
 *  entra como o segundo balde real (não os 5 do blueprint externo — o
 *  volume do projeto ainda não sustenta isso, ver nota em
 *  `collect-matches.yml`). Mesmo tratamento que `COUNTRY_SELECT_OPTIONS`
 *  já dá pra região: desabilita no dropdown em vez de deixar escolher e
 *  mostrar uma mensagem de operador ("rode o pipeline..."). */
const ENABLED_ELO_TIERS = ['GOLD', 'PLATINUM']

const TIER_SELECT_OPTIONS = ELO_TIERS.map((t) => ({
  value: t,
  label: t,
  flag: TIER_ICONS[t],
  disabled: !ENABLED_ELO_TIERS.includes(t),
}))

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

/** Item novo: o nome do campeão abre a página de detalhe própria
 *  (`ChampionDetailPage.tsx` — Matchups/Build/Comparar). Explicação e
 *  Histórico ficaram só na lista, expandindo inline na própria linha
 *  (ver `ExpandedPanel` abaixo) — pedido explícito do usuário depois de
 *  ver a página de detalhe pronta. Usa os valores da própria linha (elo/
 *  rota/patch), não o filtro da página, porque com "Todas as rotas"
 *  selecionado cada linha pode ter uma rota diferente. */
function detailHref(row: ChampionScoreRow): string {
  const params = new URLSearchParams({
    eloTier: row.elo_tier,
    lane: row.lane,
    patch: row.patch,
    region: row.region,
  })
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

const COLLECTION_SAMPLE_TIERS = ['GOLD', 'PLATINUM']
const COLLECTION_REGION_LABELS: Record<string, string> = { br1: 'BR1', euw1: 'EUW1' }

/** Ajuste 21/08: pedido do usuário — mostrar a quantidade de partidas
 *  coletadas, não só dizer "tem coleta". Soma Ouro+Platina por região a
 *  partir de `/stats/collection-summary`; enquanto a resposta não chega
 *  (ou falha), cai pro texto qualitativo antigo em vez de mostrar "0". */
function buildCollectionCaption(summary: CollectionSummaryRow[] | null): string {
  if (!summary) return 'Amostra: Ouro e Platina (BR1, EUW1) — outros elos ainda não têm coleta.'

  const totalsByRegion = new Map<string, number>()
  for (const row of summary) {
    if (!COLLECTION_SAMPLE_TIERS.includes(row.tier)) continue
    totalsByRegion.set(row.region, (totalsByRegion.get(row.region) ?? 0) + row.total_matches)
  }

  const parts = Object.entries(COLLECTION_REGION_LABELS)
    .map(([region, label]) => {
      const total = totalsByRegion.get(region)
      return total ? `${label}: ${total.toLocaleString('pt-BR')} partidas` : null
    })
    .filter((part): part is string => !!part)

  if (parts.length === 0) return 'Amostra: Ouro e Platina (BR1, EUW1) — outros elos ainda não têm coleta.'

  return `Amostra: Ouro e Platina (${parts.join(' · ')}) — outros elos ainda não têm coleta.`
}

/** Pedido do usuário (segunda rodada): não é troca de tier, é a mesma
 *  coisa que `DeltaPositionBadge` de `RankingsPage.tsx` mostra pra
 *  jogador — posição no ranking por score. Calculada pelo backend
 *  (`patch_diff.py::_rank_by_lane`) só dentro da própria rota, por isso
 *  a coluna inteira some quando "Todas as rotas" está selecionado (ver
 *  `!lane` no cabeçalho/célula abaixo) — misturar posição de rotas
 *  diferentes não compara a mesma coisa.
 *
 *  Ajuste 21/08: pedido do usuário — a posição não é mais fixa em score,
 *  reflete a métrica que a tabela está ordenando no momento (`sortKey`),
 *  ver `deltaPosicaoFor`/`SORT_KEY_LABELS` abaixo. `posicao === null`
 *  (métrica ausente num dos dois patches) trata igual a "sem variação",
 *  mesmo tratamento visual de 0.
 *
 *  Ajuste 21/08 (2ª rodada): a lógica já era "quantas posições o
 *  campeão subiu/desceu", mas o número sozinho (ex: "▲ 63") ficava
 *  ambíguo perto da coluna "Score" — parecia pontuação, não posição no
 *  ranking.
 *
 *  Ajuste 21/08 (5ª rodada): pedido do usuário (mockup próprio) — a
 *  Variação sai de coluna própria e vira parte da célula "Posição"
 *  (número + selo lado a lado), então o sufixo "pos." da rodada
 *  anterior não faz mais falta (a posição ao lado já deixa óbvio o que
 *  é). "=" no lugar de "—" pra "sem mudança", mesmo símbolo do
 *  mockup.
 *
 *  Ajuste 22/08: o selo em si (`PositionDeltaBadge`) virou componente
 *  compartilhado (`components/positionDelta.tsx`) pra Classificações
 *  reaproveitar a mesma lógica, ver comentário lá. */

export type SortKey = 'score' | 'win_rate' | 'pick_rate' | 'ban_rate'

const SORT_KEY_LABELS: Record<SortKey, string> = {
  score: 'Pontuação',
  win_rate: 'Win Rate',
  pick_rate: 'Pick Rate',
  ban_rate: 'Ban Rate',
}

function deltaPosicaoFor(delta: PatchDeltaRow | undefined, sortKey: SortKey): number | null | undefined {
  if (!delta) return undefined
  switch (sortKey) {
    case 'win_rate':
      return delta.delta_posicao_win_rate
    case 'pick_rate':
      return delta.delta_posicao_pick_rate
    case 'ban_rate':
      return delta.delta_posicao_ban_rate
    default:
      return delta.delta_posicao
  }
}

/** Item 5.1 (revisão técnica): ordenação por coluna client-side — a lista
 *  inteira já vem carregada de uma vez (nunca paginada, ver Lote B da
 *  revisão), então não há motivo pra ida ao backend só pra reordenar.
 *  Exportada (Sprint 2 item 17) só pra ser testável por `sortScores.test.ts`
 *  — continua sendo usada internamente do mesmo jeito. */
export function sortScores(rows: ChampionScoreRow[], sortKey: SortKey, sortDir: 'asc' | 'desc'): ChampionScoreRow[] {
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
  className,
}: {
  label: string
  sortKeyFor: SortKey
  currentKey: SortKey
  currentDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = currentKey === sortKeyFor
  return (
    <th className={`sortable-th ${className ?? ''}`} onClick={() => onSort(sortKeyFor)}>
      {label}
      <span className={`sort-caret ${active ? 'sort-caret-active' : ''}`}>
        {active ? (currentDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  )
}

function ChampionsPage() {
  useDocumentTitle('Campeões — RiftForge')

  const [collectionSummary, setCollectionSummary] = useState<CollectionSummaryRow[] | null>(null)
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)

  // Item 18 (revisão técnica, Sprint 4): filtro fica na URL, não em
  // `useState` solto — link compartilhável, sobrevive a recarregar a
  // página, e o botão voltar do navegador desfaz uma troca de filtro.
  // Mesmo mecanismo que já trazia o estado de volta da página de detalhe
  // (`detailHref`/`backHref` em `ChampionDetailPage.tsx`), agora fonte
  // única em vez de só leitura inicial.
  const [eloTier, setEloTier] = useFilterParam('eloTier', 'GOLD')
  const [lane, setLane] = useFilterParam('lane', '')
  const [patch, setPatch] = useFilterParam('patch', '') // '' = mais recente
  const [country, setCountry] = useFilterParam('region', 'br1')
  const [search, setSearch] = useFilterParam('search', '')

  const [availablePatches, setAvailablePatches] = useState<string[]>([])

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  // Ajuste 21/08: mostrar a quantidade de partidas coletadas de verdade,
  // não só dizer "tem coleta" — total independe do filtro da página
  // (soma histórica de todos os patches), então busca uma vez só.
  useEffect(() => {
    fetchCollectionSummary()
      .then(setCollectionSummary)
      .catch(() => setCollectionSummary(null))
  }, [])

  // Patches disponíveis dependem do elo (nem todo patch tem dado
  // calculado pra todo elo) — refaz a lista sempre que o elo muda, e
  // some com a seleção atual se ela não existir mais nesse elo, em vez
  // de deixar o filtro preso num valor que não bate com nada.
  useEffect(() => {
    fetchAvailablePatches(eloTier, country)
      .then((patches) => {
        setAvailablePatches(patches)
        if (patch && !patches.includes(patch)) setPatch('')
      })
      .catch(() => setAvailablePatches([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eloTier, country])

  // Item novo: "Variação" — mesmo diff que já alimenta Patch Notes,
  // buscado à parte porque `/patch-notes` compara sempre os 2 patches
  // mais recentes do elo, independente do filtro de patch específico
  // desta página (ver `buildDeltaIndex`/`VariationBadge`).
  useEffect(() => {
    fetchPatchNotes(eloTier, undefined, country)
      .then(setPatchNotes)
      .catch(() => setPatchNotes(null))
  }, [eloTier, country])

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
    fetchChampionScores(
      { eloTier, lane: lane || undefined, patch: patch || undefined, region: country },
      controller.signal,
    )
      .then((data) => setScores(data))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setScoresError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [eloTier, lane, patch, country])

  const filteredScores = scores
    ? scores.filter((row) => matchesNameSearch(row, search, championsMeta))
    : null
  const displayedScores = filteredScores ? sortScores(filteredScores, sortKey, sortDir) : null

  const scoreByKey = new Map((scores ?? []).map((row) => [rowKey(row), row]))
  const compareRows = compareKeys.map((key) => scoreByKey.get(key)).filter((r): r is ChampionScoreRow => !!r)

  const deltaIndex = buildDeltaIndex(patchNotes)

  const collectionCaption = buildCollectionCaption(collectionSummary)

  return (
    <main className="center center-wide">
      <h1>Campeões</h1>
      <p>Poder dos campeões de League of Legends por elo, rota e patch — score em camadas com tier God-E.</p>
      {/* Pedido da auditoria de 16/08 (§3.2): enquanto a coleta não cobrir
          todo elo, a UI deveria dizer isso — sem esse aviso, o filtro de
          elo existe sem dado atrás dele pra quase toda opção. Ajuste
          21/08: mostrar a quantidade real coletada, não só o texto. */}
      <p className="table-caption">{collectionCaption}</p>

      <div className="filters">
        <label>
          Região
          <FlagSelect options={COUNTRY_SELECT_OPTIONS} value={country} onChange={setCountry} />
        </label>

        <label className="filters-champion-search">
          Campeão
          <input
            type="text"
            placeholder="Buscar por nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
            aria-pressed={lane === l.value}
          >
            <img src={LANE_ICONS[l.value]} alt={l.label} width={18} height={18} />
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
              <th
                title={
                  lane
                    ? `Posição no placar, com a variação de quantas posições o campeão subiu ou desceu no ranking por ${SORT_KEY_LABELS[sortKey]} dentro da rota, comparado ao patch anterior`
                    : undefined
                }
              >
                Posição
              </th>
              <th>Campeão</th>
              <SortableHeader label="Tier" sortKeyFor="score" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              {!lane && <th className="col-hide-tablet">Função</th>}
              <th title="Contribuição de cada camada no score (Performance/Kit/Build/Meta)">Pontuação</th>
              <SortableHeader label="Taxa de Vitória" sortKeyFor="win_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Taxa de escolha" sortKeyFor="pick_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="col-hide-tablet" />
              <SortableHeader label="Taxa de banimento" sortKeyFor="ban_rate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} className="col-hide-tablet" />
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
              const colSpan = lane ? 9 : 11
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
                  <td>
                    <span className="posicao-cell">
                      {index + 1}
                      {lane && <PositionDeltaBadge posicao={deltaPosicaoFor(delta, sortKey)} />}
                    </span>
                  </td>
                  <td>
                    <Link to={detailHref(row)} className="champion-cell">
                      {meta && ddragonPatch && (
                        <img
                          src={championImageUrl(ddragonPatch, meta.image.full)}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                        />
                      )}
                      <span>{meta?.name ?? row.champion_id}</span>
                      {row.trap_flag && <span className="trap-badge" title="Alta presença (pick/ban) com win rate abaixo do esperado, ou win rate aparentemente forte com amostra pequena demais pra confiar">Trap</span>}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`tier-badge tier-${row.score_tier}`}
                      title={row.tier_provisorio ? 'Amostra pequena — tier provisório, teto em A' : undefined}
                    >
                      {row.score_tier}
                    </span>
                  </td>
                  {!lane && <td className="col-hide-tablet"><LaneCell lane={row.lane} /></td>}
                  <td><LayerContributionBar row={row} /></td>
                  <td>{formatPct(row.win_rate)}</td>
                  <td className="col-hide-tablet">{formatPct(row.pick_rate)}</td>
                  <td className="col-hide-tablet">{formatPct(row.ban_rate)}</td>
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
