import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  championImageUrl,
  fetchChampionScores,
  fetchChampions,
  fetchItems,
  fetchRunes,
  type ChampionMeta,
  type ChampionScoreRow,
  type ItemMeta,
  type RuneTree,
} from '../api/client'
import BuildRecommendationPanel from '../BuildRecommendationPanel'
import HistoryChart from '../HistoryChart'
import MatchupPanel from '../MatchupPanel'
import {
  IconBuild,
  IconChart,
  IconInfo,
  IconSwords,
  LaneCell,
  LayerContributionBar,
  ScoreExplanationPanel,
  formatPct,
} from '../components/championDisplay'

type TabKey = 'explain' | 'history' | 'matchups' | 'build'

const TAB_ORDER: TabKey[] = ['explain', 'history', 'matchups', 'build']

const TAB_LABELS: Record<TabKey, string> = {
  explain: 'Por que esse tier?',
  history: 'Histórico entre patches',
  matchups: 'Matchups na rota',
  build: 'Build recomendado',
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
  }
}

/** Item novo: página de detalhe por campeão (pedido do usuário depois que
 *  Composição + Ações não cabiam mais direito na linha da tabela).
 *  Explicação/Histórico/Matchups/Build viram abas de uma página própria em
 *  vez de expandir dentro da linha em `ChampionsPage.tsx` — mesmos
 *  componentes de antes (`ScoreExplanationPanel`/`HistoryChart`/
 *  `MatchupPanel`/`BuildRecommendationPanel`), só trocando onde moram.
 *  O comparador continua na lista de propósito — é uma feature de
 *  múltiplos campeões, não encaixa como aba de um campeão só. */
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
          <div className="champion-detail-header">
            {meta && ddragonPatch && (
              <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={56} height={56} />
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
                <span className="explain-sub">
                  {row.patch} · {eloTier}
                </span>
              </div>
            </div>
          </div>

          <div className="champion-detail-stats">
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
          </div>
        </>
      )}
    </main>
  )
}

export default ChampionDetailPage
