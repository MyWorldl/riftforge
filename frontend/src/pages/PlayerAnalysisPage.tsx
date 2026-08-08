import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchPlayerLookup, HttpError, type PlayerLookupResult } from '../api/client'

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

function PlayerAnalysisPage() {
  const [searchParams] = useSearchParams()
  const region = searchParams.get('region')
  const gameName = searchParams.get('gameName')
  const tagLine = searchParams.get('tagLine')

  const [result, setResult] = useState<PlayerLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!region || !gameName || !tagLine) return
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setResult(null)
    fetchPlayerLookup({ region, gameName, tagLine })
      .then(setResult)
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 501) {
          setUnavailable(true)
          return
        }
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      })
      .finally(() => setLoading(false))
  }, [region, gameName, tagLine])

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
