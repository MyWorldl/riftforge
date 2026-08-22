import { useEffect, useState } from 'react'
import { fetchChampions, fetchRankings, profileIconUrl, type RankingRow } from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFilterParam } from '../hooks/useFilterParam'
import { RANKINGS_REGIONS } from '../constants/regions'
import { TIER_ICONS, TIER_LABELS } from '../constants/tiers'

const TIERS = [
  { value: '', label: 'Todos os tiers' },
  { value: 'CHALLENGER', label: 'Desafiante' },
  { value: 'GRANDMASTER', label: 'Grão-Mestre' },
  { value: 'MASTER', label: 'Mestre' },
]

function matchesSearch(row: RankingRow, search: string): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  const haystack = `${row.game_name ?? ''}#${row.tag_line ?? ''}`.toLowerCase()
  return haystack.includes(needle)
}

function winRatePct(row: RankingRow): number {
  const total = row.wins + row.losses
  return Math.round((row.wins / Math.max(total, 1)) * 100)
}

/** Item novo (revisão técnica §5.2): ▲/▼ com a variação de posição desde a
 *  última coleta — `null` (jogador novo no ranking ou primeira coleta,
 *  ver `collect_rankings.py`) não desenha nada, em vez de fingir "sem
 *  mudança". */
function DeltaPositionBadge({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return <span className="delta-position delta-position-none">—</span>
  const subiu = delta > 0
  return (
    <span className={`delta-position ${subiu ? 'delta-position-up' : 'delta-position-down'}`}>
      {subiu ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

/** Anel de vitória/derrota: fatia proporcional à taxa real, vitória em
 *  roxo vibrante e derrota em rosa-carmim (`--ring-win`/`--ring-loss`,
 *  `index.css`) — cores fixas escolhidas pelo usuário, sem variar por
 *  tema. */
function WinRateRing({ winRate }: { winRate: number }) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const winLength = (winRate / 100) * circumference
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" className="win-rate-ring" aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--ring-loss)" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="var(--ring-win)"
        strokeWidth="4"
        strokeDasharray={`${winLength} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

function RankingsPage() {
  useDocumentTitle('Classificações — RiftForge')
  // Item 18 (revisão técnica, Sprint 4): mesmo tratamento de ChampionsPage.tsx.
  const [tier, setTier] = useFilterParam('tier', '')
  const [region, setRegion] = useFilterParam('region', RANKINGS_REGIONS[0].value)
  const [search, setSearch] = useFilterParam('search', '')
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
    // Item 1.3 (revisão técnica): mesmo cuidado de ChampionsPage.tsx — sem
    // isso, trocar o filtro de tier/região rapidamente podia deixar a
    // tabela com dados de um filtro anterior.
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchRankings({ tier: tier || undefined, region }, controller.signal)
      .then(setRows)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [tier, region])

  const filteredRows = rows?.filter((row) => matchesSearch(row, search)) ?? null
  const showTierColumn = tier === ''
  // Pódio só faz sentido pro top 3 "de verdade" — some quando o usuário
  // busca um jogador específico, senão a posição no resultado filtrado
  // não tem nada a ver com a colocação real dele no ranking.
  const podiumRows = !search ? (filteredRows ?? []).slice(0, 3) : []
  const tableRows = podiumRows.length > 0 ? (filteredRows ?? []).slice(3) : filteredRows ?? []

  return (
    <main className="center">
      <h1>Rankings</h1>
      <p>Ranking de jogadores direto da Riot — Desafiante, Grão-Mestre e Mestre.</p>

      <div className="filters">
        <label>
          Região
          <FlagSelect options={RANKINGS_REGIONS} value={region} onChange={setRegion} />
        </label>

        <label>
          Invocador
          <input
            type="text"
            placeholder="Buscar por nome"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label>
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        {loading && <span className="filters-loading" role="status">Buscando...</span>}
      </div>

      {error && <p className="error" role="alert">Backend indisponível: {error}</p>}

      {!error && filteredRows && filteredRows.length === 0 && (
        <p className="empty-state">
          {rows && rows.length > 0
            ? 'Nenhum jogador encontrado com esse nome.'
            : <>Sem ranking coletado ainda pra esse filtro. Rode <code>app.jobs.collect_rankings</code>.</>}
        </p>
      )}

      {podiumRows.length > 0 && (
        <div className="podium">
          {/* Estilo (tamanho/cor) segue o `place` real (1o/2o/3o), mas a
              ORDEM visual é 2-1-3 (prata, ouro, bronze) — igual pódio de
              premiação de verdade. Com menos de 3 resultados não dá pra
              montar esse arranjo, então mantém a ordem natural. */}
          {(podiumRows.length === 3
            ? [podiumRows[1], podiumRows[0], podiumRows[2]]
            : podiumRows
          ).map((row) => {
            const place = podiumRows.indexOf(row) + 1
            return (
              <div className={`podium-card podium-${place}`} key={`${row.tier}-${row.region}-${row.rank_position}`}>
                <span className="podium-rank">#{row.rank_position}</span>
                {row.profile_icon_id && ddragonPatch && (
                  <img
                    className="podium-avatar"
                    src={profileIconUrl(ddragonPatch, row.profile_icon_id)}
                    alt=""
                    width={place === 1 ? 48 : 40}
                    height={place === 1 ? 48 : 40}
                    loading="lazy"
                  />
                )}
                <span className="podium-name">
                  {row.game_name && row.tag_line ? `${row.game_name}#${row.tag_line}` : '—'}
                </span>
                <span className="podium-meta">{row.league_points} LP · {winRatePct(row)}%</span>
              </div>
            )
          })}
        </div>
      )}

      {tableRows.length > 0 && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Posição</th>
                <th>Invocador</th>
                {showTierColumn && <th>Tier</th>}
                <th>Nível</th>
                <th>LP</th>
                <th>Variação</th>
                <th>Taxa de Vitória</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const winRate = winRatePct(row)
                return (
                  <tr key={`${row.tier}-${row.region}-${row.rank_position}`} className={`tier-stripe-${row.tier}`}>
                    <td>{row.rank_position}</td>
                    <td>
                      <div className="champion-cell">
                        {row.profile_icon_id && ddragonPatch && (
                          <img
                            src={profileIconUrl(ddragonPatch, row.profile_icon_id)}
                            alt=""
                            width={28}
                            height={28}
                            loading="lazy"
                          />
                        )}
                        <span>{row.game_name && row.tag_line ? `${row.game_name}#${row.tag_line}` : '—'}</span>
                      </div>
                    </td>
                    {showTierColumn && (
                      <td>
                        <span className="tier-indicator">
                          {TIER_ICONS[row.tier] && (
                            <img className="tier-indicator-icon" src={TIER_ICONS[row.tier]} alt="" width={16} height={16} />
                          )}
                          {TIER_LABELS[row.tier] ?? row.tier}
                        </span>
                      </td>
                    )}
                    <td>{row.summoner_level ?? '—'}</td>
                    <td>{row.league_points}</td>
                    <td><DeltaPositionBadge delta={row.delta_posicao} /></td>
                    <td>
                      <div className="win-rate-cell">
                        <WinRateRing winRate={winRate} />
                        <span className="win-rate-text">
                          <span className="win-rate-pct">{winRate}%</span>
                          <span className="win-rate-sub">{row.wins}/{row.losses}</span>
                        </span>
                      </div>
                    </td>
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
