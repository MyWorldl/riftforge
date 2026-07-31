import { useEffect, useState } from 'react'
import { fetchChampions, fetchRankings, profileIconUrl, type RankingRow } from '../api/client'
import { RANKINGS_REGIONS } from '../constants/regions'

const TIERS = [
  { value: '', label: 'Todos os tiers' },
  { value: 'CHALLENGER', label: 'Desafiante' },
  { value: 'GRANDMASTER', label: 'Grão-Mestre' },
  { value: 'MASTER', label: 'Mestre' },
]

const TIER_LABELS: Record<string, string> = {
  CHALLENGER: 'Desafiante',
  GRANDMASTER: 'Grão-Mestre',
  MASTER: 'Mestre',
}

function matchesSearch(row: RankingRow, search: string): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  const haystack = `${row.game_name ?? ''}#${row.tag_line ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

function RankingsPage() {
  const [tier, setTier] = useState('')
  const [region, setRegion] = useState(RANKINGS_REGIONS[0].value)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<RankingRow[] | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchChampions()
      .then((data) => setDdragonPatch(data.patch))
      .catch(() => setDdragonPatch(''))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchRankings({ tier: tier || undefined, region })
      .then(setRows)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [tier, region])

  const filteredRows = rows?.filter((row) => matchesSearch(row, search)) ?? null
  const showTierColumn = tier === ''

  return (
    <main className="center">
      <h1>Rankings</h1>
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

        <label>
          Região
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {RANKINGS_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        <label>
          Jogador
          <input
            type="text"
            placeholder="Buscar por nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {loading && <span className="filters-loading">Buscando...</span>}
      </div>

      {error && <p className="error">Backend indisponível: {error}</p>}

      {!error && filteredRows && filteredRows.length === 0 && (
        <p className="empty-state">
          {rows && rows.length > 0
            ? 'Nenhum jogador encontrado com esse nome.'
            : <>Sem ranking coletado ainda pra esse filtro. Rode <code>app.jobs.collect_rankings</code>.</>}
        </p>
      )}

      {filteredRows && filteredRows.length > 0 && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                {showTierColumn && <th>Tier</th>}
                <th>Nível</th>
                <th>LP</th>
                <th>Taxa de Vitória</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const totalGames = row.wins + row.losses
                const winRate = Math.round((row.wins / Math.max(totalGames, 1)) * 100)
                return (
                  <tr key={`${row.tier}-${row.puuid}`}>
                    <td>{row.rank_position}</td>
                    <td>
                      <div className="champion-cell">
                        {row.profile_icon_id && ddragonPatch && (
                          <img
                            src={profileIconUrl(ddragonPatch, row.profile_icon_id)}
                            alt=""
                            width={28}
                            height={28}
                          />
                        )}
                        <span>{row.game_name && row.tag_line ? `${row.game_name}#${row.tag_line}` : '—'}</span>
                      </div>
                    </td>
                    {showTierColumn && <td>{TIER_LABELS[row.tier] ?? row.tier}</td>}
                    <td>{row.summoner_level ?? '—'}</td>
                    <td>{row.league_points}</td>
                    <td>{row.wins}/{row.losses} - {winRate}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default RankingsPage
