import { useEffect, useState } from 'react'
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

/** Pedido do usuário: a tabela antiga (uma linha por campeão+rota,
 *  centenas de linhas num patch normal) virou uma lista longa demais
 *  pra usar de verdade. Agrupado por rota, em chips compactos que
 *  quebram linha — a mesma informação (campeão, tier antes/depois),
 *  só que escaneável em segundos em vez de rolagem infinita. */
function TierChangeGroups({
  rows,
  championsMeta,
}: {
  rows: PatchDeltaRow[]
  championsMeta: Record<string, ChampionMeta> | null
}) {
  if (rows.length === 0) return null
  const groups = groupByLane(rows)
  return (
    <div className="tier-change-groups">
      <p className="table-caption">Campeões que mudaram de tier</p>
      {groups.map(([lane, laneRows]) => (
        <div className="tier-change-lane-group" key={lane}>
          <h3 className="tier-change-lane-title">{LANE_LABELS[lane] ?? lane}</h3>
          <div className="tier-change-chips">
            {laneRows.map((row) => (
              <span className="tier-change-chip" key={`${row.champion_id}-${row.lane}`}>
                {championsMeta?.[row.champion_id]?.name ?? row.champion_id}
                <span className={`tier-badge tier-${row.tier_anterior}`}>{row.tier_anterior}</span>
                <span aria-hidden="true">→</span>
                <span className={`tier-badge tier-${row.tier_atual}`}>{row.tier_atual}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
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

/** Uma mudança por `<li>`, reaproveitada tanto por "Atributos" quanto por
 *  "Habilidades" (`ChampionChangeCard` abaixo) — só o agrupamento em volta
 *  muda entre as duas seções. */
function ChangeListItem({
  change,
  abilityImage,
  ddragonPatch,
}: {
  change: PatchChangeRow
  abilityImage: string | null
  ddragonPatch: string
}) {
  const direction = classifyChangeDirection(change)
  return (
    <li className="patch-change-item">
      <div className="patch-change-field">
        {abilityImage && ddragonPatch && (
          <img
            className="patch-change-ability-icon"
            src={change.category === 'passive' ? passiveImageUrl(ddragonPatch, abilityImage) : spellImageUrl(ddragonPatch, abilityImage)}
            alt=""
            width={20}
            height={20}
            loading="lazy"
          />
        )}
        {!abilityImage && change.spell_key && <span className="patch-change-spell-key">{change.spell_key}</span>}
        {change.spell_name ? `${change.spell_name} — ${change.field_label}` : change.field_label}
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

function ChampionChangeCard({
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
  const meta = championsMeta?.[championId]
  const detail = abilities[championId]
  // Pedido do usuário: separar o que é atributo base (vida, armadura...)
  // do que é habilidade (Q/W/E/R/passiva) — antes vinha tudo misturado
  // na mesma lista, na ordem em que o backend calculou o diff.
  const attributeChanges = changes.filter((c) => c.category === 'stat')
  const abilityChanges = changes.filter((c) => c.category !== 'stat')
  return (
    <div className="patch-change-card">
      <div className="patch-change-header">
        {meta && ddragonPatch && (
          <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={32} height={32} />
        )}
        <span>{meta?.name ?? championId}</span>
      </div>
      <ScoreImpactBadges rows={scoreDeltas} />
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
          <ul className="patch-change-list">
            {abilityChanges.map((change, index) => (
              <ChangeListItem
                key={index}
                change={change}
                abilityImage={abilityImageFor(change, detail)}
                ddragonPatch={ddragonPatch}
              />
            ))}
          </ul>
        </>
      )}
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
      <p>
        O que a Riot mudou de verdade neste patch, direto dos dados públicos do jogo — não é o texto
        oficial (esse fica só no site da Riot), mas os valores numéricos que de fato foram alterados.
        Alguns ajustes de proporção/escala não aparecem aqui porque a API pública da Riot não expõe
        esse dado; pra ver a nota completa, veja as{' '}
        <a href="https://www.leagueoflegends.com/en-us/news/tags/patch-notes/" target="_blank" rel="noreferrer">
          notas oficiais da Riot
        </a>.
      </p>

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
          <div className="patch-change-grid">
            {groupByChampion(myChanges.mudancas).map(([championId, rows]) => (
              <ChampionChangeCard
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
          <div className="section-divider" />
        </>
      )}

      {changesError && <p className="error" role="alert">Backend indisponível: {changesError}</p>}

      {changes && changes.patch_anterior && grouped && (
        <>
          <div className="patch-change-grid">
            {grouped.map(([championId, rows]) => (
              <ChampionChangeCard
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
          <TierChangeGroups rows={result.mudancas_tier} championsMeta={championsMeta} />
        </>
      )}
    </main>
  )
}

export default PatchNotesPage
