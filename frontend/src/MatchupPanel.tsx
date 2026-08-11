import { useEffect, useState } from 'react'
import { championImageUrl, fetchMatchups, type ChampionMeta, type MatchupRow } from './api/client'

interface MatchupPanelProps {
  championId: string
  lane: string
  eloTier: string
  patch: string
  region: string
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}

export default function MatchupPanel({
  championId,
  lane,
  eloTier,
  patch,
  region,
  championsMeta,
  ddragonPatch,
}: MatchupPanelProps) {
  const [rows, setRows] = useState<MatchupRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    setError(null)
    fetchMatchups({ championId, lane, eloTier, patch: patch || undefined, region })
      .then((result) => setRows(result.confrontos))
      .catch((err: Error) => setError(err.message))
  }, [championId, lane, eloTier, patch, region])

  if (error) return <p className="error">Não foi possível carregar matchups: {error}</p>
  if (!rows) return <p className="filters-loading">Buscando confrontos...</p>
  if (rows.length === 0) {
    return <p className="empty-state">Sem confrontos calculados pra essa rota/elo ainda.</p>
  }

  return (
    <div className="matchup-panel">
      <p className="explain-sample">
        Confrontos observados na mesma rota, ordenados do melhor pro pior matchup.
      </p>
      <ul className="matchup-list">
        {rows.map((row) => {
          const meta = championsMeta?.[row.opponent_champion_id]
          return (
            <li className="matchup-item" key={row.opponent_champion_id}>
              {meta && ddragonPatch && (
                <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={28} height={28} loading="lazy" />
              )}
              <span className="matchup-name">{meta?.name ?? row.opponent_champion_id}</span>
              <span className="matchup-bar-cell">
                <span
                  className={`matchup-bar ${row.win_rate >= 0.5 ? 'bar-pos' : 'bar-neg'}`}
                  style={{ width: `${row.win_rate * 100}%` }}
                />
              </span>
              <span className="matchup-value">{(row.win_rate * 100).toFixed(1)}%</span>
              <span className="matchup-games">
                {row.games} {row.games === 1 ? 'jogo' : 'jogos'}
                {row.amostra_insuficiente && (
                  <span title="Amostra pequena — taxa pouco confiável"> · amostra pequena</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
