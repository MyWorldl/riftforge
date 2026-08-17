import type { PatchChangeRow } from '../api/client'

/** Extraído de `PatchNotesPage.tsx` (Sprint 6, dívida estrutural — o
 *  arquivo tinha passado de 1.150 linhas). Lógica pura de classificação
 *  Buff/Nerf/Ajuste, sem nenhuma dependência de React — movida pra cá
 *  intacta, mesmo comportamento de antes. */

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

export type ChangeDirection = 'pos' | 'neg' | 'neutral'

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
export function classifyChangeDirection(change: PatchChangeRow): ChangeDirection {
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
export function countChangeDirections(
  changes: PatchChangeRow[],
): { pos: number; neg: number; neutral: number } {
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
export type PatchCategory = 'buff' | 'nerf' | 'ajuste'

export function classifyChampionCategory(changes: PatchChangeRow[]): PatchCategory {
  const { pos, neg } = countChangeDirections(changes)
  if (pos > neg) return 'buff'
  if (neg > pos) return 'nerf'
  return 'ajuste'
}
