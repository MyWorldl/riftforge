import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  deletePlayerRoadmap,
  fetchPlayerLookup,
  HttpError,
  type PlayerLookupResult,
  type PlayerRoadmapStep,
} from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

/** Revisão técnica 09/08 §2.3: token opaco do roadmap fica só no
 *  localStorage do próprio navegador — nunca é enviado a lugar nenhum
 *  além do `DELETE`, e nunca precisa de consentimento de cookie porque
 *  não é rastreamento. */
function roadmapTokenStorageKey(region: string, gameName: string, tagLine: string): string {
  return `riftforge:roadmap_token:${region}:${gameName}:${tagLine}`.toLowerCase()
}

/** Roadmap de Progressão do Jogador (rodada 28) — passo ativo mostra o
 *  gap atual (sempre negativo, é isso que o qualifica pra virar passo)
 *  e a amostra que embasa ele. Reaproveita `.value-neg`/`.value-pos` já
 *  usados na tabela abaixo, mesma linguagem visual. */
function RoadmapStepRow({ step, done }: { step: PlayerRoadmapStep; done: boolean }) {
  return (
    <li className="roadmap-step">
      <span className="roadmap-step-champion">
        {step.champion_id} · {LANE_LABELS[step.lane] ?? step.lane}
      </span>
      <span className={done ? 'value-pos' : 'value-neg'}>
        {step.delta_pct_atual >= 0 ? '+' : ''}
        {step.delta_pct_atual.toFixed(1)}% WR vs. média do elo
      </span>
      <span className="explain-sub">{step.partidas_atual} partidas</span>
      {done && <span className="roadmap-step-done" title="Concluído">✓</span>}
    </li>
  )
}

function PlayerAnalysisPage() {
  const [searchParams] = useSearchParams()
  const region = searchParams.get('region')
  const gameName = searchParams.get('gameName')
  const tagLine = searchParams.get('tagLine')

  useDocumentTitle(gameName && tagLine ? `${gameName}#${tagLine} — RiftForge` : 'Análise do Jogador — RiftForge')

  const [result, setResult] = useState<PlayerLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!region || !gameName || !tagLine) return
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setResult(null)
    fetchPlayerLookup({ region, gameName, tagLine })
      .then((data) => {
        setResult(data)
        if (data.roadmap.roadmap_token) {
          localStorage.setItem(roadmapTokenStorageKey(region, gameName, tagLine), data.roadmap.roadmap_token)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 501) {
          setUnavailable(true)
          return
        }
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      })
      .finally(() => setLoading(false))
  }, [region, gameName, tagLine])

  function handleDeleteRoadmap() {
    if (!region || !gameName || !tagLine) return
    setDeleting(true)
    setDeleteError(null)
    const token = localStorage.getItem(roadmapTokenStorageKey(region, gameName, tagLine))
    deletePlayerRoadmap({ region, gameName, tagLine }, token)
      .then(() => {
        // Limpa na hora, sem exigir nova busca — reflete o estado vazio
        // imediatamente (retenção sem prazo fixo, isto é o mecanismo
        // real de retenção, ver 06_SEGURANCA_PRIVACIDADE.md §7).
        setResult((current) =>
          current ? { ...current, roadmap: { ativos: [], concluidos: [], roadmap_token: null } } : current,
        )
        localStorage.removeItem(roadmapTokenStorageKey(region, gameName, tagLine))
        setConfirmingDelete(false)
      })
      .catch((err: Error) => setDeleteError(err.message))
      .finally(() => setDeleting(false))
  }

  if (!gameName || !tagLine) {
    return (
      <main className="center">
        <h1>Análise do Jogador</h1>
        <p className="placeholder-page">Busque um jogador pela Home para ver a análise aqui.</p>
      </main>
    )
  }

  return (
    <main className="center">
      <h1>Análise do Jogador</h1>
      <p>
        <strong>{gameName}#{tagLine}</strong>
      </p>

      {loading && <p className="filters-loading" role="status">Buscando...</p>}

      {unavailable && (
        <p className="empty-state">
          Análise de jogador ainda não disponível em produção — essa busca faz chamadas em tempo real
          à Riot API, que só podem ir ao ar depois que a Production Key for aprovada. Funciona em
          desenvolvimento local com uma chave própria.
        </p>
      )}

      {error && <p className="error" role="alert">Não foi possível buscar esse jogador: {error}</p>}

      {result && (
        <>
          <p className="table-caption">
            {result.partidas_analisadas} partidas recentes analisadas · comparado contra o elo{' '}
            {result.elo_tier_comparado}
            {result.elo_tier_detectado ? (
              <span className="explain-sub"> (detectado via ranked solo/duo)</span>
            ) : (
              <span className="explain-sub"> (padrão — sem entrada ranqueada em solo/duo detectada)</span>
            )}
          </p>

          <section className="roadmap-section">
            <div className="roadmap-section-header">
              <h2>Seu roadmap</h2>
              {(result.roadmap.ativos.length > 0 || result.roadmap.concluidos.length > 0) && (
                <button
                  type="button"
                  className="roadmap-delete-toggle"
                  onClick={() => setConfirmingDelete((v) => !v)}
                >
                  Apagar meu roadmap
                </button>
              )}
            </div>

            {confirmingDelete && (
              <div className="roadmap-delete-confirm" role="alertdialog">
                <p>Isso apaga permanentemente todos os passos do seu roadmap. Não pode ser desfeito.</p>
                {deleteError && <p className="error" role="alert">{deleteError}</p>}
                <div className="roadmap-delete-actions">
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="roadmap-delete-confirm-btn"
                    onClick={handleDeleteRoadmap}
                    disabled={deleting}
                  >
                    {deleting ? 'Apagando...' : 'Sim, apagar meu roadmap'}
                  </button>
                </div>
              </div>
            )}

            {result.roadmap.ativos.length === 0 && result.roadmap.concluidos.length === 0 ? (
              <p className="empty-state">
                Nenhum passo no roadmap ainda — jogue mais partidas com campeões abaixo da média do seu
                elo pra receber sugestões de foco aqui.
              </p>
            ) : (
              <>
                {result.roadmap.ativos.length > 0 && (
                  <ul className="roadmap-list">
                    {result.roadmap.ativos.map((step) => (
                      <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={false} />
                    ))}
                  </ul>
                )}
                {result.roadmap.concluidos.length > 0 && (
                  <>
                    <h3 className="roadmap-concluidos-title">Concluídos</h3>
                    <ul className="roadmap-list roadmap-list-done">
                      {result.roadmap.concluidos.map((step) => (
                        <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={true} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <div className="table-scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Campeão</th>
                  <th>Rota</th>
                  <th>Partidas</th>
                  <th>Vitórias</th>
                  <th>KDA médio</th>
                  <th>Vs. média do elo</th>
                  <th>Tier atual</th>
                </tr>
              </thead>
              <tbody>
                {result.campeoes.map((c) => (
                  <tr key={`${c.champion_id}-${c.lane}`}>
                    <td>{c.champion_id}</td>
                    <td>{LANE_LABELS[c.lane] ?? c.lane}</td>
                    <td>{c.partidas}</td>
                    <td>{c.vitorias}</td>
                    <td>{c.kda_medio.toFixed(2)}</td>
                    <td>
                      {c.comparativo_baseline ? (
                        <span className={c.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                          {c.comparativo_baseline.delta_pct >= 0 ? '+' : ''}
                          {c.comparativo_baseline.delta_pct.toFixed(1)}% WR
                        </span>
                      ) : (
                        <span className="explain-sub">sem baseline</span>
                      )}
                    </td>
                    <td>
                      {c.score_atual ? (
                        <span className={`tier-badge tier-${c.score_atual.score_tier}`}>
                          {c.score_atual.score_tier}
                          {c.score_atual.tier_provisorio ? '*' : ''}
                        </span>
                      ) : (
                        <span className="explain-sub">sem dado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}

export default PlayerAnalysisPage
