import { useState } from 'react'
import { championImageUrl, type ChampionMeta, type PatchDeltaRow } from '../../api/client'
import { TIER_ORDER } from '../../lib/recommendation'
import { LANE_LABELS } from '../championDisplay'

/** Extraído de `PatchNotesPage.tsx` (Sprint 6, dívida estrutural) — seção
 *  "Campeões que mudaram de tier" e a tabela de altas/quedas, sem
 *  mudança de comportamento em relação ao arquivo original. */

const LANE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

export function DeltaTable({ title, rows }: { title: string; rows: PatchDeltaRow[] }) {
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

function groupByLane(rows: PatchDeltaRow[]): [string, PatchDeltaRow[]][] {
  const map = new Map<string, PatchDeltaRow[]>()
  for (const row of rows) {
    const list = map.get(row.lane) ?? []
    list.push(row)
    map.set(row.lane, list)
  }
  return [...map.entries()].sort((a, b) => LANE_ORDER.indexOf(a[0]) - LANE_ORDER.indexOf(b[0]))
}

/** Separa quem subiu de quem desceu dentro da própria rota — pedido do
 *  usuário depois de ver que uma rota só (ex: Topo) podia juntar ~65
 *  campeões numa parede só de chips, mais densa que a tabela antiga mas
 *  ainda não organizada de verdade. `TIER_ORDER[0]` é o melhor tier
 *  (GOD), por isso "subiu" = índice novo MENOR que o antigo.
 *
 *  Pedido do usuário (revisão): dentro de cada grupo, ordena pela
 *  transição de tier em sequência — Subiram começa por quem partiu do
 *  tier mais alto (S→GOD, depois A→S, B→A...), Desceram começa por
 *  quem partiu do mais alto também (GOD→S, depois S→A, A→B...). As
 *  duas seguem a mesma regra (`tier_anterior` crescente em índice —
 *  0=GOD é o "melhor" — com `tier_atual` como desempate pra saltos de
 *  mais de um tier, ex.: alguém que caiu de A pra C). */
function tierIndex(tier: string): number {
  return TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number])
}

function byTierTransition(a: PatchDeltaRow, b: PatchDeltaRow): number {
  const anterior = tierIndex(a.tier_anterior) - tierIndex(b.tier_anterior)
  if (anterior !== 0) return anterior
  return tierIndex(a.tier_atual) - tierIndex(b.tier_atual)
}

function splitByDirection(rows: PatchDeltaRow[]): { subiram: PatchDeltaRow[]; desceram: PatchDeltaRow[] } {
  const subiram: PatchDeltaRow[] = []
  const desceram: PatchDeltaRow[] = []
  for (const row of rows) {
    const antes = tierIndex(row.tier_anterior)
    const depois = tierIndex(row.tier_atual)
    if (depois < antes) subiram.push(row)
    else desceram.push(row)
  }
  subiram.sort(byTierTransition)
  desceram.sort(byTierTransition)
  return { subiram, desceram }
}

function TierChip({
  row,
  championsMeta,
  ddragonPatch,
}: {
  row: PatchDeltaRow
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const meta = championsMeta?.[row.champion_id]
  const name = meta?.name ?? row.champion_id
  return (
    <span className="tier-change-chip" title={name}>
      {meta && ddragonPatch && (
        <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={32} height={32} loading="lazy" />
      )}
      <span className="tier-change-chip-name">{name}</span>
      <span className="tier-change-chip-badges">
        <span className={`tier-badge tier-${row.tier_anterior}`}>{row.tier_anterior}</span>
        <span aria-hidden="true">→</span>
        <span className={`tier-badge tier-${row.tier_atual}`}>{row.tier_atual}</span>
      </span>
    </span>
  )
}

/** Pedido do usuário: a tabela antiga (uma linha por campeão+rota,
 *  centenas de linhas num patch normal) virou uma lista longa demais
 *  pra usar de verdade. Agrupado por rota e, dentro dela, por direção
 *  (subiu/desceu) — a mesma informação (campeão, tier antes/depois, foto),
 *  em chips compactos.
 *
 *  Pedido do usuário (revisão): as 5 rotas apareciam todas expandidas
 *  ao mesmo tempo (paredes de até 33 chips cada) — vira um seletor de
 *  rota (mesmo padrão `<select>` de "Elo" já usado na página), só uma
 *  rota visível por vez. `selectedLane` guarda a escolha manual; se a
 *  rota escolhida sumir da lista (troca de elo sem dados pra ela), cai
 *  de volta pra primeira disponível sem precisar de efeito adicional. */
export function TierChangeGroups({
  rows,
  championsMeta,
  ddragonPatch,
}: {
  rows: PatchDeltaRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const [selectedLane, setSelectedLane] = useState<string | null>(null)
  if (rows.length === 0) return null
  const groups = groupByLane(rows)
  const activeLane = groups.find(([lane]) => lane === selectedLane)?.[0] ?? groups[0][0]
  const activeGroup = groups.find(([lane]) => lane === activeLane)
  if (!activeGroup) return null
  const [, laneRows] = activeGroup
  const { subiram, desceram } = splitByDirection(laneRows)
  return (
    <div className="tier-change-groups">
      <div className="filters">
        <label>
          Rota
          <select value={activeLane} onChange={(e) => setSelectedLane(e.target.value)}>
            {groups.map(([lane]) => (
              <option key={lane} value={lane}>{LANE_LABELS[lane] ?? lane}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="tier-change-lane-group">
        {subiram.length > 0 && (
          <>
            <p className="tier-change-direction-label tier-change-direction-up">
              Subiram de tier ({subiram.length})
            </p>
            <div className="tier-change-chips">
              {subiram.map((row) => (
                <TierChip key={`${row.champion_id}-${row.lane}`} row={row} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
              ))}
            </div>
          </>
        )}
        {desceram.length > 0 && (
          <>
            <p className="tier-change-direction-label tier-change-direction-down">
              Desceram de tier ({desceram.length})
            </p>
            <div className="tier-change-chips">
              {desceram.map((row) => (
                <TierChip key={`${row.champion_id}-${row.lane}`} row={row} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
