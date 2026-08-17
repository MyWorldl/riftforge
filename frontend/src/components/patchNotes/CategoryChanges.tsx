import { useState, type ReactNode } from 'react'
import {
  championImageUrl,
  passiveImageUrl,
  spellImageUrl,
  type ChampionDetail,
  type ChampionMeta,
  type PatchChangeRow,
  type PatchDeltaRow,
  type PatchNotesResult,
} from '../../api/client'
import {
  classifyChampionCategory,
  classifyChangeDirection,
  countChangeDirections,
  type PatchCategory,
} from '../../lib/patchChangeClassification'
import { LANE_LABELS } from '../championDisplay'

/** Extraído de `PatchNotesPage.tsx` (Sprint 6, dívida estrutural) — a
 *  seção "Mudanças" (galeria Buff/Nerf/Ajuste + painéis de detalhe por
 *  campeão), sem mudança de comportamento em relação ao arquivo
 *  original. */

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

export function groupByChampion(rows: PatchChangeRow[]): [string, PatchChangeRow[]][] {
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
 *  compacta só de ícones. Sem `onClick` — não seleciona nada, é só o
 *  resumo do hover (`title`, tooltip nativo do navegador, aparece sem
 *  precisar clicar). `tabIndex` deixa o tooltip acessível por teclado
 *  também (foco mostra `title` do mesmo jeito que hover). */
function CategoryIcon({
  championId,
  changes,
  championsMeta,
  ddragonPatch,
  category,
}: {
  championId: string
  changes: PatchChangeRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  category: PatchCategory
}) {
  const meta = championsMeta?.[championId]
  const { pos, neg, neutral } = countChangeDirections(changes)
  const summaryParts: string[] = []
  if (pos > 0) summaryParts.push(`${pos} buff`)
  if (neg > 0) summaryParts.push(`${neg} nerf`)
  if (neutral > 0) summaryParts.push(`${neutral} ajuste`)
  const name = meta?.name ?? championId
  return (
    <span
      className={`patch-category-icon-btn patch-category-icon-btn-${category}`}
      title={summaryParts.length > 0 ? `${name} — ${summaryParts.join(' · ')}` : name}
      tabIndex={0}
    >
      {meta && ddragonPatch ? (
        <img src={championImageUrl(ddragonPatch, meta.image.full)} alt={name} width={40} height={40} loading="lazy" />
      ) : (
        <span className="patch-category-icon-fallback" aria-hidden="true">{championId.slice(0, 2)}</span>
      )}
    </span>
  )
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
          {/* Pedido do usuário: "ajuste" (direção sem confiança — ver
              `classifyChangeDirection`) fica em amarelo aqui também,
              mesma cor já usada pro badge de categoria "Ajuste" —
              antes ficava sem cor nenhuma, só pos/neg tinham destaque. */}
          <span
            className={
              direction === 'pos' ? 'value-pos' : direction === 'neg' ? 'value-neg' : 'value-warn'
            }
          >
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

/** Pedido do usuário: todo campeão da categoria aparece aqui direto,
 *  sem precisar clicar no ícone pra revelar — uma linha de resumo por
 *  campeão (foto+nome+contagem Buff/Nerf/Ajuste, badges sólidos com
 *  `--badge-buff`/`-nerf`/`-ajuste`). O corpo completo
 *  (`ChampionChangeDetailBody`) continua atrás de um clique — pedido do
 *  usuário: sem texto/seta de "mais detalhes", o card inteiro é o alvo
 *  do clique, e a borda vira roxa (`--brand`) no hover pra dar a
 *  impressão de que é clicável. Cada card guarda seu próprio
 *  `expanded`, então abrir um não afeta os outros. Pedido do usuário:
 *  sem tingimento de fundo por categoria aqui (isso ficou só na
 *  galeria de ícones/`.patch-category-gallery-*` acima) — o card volta
 *  à cor neutra padrão (`--code-bg`/`--border`). */
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
  const meta = championsMeta?.[championId]
  const { pos, neg, neutral } = countChangeDirections(changes)
  const toggle = () => setExpanded((v) => !v)
  return (
    <div
      className="patch-selected-panel"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
    >
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

/** Pedido do usuário (mockup próprio): as três categorias ficam lado a
 *  lado, cada uma só com título+galeria de ícones (hover = resumo
 *  rápido) — os cards de resumo por campeão saem de dentro de cada
 *  categoria e viram uma lista única, combinada, logo abaixo das três
 *  colunas (ordem buff → nerf → ajuste, cada bucket já ordenado do
 *  campeão com mais mudanças pro com menos). */
export function ChangesByCategory({
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
  const buckets: Record<PatchCategory, [string, PatchChangeRow[]][]> = { buff: [], nerf: [], ajuste: [] }
  for (const entry of grouped) {
    buckets[classifyChampionCategory(entry[1])].push(entry)
  }
  for (const key of Object.keys(buckets) as PatchCategory[]) {
    buckets[key].sort((a, b) => b[1].length - a[1].length)
  }
  const allEntries = CATEGORY_SECTIONS.flatMap(({ key }) => buckets[key])

  return (
    <>
      <div className="patch-category-columns">
        {CATEGORY_SECTIONS.map(({ key, label, icon }) => {
          const entries = buckets[key]
          if (entries.length === 0) return null
          return (
            <div className="patch-category-column" key={key}>
              <h3 className={`patch-category-heading patch-category-${key}`}>
                {icon} {label} <span className="patch-category-count">({entries.length})</span>
              </h3>
              <div className={`patch-category-gallery patch-category-gallery-${key}`}>
                {entries.map(([championId, rows]) => (
                  <CategoryIcon
                    key={championId}
                    championId={championId}
                    changes={rows}
                    championsMeta={championsMeta}
                    ddragonPatch={ddragonPatch}
                    category={key}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="patch-category-panels">
        {allEntries.map(([championId, rows]) => (
          <SelectedChampionPanel
            key={championId}
            championId={championId}
            changes={rows}
            championsMeta={championsMeta}
            ddragonPatch={ddragonPatch}
            scoreDeltas={scoreDeltaIndex.get(championId)}
            abilities={abilities}
          />
        ))}
      </div>
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
export function buildScoreDeltaIndex(result: PatchNotesResult | null): Map<string, PatchDeltaRow[]> {
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
