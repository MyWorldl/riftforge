import { Fragment, useEffect, useState } from 'react'
import {
  championImageUrl,
  fetchAvailablePatches,
  fetchChampionScores,
  fetchChampions,
  type ChampionMeta,
  type ChampionScoreRow,
  type PowerProfile,
  type ScoreExplanation,
} from '../api/client'
import HistoryChart from '../HistoryChart'

type ExpandedPanel = { key: string; type: 'explain' | 'history' } | null

const ELO_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]

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

function rowKey(row: ChampionScoreRow): string {
  return `${row.champion_id}-${row.lane}-${row.patch}`
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

// "Depende do meta" (16 caracteres) era o maior fator sozinho empurrando
// a tabela pra fora da largura da tela — a coluna Perfil usa a versão
// curta, o painel expandido (PowerProfileDetail) usa a versão completa.
const POWER_LABELS_COMPACT: Record<PowerProfile['classificacao'], string> = {
  ...POWER_LABELS,
  meta: 'Meta',
}

const POWER_HINTS: Record<PowerProfile['classificacao'], string> = {
  estrutural: 'Poder vem majoritariamente do próprio campeão (Kit+Build) — deve se manter em patches futuros',
  meta: 'Poder vem majoritariamente do patch atual (Performance+Meta) — pode cair quando o meta mudar',
  equilibrado: 'Poder próprio e favorecimento do patch atual pesam de forma parecida',
  indeterminado: 'Sem dado suficiente pra classificar',
}

/** Item 3.2: badge compacto na linha principal, sem precisar expandir.
 *  `compact` usa o rótulo curto — a tabela precisa caber na tela sem
 *  rolar pro lado, o painel expandido tem espaço de sobra pro nome
 *  completo. */
function PowerProfileBadge({ perfil, compact = false }: { perfil: PowerProfile; compact?: boolean }) {
  const labels = compact ? POWER_LABELS_COMPACT : POWER_LABELS
  return (
    <span
      className={`power-badge power-${perfil.classificacao}`}
      title={POWER_HINTS[perfil.classificacao]}
    >
      {labels[perfil.classificacao]}
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

function ScoreExplanationPanel({ row }: { row: ChampionScoreRow }) {
  const { explicacao } = row
  const layers = explicacao.camadas
  const maxAbs = Math.max(...layers.map((c) => Math.abs(c.contribuicao)), 0.01)

  return (
    <div className="explain">
      <p className="explain-headline">{explanationHeadline(explicacao)}</p>

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

      <PowerProfileDetail perfil={row.perfil_poder} />
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

function ChampionsPage() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)

  const [eloTier, setEloTier] = useState('GOLD')
  const [lane, setLane] = useState('')
  const [patch, setPatch] = useState('') // '' = mais recente

  const [availablePatches, setAvailablePatches] = useState<string[]>([])

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)

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
    setExpandedPanel(null)
    setLoading(true)
    setScoresError(null)
    fetchChampionScores({ eloTier, lane: lane || undefined, patch: patch || undefined })
      .then((data) => setScores([...data].sort((a, b) => b.score_final - a.score_final)))
      .catch((err: Error) => setScoresError(err.message))
      .finally(() => setLoading(false))
  }, [eloTier, lane, patch])

  return (
    <main className="center">
      <h1>Campeões</h1>
      <p>Poder dos campeões de League of Legends por elo, rota e patch — score em camadas com tier God-E.</p>

      <div className="filters">
        <label>
          Elo
          <select value={eloTier} onChange={(e) => setEloTier(e.target.value)}>
            {ELO_TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label>
          Rota
          <select value={lane} onChange={(e) => setLane(e.target.value)}>
            {LANES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
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

        {loading && <span className="filters-loading">Buscando...</span>}
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

      {scores && scores.length > 0 && (
        <>
        <p className="table-caption">
          Patch <strong>{scores[0].patch}</strong>{patch === '' && ' (mais recente com dado calculado)'}
          {lane && <> · {LANE_LABELS[lane] ?? lane}</>} · {eloTier}
        </p>
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Campeão</th>
              {!lane && <th>Rota</th>}
              <th>Tier</th>
              <th>Perfil</th>
              <th>Score</th>
              <th>Amostra</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scores.map((row) => {
              const meta = championsMeta?.[row.champion_id]
              const key = rowKey(row)
              const activePanel = expandedPanel?.key === key ? expandedPanel.type : null
              const toggle = (type: 'explain' | 'history') =>
                setExpandedPanel(activePanel === type ? null : { key, type })
              const colSpan = lane ? 6 : 7
              return (
                <Fragment key={key}>
                  <tr>
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
                    {!lane && <td>{LANE_LABELS[row.lane] ?? row.lane}</td>}
                    <td>
                      <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                      {row.tier_provisorio && <span className="provisional-mark" title="Amostra pequena — tier provisório, teto em A">*</span>}
                    </td>
                    <td><PowerProfileBadge perfil={row.perfil_poder} compact /></td>
                    <td>{row.score_final.toFixed(1)}</td>
                    <td>
                      {row.n_matches} <span className="explain-sub">({row.confianca.toFixed(1)}%)</span>
                    </td>
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
