import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  championImageUrl,
  fetchChampionAbilities,
  fetchChampions,
  fetchPatchChanges,
  fetchPatchNotes,
  passiveImageUrl,
  spellImageUrl,
  type ChampionDetail,
  type ChampionMeta,
  type PatchChangeRow,
  type PatchChangesResult,
  type PatchDeltaRow,
  type PatchNotesResult,
} from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { TIER_ORDER } from '../lib/recommendation'
import { LAST_IDENTITY_STORAGE_KEY } from './PlayerAnalysisPage'

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

const LANE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

/** Pedido do usuário: cor por direção real (bom/ruim pro campeão), não
 *  por "antes é sempre vermelho, depois é sempre verde" (o que fazia
 *  Recarga subir aparecer em verde, mesmo sendo pior pro campeão).
 *  `field_label` mapeia 1:1 com o `field` que o backend usa
 *  (`patch_notes_diff.py`) pra esses casos — os únicos que dá pra
 *  classificar com segurança. "Valor de efeito N" (spell genérico) fica
 *  de fora de propósito: o Data Dragon não rotula esses índices
 *  (dano? duração? recarga escondida num efeito?), então colorir seria
 *  chute, não fato — mesma linha de raciocínio já documentada no
 *  próprio backend pra esse campo. */
const HIGHER_IS_BETTER_LABELS = new Set([
  'Vida', 'Vida por nível',
  'Mana', 'Mana por nível',
  'Velocidade de movimento',
  'Armadura', 'Armadura por nível',
  'Resistência mágica', 'Resistência mágica por nível',
  'Alcance de ataque',
  'Regeneração de vida', 'Regeneração de vida por nível',
  'Regeneração de mana', 'Regeneração de mana por nível',
  'Chance de crítico', 'Chance de crítico por nível',
  'Dano de ataque', 'Dano de ataque por nível',
  'Velocidade de ataque', 'Velocidade de ataque por nível',
  'Alcance',
])

const LOWER_IS_BETTER_LABELS = new Set(['Recarga', 'Custo'])

/** Campos de escala por rank vêm como string "18/16/14/12/10" — compara
 *  só o primeiro rank (rank 1), suficiente pra saber a direção real da
 *  mudança sem precisar parsear a string inteira. */
function firstNumber(value: string): number | null {
  const n = parseFloat(value.split('/')[0])
  return Number.isNaN(n) ? null : n
}

type ChangeDirection = 'pos' | 'neg' | 'neutral'

function classifyChangeDirection(change: PatchChangeRow): ChangeDirection {
  const higherIsBetter = HIGHER_IS_BETTER_LABELS.has(change.field_label)
  const lowerIsBetter = LOWER_IS_BETTER_LABELS.has(change.field_label)
  if (!higherIsBetter && !lowerIsBetter) return 'neutral'
  const before = firstNumber(change.before_value)
  const after = firstNumber(change.after_value)
  if (before === null || after === null || before === after) return 'neutral'
  const increased = after > before
  const better = higherIsBetter ? increased : !increased
  return better ? 'pos' : 'neg'
}

/** Conta a direção de cada mudança do campeão — base tanto da
 *  categorização Buff/Nerf/Ajuste quanto dos badges de contagem no
 *  painel de detalhe ("2 Buff / 1 Nerf / 3 Ajuste"). */
function countChangeDirections(changes: PatchChangeRow[]): { pos: number; neg: number; neutral: number } {
  let pos = 0
  let neg = 0
  let neutral = 0
  for (const change of changes) {
    const direction = classifyChangeDirection(change)
    if (direction === 'pos') pos++
    else if (direction === 'neg') neg++
    else neutral++
  }
  return { pos, neg, neutral }
}

/** Pedido do usuário: segmenta a visão do patch em Buff/Nerf/Ajuste —
 *  conta quantas mudanças do campeão são boas (`pos`) vs. ruins (`neg`)
 *  pra ele (reaproveita `classifyChangeDirection`, mesma lógica de
 *  cor já usada por mudança individual); "Ajuste" cobre empate — inclui
 *  o caso comum de um campeão só ter mudanças não-classificáveis
 *  ("Valor de efeito N"), onde pos=neg=0. */
type PatchCategory = 'buff' | 'nerf' | 'ajuste'

function classifyChampionCategory(changes: PatchChangeRow[]): PatchCategory {
  const { pos, neg } = countChangeDirections(changes)
  if (pos > neg) return 'buff'
  if (neg > pos) return 'nerf'
  return 'ajuste'
}

function IconBuff() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 12 7 6l3 3 4-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 3h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconNerf() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 4 7 10l3-3 4 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M10 13h4v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconAjuste() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M11.4 2.3a3 3 0 0 0-3.86 3.86l-5.1 5.1a1.4 1.4 0 1 0 1.98 1.98l5.1-5.1a3 3 0 0 0 3.86-3.86l-1.8 1.8-1.98-1.98 1.8-1.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

const SPELL_KEYS = ['Q', 'W', 'E', 'R']

/** Ícone de habilidade — `PatchChangeRow` não traz o nome do arquivo de
 *  imagem (só `spell_key`/`spell_name`), então precisa do detalhe
 *  completo do campeão (`fetchChampionAbilities`, mesmo endpoint que
 *  `ChampionDetailPage.tsx` já usa). `abilities` é um cache por
 *  `champion_id`, buscado uma vez por campeão que aparece na página
 *  (ver `useEffect` em `PatchNotesPage`), não por mudança individual. */
function abilityImageFor(change: PatchChangeRow, detail: ChampionDetail | undefined): string | null {
  if (!detail) return null
  if (change.category === 'passive') return detail.passive.image.full
  if (change.spell_key) {
    const index = SPELL_KEYS.indexOf(change.spell_key)
    if (index >= 0) return detail.spells[index]?.image.full ?? null
  }
  return null
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
 *  (GOD), por isso "subiu" = índice novo MENOR que o antigo. */
function splitByDirection(rows: PatchDeltaRow[]): { subiram: PatchDeltaRow[]; desceram: PatchDeltaRow[] } {
  const subiram: PatchDeltaRow[] = []
  const desceram: PatchDeltaRow[] = []
  for (const row of rows) {
    const antes = TIER_ORDER.indexOf(row.tier_anterior as (typeof TIER_ORDER)[number])
    const depois = TIER_ORDER.indexOf(row.tier_atual as (typeof TIER_ORDER)[number])
    if (depois < antes) subiram.push(row)
    else desceram.push(row)
  }
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
  return (
    <span className="tier-change-chip">
      {meta && ddragonPatch && (
        <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={20} height={20} loading="lazy" />
      )}
      {meta?.name ?? row.champion_id}
      <span className={`tier-badge tier-${row.tier_anterior}`}>{row.tier_anterior}</span>
      <span aria-hidden="true">→</span>
      <span className={`tier-badge tier-${row.tier_atual}`}>{row.tier_atual}</span>
    </span>
  )
}

/** Pedido do usuário: a tabela antiga (uma linha por campeão+rota,
 *  centenas de linhas num patch normal) virou uma lista longa demais
 *  pra usar de verdade. Agrupado por rota e, dentro dela, por direção
 *  (subiu/desceu) — a mesma informação (campeão, tier antes/depois, foto),
 *  em chips compactos que quebram linha, escaneável sem rolagem infinita. */
function TierChangeGroups({
  rows,
  championsMeta,
  ddragonPatch,
}: {
  rows: PatchDeltaRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  if (rows.length === 0) return null
  const groups = groupByLane(rows)
  return (
    <div className="tier-change-groups">
      <p className="table-caption">Campeões que mudaram de tier</p>
      {groups.map(([lane, laneRows]) => {
        const { subiram, desceram } = splitByDirection(laneRows)
        return (
          <div className="tier-change-lane-group" key={lane}>
            <h3 className="tier-change-lane-title">{LANE_LABELS[lane] ?? lane}</h3>
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
        )
      })}
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

const CATEGORY_SECTIONS: { key: PatchCategory; label: string; icon: ReactNode }[] = [
  { key: 'buff', label: 'Buff', icon: <IconBuff /> },
  { key: 'nerf', label: 'Nerf', icon: <IconNerf /> },
  { key: 'ajuste', label: 'Ajuste', icon: <IconAjuste /> },
]

/** Pedido do usuário (mockup próprio): cada categoria vira uma galeria
 *  compacta só de ícones — não mais um card completo por campeão. O
 *  ícone leva o resumo rápido no `title` (tooltip nativo do navegador,
 *  aparece no hover sem precisar clicar); clicar seleciona o campeão e
 *  abre o painel de detalhe (`SelectedChampionPanel`) logo abaixo das
 *  três galerias, compartilhado entre elas — só um campeão expandido
 *  por vez, seja qual for a categoria de onde veio o clique. Clicar de
 *  novo no mesmo ícone fecha o painel. */
function CategoryIconButton({
  championId,
  changes,
  championsMeta,
  ddragonPatch,
  selected,
  onSelect,
}: {
  championId: string
  changes: PatchChangeRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  selected: boolean
  onSelect: (championId: string) => void
}) {
  const meta = championsMeta?.[championId]
  const { pos, neg, neutral } = countChangeDirections(changes)
  const summaryParts: string[] = []
  if (pos > 0) summaryParts.push(`${pos} buff`)
  if (neg > 0) summaryParts.push(`${neg} nerf`)
  if (neutral > 0) summaryParts.push(`${neutral} ajuste`)
  const name = meta?.name ?? championId
  return (
    <button
      type="button"
      className={`patch-category-icon-btn${selected ? ' patch-category-icon-btn-selected' : ''}`}
      title={summaryParts.length > 0 ? `${name} — ${summaryParts.join(' · ')}` : name}
      aria-pressed={selected}
      onClick={() => onSelect(championId)}
    >
      {meta && ddragonPatch ? (
        <img src={championImageUrl(ddragonPatch, meta.image.full)} alt={name} width={40} height={40} loading="lazy" />
      ) : (
        <span className="patch-category-icon-fallback" aria-hidden="true">{championId.slice(0, 2)}</span>
      )}
    </button>
  )
}

/** Corpo de detalhe reaproveitado pelo painel expandido — extraído do
 *  antigo `ChampionChangeCard` (Atributos/Habilidades/Mudança de tier),
 *  sem o cabeçalho próprio (o painel que chama já mostra ícone+nome). */
function ChampionChangeDetailBody({
  championId,
  changes,
  ddragonPatch,
  scoreDeltas,
  abilities,
}: {
  championId: string
  changes: PatchChangeRow[]
  ddragonPatch: string
  scoreDeltas: PatchDeltaRow[] | undefined
  abilities: Record<string, ChampionDetail>
}) {
  const detail = abilities[championId]
  // Pedido do usuário: separar o que é atributo base (vida, armadura...)
  // do que é habilidade (Q/W/E/R/passiva) — antes vinha tudo misturado
  // na mesma lista, na ordem em que o backend calculou o diff.
  const attributeChanges = changes.filter((c) => c.category === 'stat')
  const abilityChanges = changes.filter((c) => c.category !== 'stat')
  return (
    <>
      {attributeChanges.length > 0 && (
        <>
          <p className="patch-change-subheading">Atributos do campeão</p>
          <ul className="patch-change-list">
            {attributeChanges.map((change, index) => (
              <ChangeListItem key={index} change={change} abilityImage={null} ddragonPatch={ddragonPatch} />
            ))}
          </ul>
        </>
      )}
      {abilityChanges.length > 0 && (
        <>
          <p className="patch-change-subheading">Habilidades do campeão</p>
          {groupBySpell(abilityChanges).map(([spellKey, groupChanges]) => (
            <AbilityChangeGroup
              key={spellKey}
              spellKey={spellKey}
              changes={groupChanges}
              abilityImage={abilityImageFor(groupChanges[0], detail)}
              ddragonPatch={ddragonPatch}
            />
          ))}
        </>
      )}
      {scoreDeltas && scoreDeltas.length > 0 && (
        <>
          <p className="patch-change-subheading">Mudança de tier</p>
          <ScoreImpactBadges rows={scoreDeltas} />
        </>
      )}
    </>
  )
}

/** Pedido do usuário: revelação em dois estágios. Selecionar um ícone
 *  na galeria abre primeiro só o resumo (foto+nome+contagem Buff/Nerf/
 *  Ajuste desse campeão, badges sólidos com `--badge-buff`/`-nerf`/
 *  `-ajuste`); o corpo completo (`ChampionChangeDetailBody`) só aparece
 *  depois de clicar em "mais detalhes". Troca de campeão selecionado
 *  sempre volta a fechar o detalhe, pra não confundir com o campeão
 *  anterior. */
function SelectedChampionPanel({
  championId,
  changes,
  championsMeta,
  ddragonPatch,
  scoreDeltas,
  abilities,
}: {
  championId: string
  changes: PatchChangeRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  scoreDeltas: PatchDeltaRow[] | undefined
  abilities: Record<string, ChampionDetail>
}) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    setExpanded(false)
  }, [championId])
  const meta = championsMeta?.[championId]
  const { pos, neg, neutral } = countChangeDirections(changes)
  return (
    <div className="patch-selected-panel">
      <div className="patch-selected-panel-header">
        {meta && ddragonPatch && (
          <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={40} height={40} />
        )}
        <span className="patch-selected-panel-name">{meta?.name ?? championId}</span>
        <span className="patch-selected-panel-counts">
          {pos > 0 && <span className="patch-count-badge patch-count-badge-buff">{pos} Buff</span>}
          {neg > 0 && <span className="patch-count-badge patch-count-badge-nerf">{neg} Nerf</span>}
          {neutral > 0 && <span className="patch-count-badge patch-count-badge-ajuste">{neutral} Ajuste</span>}
        </span>
      </div>
      <button
        type="button"
        className="patch-selected-panel-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? '↑ menos detalhes' : '↓ mais detalhes...'}
      </button>
      {expanded && (
        <div className="patch-selected-panel-body">
          <ChampionChangeDetailBody
            championId={championId}
            changes={changes}
            ddragonPatch={ddragonPatch}
            scoreDeltas={scoreDeltas}
            abilities={abilities}
          />
        </div>
      )}
    </div>
  )
}

/** Pedido do usuário (mockup próprio): cada categoria (Buff/Nerf/
 *  Ajuste) vira uma galeria de ícones só — reaproveita
 *  `classifyChampionCategory` pra bucketizar, ordenado do campeão com
 *  mais mudanças pro com menos. Um único campeão fica selecionado por
 *  vez entre as três galerias (`selectedChampionId`), e o painel de
 *  detalhe aparece uma vez só, depois delas. */
function ChangesByCategory({
  grouped,
  championsMeta,
  ddragonPatch,
  scoreDeltaIndex,
  abilities,
}: {
  grouped: [string, PatchChangeRow[]][]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  scoreDeltaIndex: Map<string, PatchDeltaRow[]>
  abilities: Record<string, ChampionDetail>
}) {
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(null)

  const buckets: Record<PatchCategory, [string, PatchChangeRow[]][]> = { buff: [], nerf: [], ajuste: [] }
  for (const entry of grouped) {
    buckets[classifyChampionCategory(entry[1])].push(entry)
  }
  for (const key of Object.keys(buckets) as PatchCategory[]) {
    buckets[key].sort((a, b) => b[1].length - a[1].length)
  }

  const selectedEntry = selectedChampionId
    ? grouped.find(([championId]) => championId === selectedChampionId)
    : undefined

  return (
    <>
      {CATEGORY_SECTIONS.map(({ key, label, icon }) => {
        const entries = buckets[key]
        if (entries.length === 0) return null
        return (
          <div className="patch-category-section" key={key}>
            <h3 className={`patch-category-heading patch-category-${key}`}>
              {icon} {label} <span className="patch-category-count">({entries.length})</span>
            </h3>
            <div className="patch-category-gallery">
              {entries.map(([championId, rows]) => (
                <CategoryIconButton
                  key={championId}
                  championId={championId}
                  changes={rows}
                  championsMeta={championsMeta}
                  ddragonPatch={ddragonPatch}
                  selected={championId === selectedChampionId}
                  onSelect={(id) => setSelectedChampionId((prev) => (prev === id ? null : id))}
                />
              ))}
            </div>
          </div>
        )
      })}
      {selectedEntry && (
        <SelectedChampionPanel
          championId={selectedEntry[0]}
          changes={selectedEntry[1]}
          championsMeta={championsMeta}
          ddragonPatch={ddragonPatch}
          scoreDeltas={scoreDeltaIndex.get(selectedEntry[0])}
          abilities={abilities}
        />
      )}
    </>
  )
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

/** Uma mudança por `<li>`, reaproveitada por "Atributos" (com cabeçalho
 *  próprio por linha — não tem ícone/nome pra agrupar) e por dentro de
 *  `AbilityChangeGroup` (sem cabeçalho — o ícone/nome da habilidade já
 *  aparece uma vez só no grupo, `showAbilityHeader=false`). */
function ChangeListItem({
  change,
  abilityImage,
  ddragonPatch,
  showAbilityHeader = true,
}: {
  change: PatchChangeRow
  abilityImage: string | null
  ddragonPatch: string
  showAbilityHeader?: boolean
}) {
  const direction = classifyChangeDirection(change)
  return (
    <li className="patch-change-item">
      <div className="patch-change-field">
        {showAbilityHeader && abilityImage && ddragonPatch && (
          <img
            className="patch-change-ability-icon"
            src={change.category === 'passive' ? passiveImageUrl(ddragonPatch, abilityImage) : spellImageUrl(ddragonPatch, abilityImage)}
            alt=""
            width={20}
            height={20}
            loading="lazy"
          />
        )}
        {showAbilityHeader && !abilityImage && change.spell_key && (
          <span className="patch-change-spell-key">{change.spell_key}</span>
        )}
        {showAbilityHeader
          ? change.spell_name
            ? `${change.spell_name} — ${change.field_label}`
            : change.field_label
          : change.field_label}
      </div>
      {change.category === 'passive' ? (
        <div className="patch-change-text-diff">
          <p className="patch-change-before">{change.before_value}</p>
          <p className="patch-change-after">{change.after_value}</p>
        </div>
      ) : (
        <div className="patch-change-values">
          <span>{change.before_value}</span>
          <span aria-hidden="true"> → </span>
          <span className={direction === 'pos' ? 'value-pos' : direction === 'neg' ? 'value-neg' : ''}>
            {change.after_value}
          </span>
        </div>
      )}
    </li>
  )
}

function groupBySpell(changes: PatchChangeRow[]): [string, PatchChangeRow[]][] {
  const map = new Map<string, PatchChangeRow[]>()
  for (const change of changes) {
    const key = change.spell_key ?? change.category
    const list = map.get(key) ?? []
    list.push(change)
    map.set(key, list)
  }
  return [...map.entries()]
}

/** Pedido do usuário (caso Warwick): uma habilidade com várias mudanças
 *  (7 "Valor de efeito N" diferentes, por exemplo) não repete o
 *  ícone/nome uma vez por linha — aparece uma vez no cabeçalho do
 *  grupo, e as mudanças ficam numa lista compacta embaixo. */
function AbilityChangeGroup({
  spellKey,
  changes,
  abilityImage,
  ddragonPatch,
}: {
  spellKey: string
  changes: PatchChangeRow[]
  abilityImage: string | null
  ddragonPatch: string
}) {
  const isPassive = changes[0].category === 'passive'
  const name = changes[0].spell_name ?? (isPassive ? 'Passiva' : spellKey)
  return (
    <div className="patch-change-ability-group">
      <div className="patch-change-ability-group-header">
        {abilityImage && ddragonPatch ? (
          <img
            className="patch-change-ability-icon"
            src={isPassive ? passiveImageUrl(ddragonPatch, abilityImage) : spellImageUrl(ddragonPatch, abilityImage)}
            alt=""
            width={24}
            height={24}
            loading="lazy"
          />
        ) : (
          !isPassive && <span className="patch-change-spell-key">{spellKey}</span>
        )}
        <span>{!isPassive && `${spellKey} — `}{name}</span>
      </div>
      <ul className="patch-change-list patch-change-list-nested">
        {changes.map((change, index) => (
          <ChangeListItem
            key={index}
            change={change}
            abilityImage={null}
            ddragonPatch={ddragonPatch}
            showAbilityHeader={false}
          />
        ))}
      </ul>
    </div>
  )
}

function PatchNotesPage() {
  useDocumentTitle('Patch Notes — RiftForge')
  const [eloTier, setEloTier] = useState('GOLD')
  const [result, setResult] = useState<PatchNotesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [changes, setChanges] = useState<PatchChangesResult | null>(null)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')

  // Sprint B item 2 (revisão técnica §5.3): "Mudanças que te afetam" — só
  // busca se houver identidade salva (última busca em PlayerAnalysisPage.tsx).
  // Sem identidade, o bloco simplesmente não existe, resto da página igual.
  const [myChanges, setMyChanges] = useState<PatchChangesResult | null>(null)
  const [myIdentity, setMyIdentity] = useState<{ region: string; gameName: string; tagLine: string } | null>(null)

  // Pedido do usuário: ícone da habilidade ao lado de cada mudança que
  // referencia uma — `PatchChangeRow` não traz o nome do arquivo de
  // imagem, só dá pra conseguir com o detalhe completo do campeão
  // (`fetchChampionAbilities`). Busca só uma vez por campeão (não por
  // mudança), e só os que ainda não estão no cache (`abilities`).
  const [abilities, setAbilities] = useState<Record<string, ChampionDetail>>({})

  useEffect(() => {
    const ids = new Set<string>()
    for (const row of changes?.mudancas ?? []) ids.add(row.champion_id)
    for (const row of myChanges?.mudancas ?? []) ids.add(row.champion_id)
    const missing = [...ids].filter((id) => !(id in abilities))
    if (missing.length === 0) return
    Promise.allSettled(missing.map((id) => fetchChampionAbilities(id).then((r) => [id, r.champion] as const)))
      .then((results) => {
        const found = results
          .filter((r): r is PromiseFulfilledResult<readonly [string, ChampionDetail]> => r.status === 'fulfilled')
          .map((r) => r.value)
        if (found.length === 0) return
        setAbilities((prev) => ({ ...prev, ...Object.fromEntries(found) }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, myChanges])

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
    const raw = localStorage.getItem(LAST_IDENTITY_STORAGE_KEY)
    if (!raw) return
    let identity: { region: string; gameName: string; tagLine: string }
    try {
      identity = JSON.parse(raw)
    } catch {
      return
    }
    if (!identity.region || !identity.gameName || !identity.tagLine) return
    setMyIdentity(identity)
    fetchPatchChanges(identity)
      .then(setMyChanges)
      .catch(() => {})
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

      {myChanges && myChanges.mudancas.length > 0 && (
        <>
          <h2>Mudanças que te afetam</h2>
          <p>
            Campeões do seu{' '}
            {myIdentity && (
              <Link
                to={`/jogador?${new URLSearchParams(myIdentity)}`}
              >
                roadmap de progressão
              </Link>
            )}{' '}
            que mudaram neste patch.
          </p>
          <ChangesByCategory
            grouped={groupByChampion(myChanges.mudancas)}
            championsMeta={championsMeta}
            ddragonPatch={ddragonPatch}
            scoreDeltaIndex={scoreDeltaIndex}
            abilities={abilities}
          />
          <div className="section-divider" />
        </>
      )}

      {changesError && <p className="error" role="alert">Backend indisponível: {changesError}</p>}

      {changes && changes.patch_anterior && grouped && (
        <>
          <ChangesByCategory
            grouped={grouped}
            championsMeta={championsMeta}
            ddragonPatch={ddragonPatch}
            scoreDeltaIndex={scoreDeltaIndex}
            abilities={abilities}
          />
          {/* Pedido do usuário: o resumo ("N campeões alterados") sai do
              topo da seção (onde competia com a introdução da página por
              atenção) e vira o fechamento dela, depois dos cards. */}
          <p className="table-caption">
            Comparando patch <strong>{changes.patch_anterior}</strong> → <strong>{changes.patch_atual}</strong> ·{' '}
            {grouped.length} campeões alterados
          </p>
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
        {loading && <span className="filters-loading" role="status">Buscando...</span>}
      </div>

      {error && <p className="error" role="alert">Backend indisponível: {error}</p>}

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
          <TierChangeGroups rows={result.mudancas_tier} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
        </>
      )}

      <div className="section-divider" />

      {/* Pedido do usuário: a introdução (o que essa página é/de onde vem
          o dado) sai do topo — onde competia com o título por atenção
          antes mesmo do usuário ver qualquer dado — e vira o fechamento
          da página, junto do disclaimer da Riot que já fica logo abaixo
          (renderizado por `AppLayout.tsx`, fora deste `<main>`). */}
      <p>
        O que a Riot mudou de verdade neste patch, direto dos dados públicos do jogo — não é o texto
        oficial (esse fica só no site da Riot), mas os valores numéricos que de fato foram alterados.
        Alguns ajustes de proporção/escala não aparecem aqui porque a API pública da Riot não expõe
        esse dado; pra ver a nota completa, veja as{' '}
        <a href="https://www.leagueoflegends.com/en-us/news/tags/patch-notes/" target="_blank" rel="noreferrer">
          notas oficiais da Riot
        </a>.
      </p>
    </main>
  )
}

export default PatchNotesPage
