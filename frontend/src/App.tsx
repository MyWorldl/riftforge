import { useEffect, useState, type FormEvent } from 'react'
import {
  championImageUrl,
  fetchChampionStats,
  fetchChampions,
  type ChampionMeta,
  type ChampionStat,
} from './api/client'
import './App.css'

const TIERS = [
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function App() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState<string>('')
  const [metaError, setMetaError] = useState<string | null>(null)

  const [tier, setTier] = useState('GOLD')
  const [lane, setLane] = useState('')
  const [patchInput, setPatchInput] = useState('')

  const [stats, setStats] = useState<ChampionStat[] | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch((err: Error) => setMetaError(err.message))
  }, [])

  const loadStats = (filters: { tier: string; lane: string; patch: string }) => {
    setLoading(true)
    setStatsError(null)
    fetchChampionStats({
      tier: filters.tier,
      lane: filters.lane || undefined,
      patch: filters.patch || undefined,
    })
      .then((data) => setStats([...data].sort((a, b) => b.win_rate - a.win_rate)))
      .catch((err: Error) => setStatsError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStats({ tier, lane, patch: patchInput })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    loadStats({ tier, lane, patch: patchInput })
  }

  return (
    <main id="center">
      <h1>RiftForge</h1>
      <p>Placar de força dos campeões de League of Legends por elo, rota e patch.</p>

      <form className="filters" onSubmit={handleSubmit}>
        <label>
          Elo
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((t) => (
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
      {statsError && <p className="error">Backend indisponível: {statsError}</p>}

      {!statsError && stats && stats.length === 0 && (
        <p className="empty-state">
          Sem dados agregados para esse filtro ainda. Rode o job de coleta
          (<code>python -m app.jobs.collect_stats --tier {tier}</code>) para esse elo.
        </p>
      )}

      {stats && stats.length > 0 && (
        <table className="stats-table">
          <thead>
            <tr>
              <th>Campeão</th>
              <th>Rota</th>
              <th>Patch</th>
              <th>Partidas</th>
              <th>Win rate</th>
              <th>Pick rate</th>
              <th>Ban rate</th>
              <th>KDA</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => {
              const meta = championsMeta?.[row.champion_id]
              return (
                <tr key={`${row.champion_id}-${row.lane}-${row.patch}`}>
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
                  </td>
                  <td>{row.lane}</td>
                  <td>{row.patch}</td>
                  <td>{row.games}</td>
                  <td>{formatPercent(row.win_rate)}</td>
                  <td>{formatPercent(row.pick_rate)}</td>
                  <td>{formatPercent(row.ban_rate)}</td>
                  <td>{row.kda.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}

export default App
