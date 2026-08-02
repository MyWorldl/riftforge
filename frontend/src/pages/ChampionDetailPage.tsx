import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  championImageUrl,
  fetchChampionAbilities,
  fetchChampionScores,
  fetchChampions,
  fetchItems,
  fetchRunes,
  passiveImageUrl,
  spellImageUrl,
  type ChampionDetail,
  type ChampionMeta,
  type ChampionScoreRow,
  type ItemMeta,
  type RuneTree,
} from '../api/client'
import BuildRecommendationPanel from '../BuildRecommendationPanel'
import HistoryChart from '../HistoryChart'
import MatchupPanel from '../MatchupPanel'
import {
  ComparatorPanel,
  IconBuild,
  IconChart,
  IconInfo,
  IconSwords,
  LaneCell,
  LayerContributionBar,
  ScoreExplanationPanel,
  formatPct,
  matchesNameSearch,
  rowKey,
} from '../components/championDisplay'

type TabKey = 'explain' | 'history' | 'matchups' | 'build' | 'compare'

const TAB_ORDER: TabKey[] = ['explain', 'history', 'matchups', 'build', 'compare']

const TAB_LABELS: Record<TabKey, string> = {
  explain: 'Por que esse tier?',
  history: 'Histórico entre patches',
  matchups: 'Matchups na rota',
  build: 'Build recomendado',
  compare: 'Comparar',
}

function IconCompare() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M5.5 2v12M10.5 2v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 5.5h5M8 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function TabIcon({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'explain':
      return <IconInfo />
    case 'history':
      return <IconChart />
    case 'matchups':
      return <IconSwords />
    case 'build':
      return <IconBuild />
    case 'compare':
      return <IconCompare />
  }
}

/** Abaixo do nome do campeão, estilo OP.GG: passiva + Q/W/E/R. Busca sob
 *  demanda (item novo, `GET /champions/{id}`) — o resumo que alimenta o
 *  resto do site (`fetchChampions`) não traz habilidade nenhuma. */
function AbilityRow({ ddragonPatch, detail }: { ddragonPatch: string; detail: ChampionDetail | null }) {
  if (!detail || !ddragonPatch) return null
  const spellKeys = ['Q', 'W', 'E', 'R']
  return (
    <div className="champion-detail-abilities">
      <img
        src={passiveImageUrl(ddragonPatch, detail.passive.image.full)}
        alt={detail.passive.name}
        title={`Passiva — ${detail.passive.name}`}
        width={32}
        height={32}
        className="ability-icon ability-icon-passive"
      />
      {detail.spells.map((spell, index) => (
        <div className="ability-icon-wrap" key={spellKeys[index] ?? index}>
          <img
            src={spellImageUrl(ddragonPatch, spell.image.full)}
            alt={spell.name}
            title={`${spellKeys[index] ?? ''} — ${spell.name}`}
            width={32}
            height={32}
            className="ability-icon"
          />
          <span className="ability-key">{spellKeys[index]}</span>
        </div>
      ))}
    </div>
  )
}

/** Aba "Comparar" (item novo, pedido do usuário): compara o campeão desta
 *  página contra outros escolhidos aqui — mesmo `ComparatorPanel` da lista
 *  de Campeões, só que a seleção começa com o campeão atual em vez de
 *  vazia. Busca a lista inteira do elo uma vez (mesma chamada que
 *  `ChampionsPage` já faz) pra alimentar a busca de "adicionar campeão". */
function CompareTab({
  row,
  eloTier,
  championsMeta,
  ddragonPatch,
}: {
  row: ChampionScoreRow
  eloTier: string
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const [allRows, setAllRows] = useState<ChampionScoreRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([rowKey(row)])

  useEffect(() => {
    fetchChampionScores({ eloTier })
      .then(setAllRows)
      .catch(() => setAllRows(null))
  }, [eloTier])

  const rowsByKey = new Map((allRows ?? []).map((r) => [rowKey(r), r]))
  const selectedRows = selectedKeys.map((key) => rowsByKey.get(key)).filter((r): r is ChampionScoreRow => !!r)

  const candidates = (allRows ?? [])
    .filter((r) => !selectedKeys.includes(rowKey(r)))
    .filter((r) => matchesNameSearch(r, search, championsMeta))
    .slice(0, 8)

  function addChampion(key: string) {
    setSelectedKeys((prev) => (prev.length >= 3 ? prev : [...prev, key]))
  }

  return (
    <div>
      <ComparatorPanel
        rows={selectedRows}
        championsMeta={championsMeta}
        ddragonPatch={ddragonPatch}
        onRemove={(key) => setSelectedKeys((prev) => prev.filter((k) => k !== key))}
        onClear={() => setSelectedKeys([rowKey(row)])}
      />

      {selectedKeys.length < 3 && (
        <div className="compare-tab-picker">
          <input
            type="text"
            placeholder="Adicionar campeão pra comparar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <ul className="compare-tab-suggestions">
              {candidates.length === 0 && <li className="explain-sub">Nenhum campeão encontrado.</li>}
              {candidates.map((r) => {
                const meta = championsMeta?.[r.champion_id]
                return (
                  <li key={rowKey(r)}>
                    <button
                      type="button"
                      onClick={() => {
                        addChampion(rowKey(r))
                        setSearch('')
                      }}
                    >
                      {meta && ddragonPatch && (
                        <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={22} height={22} />
                      )}
                      <span>{meta?.name ?? r.champion_id}</span>
                      <span className="explain-sub">{r.lane}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** Item novo: página de detalhe por campeão (pedido do usuário depois que
 *  Composição + Ações não cabiam mais direito na linha da tabela).
 *  Explicação/Histórico/Matchups/Build/Comparar viram abas de uma página
 *  própria em vez de expandir dentro da linha em `ChampionsPage.tsx` —
 *  mesmos componentes de antes (`ScoreExplanationPanel`/`HistoryChart`/
 *  `MatchupPanel`/`BuildRecommendationPanel`/`ComparatorPanel`), só
 *  trocando onde moram. O comparador da lista continua existindo em
 *  paralelo — os dois pontos de entrada usam o mesmo componente. */
function ChampionDetailPage() {
  const { championId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const eloTier = searchParams.get('eloTier') || 'GOLD'
  const lane = searchParams.get('lane') || ''
  const patch = searchParams.get('patch') || ''
  const tabParam = searchParams.get('tab') as TabKey | null

  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam && TAB_ORDER.includes(tabParam) ? tabParam : 'explain',
  )

  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')
  const [itemsMeta, setItemsMeta] = useState<Record<string, ItemMeta> | null>(null)
  const [runeTrees, setRuneTrees] = useState<RuneTree[] | null>(null)
  const [abilities, setAbilities] = useState<ChampionDetail | null>(null)

  const [row, setRow] = useState<ChampionScoreRow | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
    // Só alimentam a aba de Build — carregados uma vez, não a cada troca de aba.
    fetchItems()
      .then((data) => setItemsMeta(data.items))
      .catch(() => {})
    fetchRunes()
      .then((data) => setRuneTrees(data.paths))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setAbilities(null)
    fetchChampionAbilities(championId)
      .then((data) => setAbilities(data.champion))
      .catch(() => setAbilities(null))
  }, [championId])

  useEffect(() => {
    // Sem endpoint dedicado a "score de um campeão só" — reaproveita
    // /scores/champions (mesma chamada que a lista já faz) e filtra a
    // linha certa no cliente, em vez de criar uma rota nova só pra isso.
    setRow(undefined)
    setError(null)
    fetchChampionScores({ eloTier, lane: lane || undefined, patch: patch || undefined })
      .then((rows) => {
        const found = rows.find((r) => r.champion_id === championId && (!lane || r.lane === lane))
        setRow(found ?? null)
      })
      .catch((err: Error) => setError(err.message))
  }, [championId, eloTier, lane, patch])

  const backParams = new URLSearchParams()
  backParams.set('eloTier', eloTier)
  if (lane) backParams.set('lane', lane)
  if (patch) backParams.set('patch', patch)
  const backHref = `/campeoes?${backParams}`

  const meta = championsMeta?.[championId]

  return (
    <main className="center center-wide">
      <Link to={backHref} className="back-link">← Voltar pra Campeões</Link>

      {error && <p className="error">Backend indisponível: {error}</p>}
      {row === undefined && !error && <p className="filters-loading">Carregando...</p>}
      {row === null && !error && (
        <p className="empty-state">Sem score calculado pra esse campeão nesse filtro.</p>
      )}

      {row && (
        <>
          {/* Cabeçalho estilo OP.GG: retrato + nome + habilidades à
              esquerda, taxas + composição à direita. */}
          <div className="champion-detail-header">
            {meta && ddragonPatch && (
              <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={64} height={64} />
            )}
            <div className="champion-detail-title">
              <h1>{meta?.name ?? row.champion_id}</h1>
              <div className="champion-detail-meta">
                <LaneCell lane={row.lane} />
                <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                {row.tier_provisorio && (
                  <span className="provisional-mark" title="Amostra pequena — tier provisório, teto em A">*</span>
                )}
                {row.trap_flag && (
                  <span className="trap-badge" title="Alta presença (pick/ban) com win rate abaixo do esperado">
                    Trap
                  </span>
                )}
              </div>
              <AbilityRow ddragonPatch={ddragonPatch} detail={abilities} />
            </div>

            <div className="champion-detail-side-stats">
              <div className="champion-detail-stat">
                <span>Taxa de Vitória</span>
                <strong>{formatPct(row.win_rate)}</strong>
              </div>
              <div className="champion-detail-stat">
                <span>Taxa de escolha</span>
                <strong>{formatPct(row.pick_rate)}</strong>
              </div>
              <div className="champion-detail-stat">
                <span>Taxa de banimento</span>
                <strong>{formatPct(row.ban_rate)}</strong>
              </div>
              <div className="champion-detail-stat">
                <span>Composição</span>
                <LayerContributionBar row={row} />
              </div>
            </div>
          </div>

          <div className="detail-tabs">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`detail-tab ${activeTab === tab ? 'detail-tab-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                <TabIcon tab={tab} />
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className="detail-tab-panel">
            {activeTab === 'explain' && <ScoreExplanationPanel row={row} />}
            {activeTab === 'history' && (
              <HistoryChart
                championId={row.champion_id}
                championName={meta?.name ?? row.champion_id}
                eloTier={row.elo_tier}
                lane={row.lane}
              />
            )}
            {activeTab === 'matchups' && (
              <MatchupPanel
                championId={row.champion_id}
                lane={row.lane}
                eloTier={row.elo_tier}
                patch={row.patch}
                championsMeta={championsMeta}
                ddragonPatch={ddragonPatch}
              />
            )}
            {activeTab === 'build' && (
              <BuildRecommendationPanel
                championId={row.champion_id}
                lane={row.lane}
                eloTier={row.elo_tier}
                patch={row.patch}
                itemsMeta={itemsMeta}
                ddragonPatch={ddragonPatch}
                runeTrees={runeTrees}
              />
            )}
            {activeTab === 'compare' && (
              <CompareTab key={championId} row={row} eloTier={eloTier} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
            )}
          </div>
        </>
      )}
    </main>
  )
}

export default ChampionDetailPage
