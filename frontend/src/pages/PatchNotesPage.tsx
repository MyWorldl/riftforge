import { useEffect, useState } from 'react'
import {
  championImageUrl,
  fetchChampions,
  fetchPatchChanges,
  fetchPatchNotes,
  type ChampionMeta,
  type PatchChangeRow,
  type PatchChangesResult,
  type PatchDeltaRow,
  type PatchNotesResult,
} from '../api/client'

const ELO_TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

function DeltaTable({ title, rows }: { title: string; rows: PatchDeltaRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="table-scroll">
      <p className="table-caption">{title}</p>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Campeão</th>
            <th>Rota</th>
            <th>Score anterior</th>
            <th>Score atual</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.champion_id}-${row.lane}`}>
              <td>{row.champion_id}</td>
              <td>{LANE_LABELS[row.lane] ?? row.lane}</td>
              <td>{row.score_anterior.toFixed(1)}</td>
              <td>{row.score_atual.toFixed(1)}</td>
              <td className={row.delta >= 0 ? 'value-pos' : 'value-neg'}>
                {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TierChangeTable({ rows }: { rows: PatchDeltaRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="table-scroll">
      <p className="table-caption">Campeões que mudaram de tier</p>
      <table className="stats-table">
        <thead>
          <tr>
            <th>Campeão</th>
            <th>Rota</th>
            <th>Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.champion_id}-${row.lane}`}>
              <td>{row.champion_id}</td>
              <td>{LANE_LABELS[row.lane] ?? row.lane}</td>
              <td>
                <span className={`tier-badge tier-${row.tier_anterior}`}>{row.tier_anterior}</span>
                <span aria-hidden="true"> → </span>
                <span className={`tier-badge tier-${row.tier_atual}`}>{row.tier_atual}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function groupByChampion(rows: PatchChangeRow[]): [string, PatchChangeRow[]][] {
  const map = new Map<string, PatchChangeRow[]>()
  for (const row of rows) {
    const list = map.get(row.champion_id) ?? []
    list.push(row)
    map.set(row.champion_id, list)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/** Item 5.4 (revisão técnica): junta as mudanças brutas do Data Dragon
 *  (`/patch-notes/changes`, o que a Riot alterou) com o impacto estatístico
 *  já calculado (`/patch-notes`, `altas`/`quedas`/`mudancas_tier`) — os dois
 *  endpoints já existiam separados, isso só cruza no frontend por
 *  `champion_id`. Dedup por `(champion_id, lane)`: as três listas usam o
 *  mesmo formato de linha (`PatchDeltaRow`), então não importa qual
 *  sobrescreve qual quando o campeão aparece em mais de uma. */
function buildScoreDeltaIndex(result: PatchNotesResult | null): Map<string, PatchDeltaRow[]> {
  const byChampion = new Map<string, Map<string, PatchDeltaRow>>()
  if (!result) return new Map()

  for (const row of [...result.altas, ...result.quedas, ...result.mudancas_tier]) {
    const byLane = byChampion.get(row.champion_id) ?? new Map<string, PatchDeltaRow>()
    byLane.set(row.lane, row)
    byChampion.set(row.champion_id, byLane)
  }

  const index = new Map<string, PatchDeltaRow[]>()
  for (const [championId, byLane] of byChampion) {
    index.set(championId, [...byLane.values()])
  }
  return index
}

function ScoreImpactBadges({ rows }: { rows: PatchDeltaRow[] | undefined }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="patch-change-impact">
      {rows.map((row) => (
        <span className="patch-change-impact-item" key={row.lane}>
          <span className="patch-change-impact-lane">{LANE_LABELS[row.lane] ?? row.lane}</span>
          <span className={row.delta >= 0 ? 'value-pos' : 'value-neg'}>
            score {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}
          </span>
          {row.tier_anterior !== row.tier_atual && (
            <>
              <span className={`tier-badge tier-${row.tier_anterior}`}>{row.tier_anterior}</span>
              <span aria-hidden="true">→</span>
              <span className={`tier-badge tier-${row.tier_atual}`}>{row.tier_atual}</span>
            </>
          )}
        </span>
      ))}
    </div>
  )
}

function ChampionChangeCard({
  championId,
  changes,
  championsMeta,
  ddragonPatch,
  scoreDeltas,
}: {
  championId: string
  changes: PatchChangeRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  scoreDeltas: PatchDeltaRow[] | undefined
}) {
  const meta = championsMeta?.[championId]
  return (
    <div className="patch-change-card">
      <div className="patch-change-header">
        {meta && ddragonPatch && (
          <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={32} height={32} />
        )}
        <span>{meta?.name ?? championId}</span>
      </div>
      <ScoreImpactBadges rows={scoreDeltas} />
      <ul className="patch-change-list">
        {changes.map((change, index) => (
          <li className="patch-change-item" key={index}>
            <div className="patch-change-field">
              {change.spell_key && <span className="patch-change-spell-key">{change.spell_key}</span>}
              {change.spell_name ? `${change.spell_name} — ${change.field_label}` : change.field_label}
            </div>
            {change.category === 'passive' ? (
              <div className="patch-change-text-diff">
                <p className="patch-change-before">{change.before_value}</p>
                <p className="patch-change-after">{change.after_value}</p>
              </div>
            ) : (
              <div className="patch-change-values">
                <span className="value-neg">{change.before_value}</span>
                <span aria-hidden="true"> → </span>
                <span className="value-pos">{change.after_value}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PatchNotesPage() {
  const [eloTier, setEloTier] = useState('GOLD')
  const [result, setResult] = useState<PatchNotesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [changes, setChanges] = useState<PatchChangesResult | null>(null)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchPatchChanges()
      .then(setChanges)
      .catch((err: Error) => setChangesError(err.message))
  }, [])

  useEffect(() => {
    // Item 1.3 (revisão técnica): mesmo cuidado de ChampionsPage.tsx — sem
    // isso, trocar o filtro de elo rapidamente podia deixar a tabela com
    // dados de um filtro anterior.
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchPatchNotes(eloTier, controller.signal)
      .then(setResult)
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [eloTier])

  const grouped = changes ? groupByChampion(changes.mudancas) : null
  const scoreDeltaIndex = buildScoreDeltaIndex(result)

  return (
    <main className="center">
      <h1>Patch Notes</h1>
      <p>
        O que a Riot mudou de verdade neste patch, direto dos dados públicos do jogo — não é o texto
        oficial (esse fica só no site da Riot), mas os valores numéricos que de fato foram alterados.
        Alguns ajustes de proporção/escala não aparecem aqui porque a API pública da Riot não expõe
        esse dado; pra ver a nota completa, veja as{' '}
        <a href="https://www.leagueoflegends.com/en-us/news/tags/patch-notes/" target="_blank" rel="noreferrer">
          notas oficiais da Riot
        </a>.
      </p>

      {changesError && <p className="error">Backend indisponível: {changesError}</p>}

      {changes && changes.patch_anterior && grouped && (
        <>
          <p className="table-caption">
            Comparando patch <strong>{changes.patch_anterior}</strong> → <strong>{changes.patch_atual}</strong> ·{' '}
            {grouped.length} campeões alterados
          </p>
          <div className="patch-change-grid">
            {grouped.map(([championId, rows]) => (
              <ChampionChangeCard
                key={championId}
                championId={championId}
                changes={rows}
                championsMeta={championsMeta}
                ddragonPatch={ddragonPatch}
                scoreDeltas={scoreDeltaIndex.get(championId)}
              />
            ))}
          </div>
        </>
      )}

      {changes && !changes.patch_anterior && (
        <p className="empty-state">
          Ainda não há mudanças calculadas. Rode <code>app.jobs.compute_patch_changes</code>.
        </p>
      )}

      <div className="section-divider" />

      <h2>Impacto no score</h2>
      <p>
        Maiores altas e quedas de score entre os dois patches mais recentes — derivado do próprio
        modelo (partidas jogadas), reflete impacto estatístico, não só mudanças diretas da Riot.
      </p>

      <div className="filters">
        <label>
          Elo
          <select value={eloTier} onChange={(e) => setEloTier(e.target.value)}>
            {ELO_TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {loading && <span className="filters-loading">Buscando...</span>}
      </div>

      {error && <p className="error">Backend indisponível: {error}</p>}

      {!error && result && !result.patch_anterior && (
        <p className="empty-state">
          Ainda não há dois patches com score calculado pra esse elo — sem base de comparação.
        </p>
      )}

      {result && result.patch_anterior && (
        <>
          <p className="table-caption">
            Comparando patch <strong>{result.patch_anterior}</strong> → <strong>{result.patch_atual}</strong> ·{' '}
            {result.comparados} campeões comparados
          </p>
          <DeltaTable title="Maiores altas" rows={result.altas} />
          <DeltaTable title="Maiores quedas" rows={result.quedas} />
          <TierChangeTable rows={result.mudancas_tier} />
        </>
      )}
    </main>
  )
}

export default PatchNotesPage
