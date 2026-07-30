import { Fragment, useEffect, useState, type FormEvent } from 'react'
import {
  championImageUrl,
  fetchChampionScores,
  fetchChampions,
  type ChampionMeta,
  type ChampionScoreRow,
  type ScoreExplanation,
} from './api/client'
import './App.css'

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
    </div>
  )
}

function App() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)

  const [eloTier, setEloTier] = useState('GOLD')
  const [lane, setLane] = useState('')
  const [patchInput, setPatchInput] = useState('')

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch((err: Error) => setMetaError(err.message))
  }, [])

  const loadScores = (filters: { eloTier: string; lane: string; patch: string }) => {
    setLoading(true)
    setScoresError(null)
    fetchChampionScores({
      eloTier: filters.eloTier,
      lane: filters.lane || undefined,
      patch: filters.patch || undefined,
    })
      .then((data) => setScores([...data].sort((a, b) => b.score_final - a.score_final)))
      .catch((err: Error) => setScoresError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadScores({ eloTier, lane, patch: patchInput })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setExpandedRow(null)
    loadScores({ eloTier, lane, patch: patchInput })
  }

  return (
    <main id="center">
      <h1>RiftForge</h1>
      <p>Poder dos campeões de League of Legends por elo, rota e patch — score em camadas com tier God-E.</p>

      <form className="filters" onSubmit={handleSubmit}>
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
          <input
            type="text"
            placeholder="mais recente"
            value={patchInput}
            onChange={(e) => setPatchInput(e.target.value)}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Aplicar filtros'}
        </button>
      </form>

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
        <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Campeão</th>
              <th>Rota</th>
              <th>Patch</th>
              <th>Tier</th>
              <th>Score</th>
              <th>Confiança</th>
              <th>Partidas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scores.map((row) => {
              const meta = championsMeta?.[row.champion_id]
              const key = rowKey(row)
              const expanded = expandedRow === key
              return (
                <Fragment key={key}>
                  <tr>
                    <td className="champion-cell">
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
                    </td>
                    <td>{LANE_LABELS[row.lane] ?? row.lane}</td>
                    <td>{row.patch}</td>
                    <td>
                      <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                      {row.tier_provisorio && <span className="provisional-mark" title="Amostra pequena — tier provisório, teto em A">*</span>}
                    </td>
                    <td>{row.score_final.toFixed(1)}</td>
                    <td>{row.confianca.toFixed(1)}%</td>
                    <td>{row.n_matches}</td>
                    <td>
                      <button
                        type="button"
                        className="details-toggle"
                        onClick={() => setExpandedRow(expanded ? null : key)}
                      >
                        {expanded ? 'Ocultar' : 'Por quê?'}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="layer-row">
                      <td colSpan={8}>
                        <ScoreExplanationPanel row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
      )}

      {scores && scores.length > 0 && (
        <p className="table-footnote">* tier provisório: amostra ainda abaixo do piso de confiança, travado no máximo em A.</p>
      )}
    </main>
  )
}

export default App
