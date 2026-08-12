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

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

const LANE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']

/** Pedido do usuário (revisão pós-nota-oficial): reclassificar
 *  buff/nerf/ajuste — a lista antiga batia por RÓTULO EXATO contra um
 *  vocabulário fixo de ~20 campos que só existiam vindos direto da
 *  Data Dragon (`patch_notes_diff.py`). Agora a fonte primária é a
 *  nota oficial da Riot, que escreve rótulo livre em inglês por
 *  habilidade ("Base Damage - Nail", "Bonus Attack Damage Ratio"...) —
 *  o backend traduz uma parte pra português via dicionário próprio
 *  (`patch_notes_translation.py`), o resto fica em inglês. Ou seja: o
 *  rótulo que chega aqui pode estar nos dois idiomas dependendo se o
 *  backend já tinha tradução pronta — por isso a lista de
 *  palavras-chave cobre as duas línguas pro mesmo conceito, em vez de
 *  rótulo exato.
 *
 *  Raciocínio de cada grupo:
 *  - "Maior valor é melhor pro campeão": dano, vida/defesa (armadura,
 *    resistência, escudo), velocidade (movimento/ataque), alcance,
 *    sustentação (cura, roubo de vida, regeneração), redução de dano,
 *    proporção/escala/cargas/número de golpes, crescimento por nível.
 *    Duração entra aqui por padrão — a esmagadora maioria das
 *    durações rastreadas em nota de patch são de CC ou bônus que o
 *    PRÓPRIO campeão aplica (atordoamento/lentidão no inimigo, bônus
 *    em si mesmo), então mais duração favorece quem lança a
 *    habilidade — não é garantia (uma duração de "debuff em si mesmo"
 *    inverteria isso, mas não apareceu nenhum caso assim nos patches
 *    reais verificados).
 *  - "Menor valor é melhor pro campeão": recarga, custo, tempo de
 *    conjuração / entre conjurações, bloqueio pós-conjuração — tudo
 *    que atrasa o campeão de agir de novo.
 *  - Fora das duas listas: `neutral` — cobre tanto rótulo genuinamente
 *    ambíguo sem mais contexto (ex: "Size"/"Tamanho" de modelo, pode
 *    ser bom ou ruim dependendo do que representa) quanto qualquer
 *    rótulo novo que a nota oficial usar e ainda não esteja mapeado.
 *    Mesma escolha de antes: sem confiança na direção, não chuta cor. */
const HIGHER_IS_BETTER_KEYWORDS = [
  'damage', 'dano',
  'health', 'vida', 'armor', 'armadura',
  'resist', 'resistência', 'resistencia', 'shield', 'escudo',
  'speed', 'velocidade', 'range', 'alcance',
  'heal', 'cura', 'lifesteal', 'roubo de vida',
  'regen', 'regeneração', 'regeneracao',
  'reduction', 'redução', 'reducao',
  'ratio', 'proporção', 'proporcao', 'multiplicador',
  'stacks', 'cargas', 'strikes', 'golpes',
  'conversion', 'conversão', 'conversao',
  'duration', 'duração', 'duracao',
  'growth', 'crescimento',
  'stolen', 'roubado', 'roubada',
  // Nomes de efeito específicos de campeão que descrevem dano/desgaste
  // (ex: "Caustic Wounds"/"Feridas Cáusticas" do Kai'Sa) — não têm a
  // palavra "dano" literal, mas o valor associado é sempre dano.
  'wounds', 'feridas', 'caustic',
]

const LOWER_IS_BETTER_KEYWORDS = [
  'cooldown', 'recarga',
  'cost', 'custo',
  'cast time', 'tempo de conjuração', 'tempo de conjuracao',
  'time between casts', 'tempo entre conjurações', 'tempo entre conjuracoes',
  'lockout', 'bloqueio',
]

function includesKeyword(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword))
}

/** Campos de escala por rank vêm como string "18/16/14/12/10" — extrai
 *  TODOS os ranks (não só o primeiro), porque `classifyChangeDirection`
 *  precisa comparar o array inteiro pra detectar transição
 *  escala↔fixo e direção mista entre ranks (pedido do usuário, ver
 *  abaixo). Também cobre valor puramente textual (ex: "Removed", ou um
 *  valor composto tipo "6 + 1 per 33% bonus Attack Speed" — só extrai
 *  o "6" nesse caso) — sem nenhum número, array vazio, cai em
 *  `neutral` do mesmo jeito que antes. */
function parseNumbers(value: string): number[] {
  return value
    .split('/')
    .map((segment) => parseFloat(segment))
    .filter((n) => !Number.isNaN(n))
}

/** Segundo formato de escala visto na nota oficial, sem "/": intervalo
 *  min-max por nível do campeão, ex: "4 - 24 (Champion Level) (+12%
 *  Ability Power), +1 - 6 (Champion Level) (+3% Ability Power) per
 *  prior stack" (Kai'Sa, Feridas Cáusticas). Pega todo par "N - M" do
 *  texto — cada intervalo contribui seus dois extremos, na ordem em
 *  que aparecem — e ignora o resto (razão de Poder de Habilidade
 *  entre parênteses, "per prior stack" etc.), mesma filosofia de
 *  `parseNumbers` de não tentar entender o texto inteiro, só os
 *  números que definem a escala. Não confundir com número solto
 *  dentro de descrição qualitativa (ex: "3 seconds") — como não tem
 *  "N - M" ali, não entra nessa lista; por isso só é usada quando a
 *  string NÃO tem "/" (ver `classifyChangeDirection`). */
const DASH_RANGE_REGEX = /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/g

function parseDashRangeNumbers(value: string): number[] {
  const numbers: number[] = []
  for (const match of value.matchAll(DASH_RANGE_REGEX)) {
    numbers.push(parseFloat(match[1]), parseFloat(match[2]))
  }
  return numbers
}

/** Compara duas sequências de números já extraídas (rank-array via
 *  "/" ou intervalo min-max via "-") com a mesma regra em ambos os
 *  formatos:
 *  - Tamanho diferente = mudança estrutural (escala↔fixo, ou
 *    intervalo↔número único) → sempre Ajuste, nunca buff/nerf.
 *  - Quem decide é o ÚLTIMO valor da sequência (nível/rank máximo, o
 *    que o jogador de fato tem com a habilidade maxada) — se ele
 *    mudou, essa mudança sozinha decide buff/nerf.
 *  - Só quando o último EMPATA (pedido do usuário, caso Volibear Q
 *    "14/13/12/11/10 → 12/11.5/11/10.5/10": rank máximo ficou igual,
 *    mas os ranks anteriores todos diminuíram) é que olha o resto da
 *    sequência: se todo mundo moveu na mesma direção, essa direção
 *    decide; se teve mistura (alguns melhoraram, outros pioraram) é
 *    Ajuste de verdade. */
function compareNumberSequence(
  beforeNumbers: number[],
  afterNumbers: number[],
  higherIsBetter: boolean,
): ChangeDirection {
  if (beforeNumbers.length === 0 || afterNumbers.length === 0) return 'neutral'
  if (beforeNumbers.length !== afterNumbers.length) return 'neutral'

  const direction = (before: number, after: number): ChangeDirection => {
    if (before === after) return 'neutral'
    const increased = after > before
    const better = higherIsBetter ? increased : !increased
    return better ? 'pos' : 'neg'
  }

  const lastIndex = beforeNumbers.length - 1
  const lastDirection = direction(beforeNumbers[lastIndex], afterNumbers[lastIndex])
  if (lastDirection !== 'neutral' || lastIndex === 0) return lastDirection

  const deltas = beforeNumbers.slice(0, lastIndex).map((before, i) => afterNumbers[i] - before)
  const signs = new Set(deltas.filter((delta) => delta !== 0).map((delta) => Math.sign(delta)))
  if (signs.size !== 1) return 'neutral'
  const increased = signs.has(1)
  const better = higherIsBetter ? increased : !increased
  return better ? 'pos' : 'neg'
}

/** Pedido do usuário (Imagem 2 da revisão): valor composto tipo "6 + 1
 *  per 33% bonus Attack Speed" — a exigência percentual embutida tem
 *  polaridade PRÓPRIA, sempre invertida em relação ao resto do valor
 *  (precisar de MAIS % de um atributo bônus pra ativar o efeito é
 *  sempre pior pro campeão, independente do rótulo externo ser "maior
 *  é melhor"). `parseNumbers`/`firstNumber` não pegam essa mudança
 *  sozinhos porque o número externo ("6") costuma ficar igual — só a
 *  exigência muda. */
const PER_PERCENT_REGEX = /per\s+(-?\d+(?:\.\d+)?)\s*%/i

function perPercentRequirement(value: string): number | null {
  const match = value.match(PER_PERCENT_REGEX)
  if (!match) return null
  const n = parseFloat(match[1])
  return Number.isNaN(n) ? null : n
}

type ChangeDirection = 'pos' | 'neg' | 'neutral'

/** Pedido do usuário (revisão com capturas de tela): "aumento = Buff |
 *  Diminuição = Nerf | Aumento e Diminuição = Ajuste | Remoção =
 *  Ajuste", com o "último rank decide, empate olha o resto" de
 *  `compareNumberSequence` cobrindo os casos estruturais (escala↔fixo,
 *  ranks intermediários em direção mista). Dois formatos de valor
 *  tentados em ordem — o valor real só usa um deles por vez, nunca os
 *  dois juntos nos patches verificados:
 *  1. Rank-array com "/" (`parseNumbers`) — ex: "35/40/45/50/55%".
 *  2. Intervalo "N - M" sem "/" (`parseDashRangeNumbers`) — ex: "4 - 24
 *     (Champion Level) ..., +1 - 6 (Champion Level) ... per prior
 *     stack" (Kai'Sa, Feridas Cáusticas: sem isso, só pegava o "4"
 *     inicial e nunca via que 24→30 e 6→8 subiram).
 *  Nenhum dos dois formatos encontrado (nem "/" nem "N - M") cai pro
 *  número único no início da string (mesmo comportamento de sempre pra
 *  valor simples tipo "60" → "55"). */
function classifyChangeDirection(change: PatchChangeRow): ChangeDirection {
  const label = change.field_label.toLowerCase()
  const higherIsBetter = includesKeyword(label, HIGHER_IS_BETTER_KEYWORDS)
  const lowerIsBetter = !higherIsBetter && includesKeyword(label, LOWER_IS_BETTER_KEYWORDS)
  if (!higherIsBetter && !lowerIsBetter) return 'neutral'

  const beforeRequirement = perPercentRequirement(change.before_value)
  const afterRequirement = perPercentRequirement(change.after_value)
  if (
    beforeRequirement !== null &&
    afterRequirement !== null &&
    beforeRequirement !== afterRequirement
  ) {
    return afterRequirement > beforeRequirement ? 'neg' : 'pos'
  }

  if (change.before_value.includes('/') || change.after_value.includes('/')) {
    return compareNumberSequence(
      parseNumbers(change.before_value),
      parseNumbers(change.after_value),
      higherIsBetter,
    )
  }

  const beforeRange = parseDashRangeNumbers(change.before_value)
  const afterRange = parseDashRangeNumbers(change.after_value)
  if (beforeRange.length > 0 || afterRange.length > 0) {
    return compareNumberSequence(beforeRange, afterRange, higherIsBetter)
  }

  return compareNumberSequence(
    parseNumbers(change.before_value),
    parseNumbers(change.after_value),
    higherIsBetter,
  )
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
function TierChangeGroups({
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

function PatchNotesPage() {
  useDocumentTitle('Patch Notes — RiftForge')
  // Pedido do usuário: remove o seletor de Elo — "Impacto no score"
  // sempre usa GOLD (mesma tier que já era o padrão do seletor).
  const eloTier = 'GOLD'
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

      {/* Pedido do usuário: um subtítulo próprio ("Mudanças") pra essa
          seção, mesmo padrão de "Impacto no score" — antes pulava direto
          do `<h1>` pras mudanças, sem indicar o que a seção é. */}
      <h2>Mudanças</h2>

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
          {/* Pedido do usuário: essa legenda ficava fora do escopo visual
              dos cards acima (mesma largura de texto corrido, sem
              destaque próprio) — vira nota de rodapé de verdade: menor,
              itálico, separada por uma linha fina. */}
          <p className="table-caption patch-changes-footnote">
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

      {/* Pedido do usuário: "Campeões que mudaram de tier" e "Impacto no
          score" viram duas seções próprias, nessa ordem — antes a lista
          de tier vinha depois das tabelas de altas/quedas, dentro da
          mesma seção "Impacto no score". Ambas usam o mesmo fetch
          (`result`, sempre elo GOLD — pedido do usuário: removeu o
          seletor de Elo que ficava aqui). */}
      {loading && <p className="filters-loading" role="status">Buscando...</p>}

      {error && <p className="error" role="alert">Backend indisponível: {error}</p>}

      {!error && result && !result.patch_anterior && (
        <p className="empty-state">
          Ainda não há dois patches com score calculado pra esse elo — sem base de comparação.
        </p>
      )}

      {result && result.patch_anterior && result.mudancas_tier.length > 0 && (
        <>
          <h2>Campeões que mudaram de tier</h2>
          <TierChangeGroups rows={result.mudancas_tier} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
          <div className="section-divider" />
        </>
      )}

      <h2>Impacto no score</h2>
      <p>
        Maiores altas e quedas de score entre os dois patches mais recentes — derivado do próprio
        modelo (partidas jogadas), reflete impacto estatístico, não só mudanças diretas da Riot.
      </p>

      {result && result.patch_anterior && (
        <>
          <p className="table-caption">
            Comparando patch <strong>{result.patch_anterior}</strong> → <strong>{result.patch_atual}</strong> ·{' '}
            {result.comparados} campeões comparados
          </p>
          <DeltaTable title="Maiores altas" rows={result.altas} />
          <DeltaTable title="Maiores quedas" rows={result.quedas} />
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
