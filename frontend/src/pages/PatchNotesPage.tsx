import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchChampionAbilities,
  fetchChampions,
  fetchPatchChanges,
  fetchPatchNotes,
  type ChampionDetail,
  type ChampionMeta,
  type PatchChangesResult,
  type PatchNotesResult,
} from '../api/client'
import { buildScoreDeltaIndex, ChangesByCategory, groupByChampion } from '../components/patchNotes/CategoryChanges'
import { DeltaTable, TierChangeGroups } from '../components/patchNotes/TierChangeSection'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { LAST_IDENTITY_STORAGE_KEY } from './PlayerAnalysisPage'

/** Sprint 6 (dívida estrutural, 16/08): este arquivo passava de 1.150
 *  linhas — a lógica de classificação Buff/Nerf/Ajuste foi pra
 *  `lib/patchChangeClassification.ts` (pura, sem React) e as duas
 *  seções grandes da página pra `components/patchNotes/` (mesmo
 *  comportamento de antes, só reorganizado). O que sobra aqui é busca
 *  de dado + composição do layout. */

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
          {/* Ajuste 21/08 (2ª rodada): as duas listas ficam lado a lado
              (pedido do usuário), não empilhadas — `.delta-card-columns`
              volta pra coluna única em telas estreitas, mesmo padrão de
              breakpoint já usado em `.filters`. */}
          <div className="delta-card-columns">
            <DeltaTable title="Maiores altas" rows={result.altas} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
            <DeltaTable title="Maiores quedas" rows={result.quedas} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
          </div>
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
