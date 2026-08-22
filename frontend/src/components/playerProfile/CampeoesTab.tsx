import { useState } from 'react'
import type { ChampionMeta, PlayerChampionSummary } from '../../api/client'
import { ChampionPortrait, LANE_LABELS, championName } from './shared'

/** Comparador (item novo, auditoria 16/08): compara 2 campeões DESTE
 *  jogador — partidas/vitórias/KDA/gap vs. média do elo — diferente do
 *  comparador de `ChampionDetailPage.tsx`, que compara linhas globais de
 *  `ChampionScoreRow`, não o histórico pessoal do jogador buscado. */
function PlayerComparator({
  campeoes,
  championsMeta,
  ddragonPatch,
}: {
  campeoes: PlayerChampionSummary[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const [keyA, setKeyA] = useState('')
  const [keyB, setKeyB] = useState('')

  function keyOf(c: PlayerChampionSummary): string {
    return `${c.champion_id}-${c.lane}`
  }

  const options = campeoes.map((c) => ({ key: keyOf(c), label: `${championName(c.champion_id, championsMeta)} (${LANE_LABELS[c.lane] ?? c.lane})` }))
  const a = campeoes.find((c) => keyOf(c) === keyA)
  const b = campeoes.find((c) => keyOf(c) === keyB)

  return (
    <div className="player-comparator">
      <div className="player-comparator-pickers">
        <select value={keyA} onChange={(e) => setKeyA(e.target.value)}>
          <option value="">Campeão A...</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <select value={keyB} onChange={(e) => setKeyB(e.target.value)}>
          <option value="">Campeão B...</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {a && b && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th></th>
                <th>{championName(a.champion_id, championsMeta)}</th>
                <th>{championName(b.champion_id, championsMeta)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Rota</td>
                <td><ChampionPortrait championId={a.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} /> {LANE_LABELS[a.lane] ?? a.lane}</td>
                <td><ChampionPortrait championId={b.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} /> {LANE_LABELS[b.lane] ?? b.lane}</td>
              </tr>
              <tr>
                <td>Partidas</td>
                <td>{a.partidas}</td>
                <td>{b.partidas}</td>
              </tr>
              <tr>
                <td>Vitórias</td>
                <td>{a.vitorias}</td>
                <td>{b.vitorias}</td>
              </tr>
              <tr>
                <td>KDA médio</td>
                <td>{a.kda_medio.toFixed(2)}</td>
                <td>{b.kda_medio.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Vs. média do elo</td>
                <td>
                  {a.comparativo_baseline ? (
                    <span className={a.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                      {a.comparativo_baseline.delta_pct >= 0 ? '+' : ''}{a.comparativo_baseline.delta_pct.toFixed(1)}% WR
                    </span>
                  ) : <span className="explain-sub">sem baseline</span>}
                </td>
                <td>
                  {b.comparativo_baseline ? (
                    <span className={b.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                      {b.comparativo_baseline.delta_pct >= 0 ? '+' : ''}{b.comparativo_baseline.delta_pct.toFixed(1)}% WR
                    </span>
                  ) : <span className="explain-sub">sem baseline</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function CampeoesTab({
  campeoes,
  championsMeta,
  ddragonPatch,
}: {
  campeoes: PlayerChampionSummary[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  return (
    <div>
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
            {campeoes.map((c) => (
              <tr key={`${c.champion_id}-${c.lane}`}>
                <td>
                  <ChampionPortrait championId={c.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />{' '}
                  {championName(c.champion_id, championsMeta)}
                </td>
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

      {campeoes.length >= 2 && (
        <>
          <h2>Comparar</h2>
          <PlayerComparator campeoes={campeoes} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
        </>
      )}
    </div>
  )
}
