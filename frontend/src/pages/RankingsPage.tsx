import { useEffect, useState } from 'react'
import { fetchRankings, type RankingRow } from '../api/client'

const TIERS = [
  { value: 'CHALLENGER', label: 'Desafiante' },
  { value: 'GRANDMASTER', label: 'Grão-Mestre' },
  { value: 'MASTER', label: 'Mestre' },
]

function RankingsPage() {
  const [tier, setTier] = useState('CHALLENGER')
  const [rows, setRows] = useState<RankingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchRankings({ tier })
      .then(setRows)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [tier])

  return (
    <main className="center">
      <h1>Classificações</h1>
      <p>Ranking de jogadores direto da Riot — Desafiante, Grão-Mestre e Mestre.</p>

      <div className="filters">
        <label>
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        {loading && <span className="filters-loading">Buscando...</span>}
      </div>

      {error && <p className="error">Backend indisponível: {error}</p>}

      {!error && rows && rows.length === 0 && (
        <p className="empty-state">
          Sem ranking coletado ainda pra esse tier. Rode <code>app.jobs.collect_rankings</code>.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>LP</th>
                <th>V/D</th>
                <th>% vitória</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.puuid}>
                  <td>{row.rank_position}</td>
                  <td>{row.game_name && row.tag_line ? `${row.game_name}#${row.tag_line}` : '—'}</td>
                  <td>{row.league_points}</td>
                  <td>{row.wins}/{row.losses}</td>
                  <td>{Math.round((row.wins / Math.max(row.wins + row.losses, 1)) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default RankingsPage
