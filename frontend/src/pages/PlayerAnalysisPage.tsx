import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  deletePlayerRoadmap,
  fetchChampions,
  fetchPlayerLookup,
  HttpError,
  type ChampionMeta,
  type PlayerLookupResult,
  type PlayerRoadmapStep,
} from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import RoadmapEvolutionChart from '../RoadmapEvolutionChart'
import PlayerSearchInput from '../components/PlayerSearchInput'
import CampeoesTab from '../components/playerProfile/CampeoesTab'
import EstiloTab from '../components/playerProfile/EstiloTab'
import MaestriaTab from '../components/playerProfile/MaestriaTab'
import PartidasTab from '../components/playerProfile/PartidasTab'
import SeasonProgressCard from '../components/playerProfile/SeasonProgressCard'
import { LANE_LABELS } from '../components/playerProfile/shared'

type TabKey = 'resumo' | 'campeoes' | 'maestria' | 'estilo' | 'partidas'

const TAB_ORDER: TabKey[] = ['resumo', 'campeoes', 'maestria', 'estilo', 'partidas']

const TAB_LABELS: Record<TabKey, string> = {
  resumo: 'Resumo',
  campeoes: 'Campeões',
  maestria: 'Maestria',
  estilo: 'Estilo',
  partidas: 'Partidas',
}

/** Revisão técnica 09/08 §2.3: token opaco do roadmap fica só no
 *  localStorage do próprio navegador — nunca é enviado a lugar nenhum
 *  além do `DELETE`, e nunca precisa de consentimento de cookie porque
 *  não é rastreamento. */
function roadmapTokenStorageKey(region: string, gameName: string, tagLine: string): string {
  return `riftforge:roadmap_token:${region}:${gameName}:${tagLine}`.toLowerCase()
}

/** Sprint B item 2 (revisão técnica §5.3): última identidade buscada, pra
 *  `PatchNotesPage.tsx` montar o bloco "Mudanças que te afetam" sem exigir
 *  nova busca. Mesma política de privacidade do token acima — só
 *  localStorage, nunca enviado a lugar nenhum além do próprio endpoint que
 *  o usuário já está chamando. */
export const LAST_IDENTITY_STORAGE_KEY = 'riftforge:last_identity'

function saveLastIdentity(region: string, gameName: string, tagLine: string): void {
  localStorage.setItem(LAST_IDENTITY_STORAGE_KEY, JSON.stringify({ region, gameName, tagLine }))
}

/** Roadmap de Progressão do Jogador (rodada 28) — passo ativo mostra o
 *  gap atual (sempre negativo, é isso que o qualifica pra virar passo)
 *  e a amostra que embasa ele. Reaproveita `.value-neg`/`.value-pos` já
 *  usados na tabela abaixo, mesma linguagem visual. Fica só nesta
 *  página (não em `components/playerProfile/`, ajuste 21/08) — a nova
 *  página Invocador migrou as outras abas, mas não o Roadmap, pedido
 *  explícito do usuário: "Análise do Jogador" continua sendo a página
 *  do Roadmap. */
function RoadmapStepRow({ step, done }: { step: PlayerRoadmapStep; done: boolean }) {
  return (
    <li className="roadmap-step">
      <span className="roadmap-step-champion">
        {step.champion_id} · {LANE_LABELS[step.lane] ?? step.lane}
      </span>
      <span className={done ? 'value-pos' : 'value-neg'}>
        {step.delta_pct_atual >= 0 ? '+' : ''}
        {step.delta_pct_atual.toFixed(1)}% WR vs. média do elo
      </span>
      <span className="explain-sub">{step.partidas_atual} partidas</span>
      {done && <span className="roadmap-step-done" title="Concluído">✓</span>}
    </li>
  )
}

/** Aba Resumo: identidade + progresso de temporada (snapshot mais
 *  recente, Sprint 4 bloco 2) + roadmap (movido pra cá, era a única
 *  seção da página antes das abas) + contagem rápida de selos MVP/ACE
 *  nas partidas analisadas. */
function ResumoTab({
  result,
  region,
  gameName,
  tagLine,
}: {
  result: PlayerLookupResult
  region: string
  gameName: string
  tagLine: string
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [roadmap, setRoadmap] = useState(result.roadmap)

  useEffect(() => setRoadmap(result.roadmap), [result])

  function handleDeleteRoadmap() {
    setDeleting(true)
    setDeleteError(null)
    const token = localStorage.getItem(roadmapTokenStorageKey(region, gameName, tagLine))
    deletePlayerRoadmap({ region, gameName, tagLine }, token)
      .then(() => {
        setRoadmap({ ativos: [], concluidos: [], roadmap_token: null })
        localStorage.removeItem(roadmapTokenStorageKey(region, gameName, tagLine))
        setConfirmingDelete(false)
      })
      .catch((err: Error) => setDeleteError(err.message))
      .finally(() => setDeleting(false))
  }

  const latestSnapshot = result.progresso_temporada.at(-1) ?? null
  const oldestSnapshot = result.progresso_temporada[0] ?? null
  const mvpCount = result.partidas.filter((p) => p.badge === 'mvp').length
  const aceCount = result.partidas.filter((p) => p.badge === 'ace').length

  return (
    <div>
      {latestSnapshot && <SeasonProgressCard latestSnapshot={latestSnapshot} oldestSnapshot={oldestSnapshot} />}

      {(mvpCount > 0 || aceCount > 0) && (
        <p className="table-caption">
          Nas últimas {result.partidas.length} partidas: {mvpCount} MVP{mvpCount === 1 ? '' : 's'}, {aceCount} ACE{aceCount === 1 ? '' : 's'}
        </p>
      )}

      <section className="roadmap-section">
        <div className="roadmap-section-header">
          <h2>Seu roadmap</h2>
          {(roadmap.ativos.length > 0 || roadmap.concluidos.length > 0) && (
            <button
              type="button"
              className="roadmap-delete-toggle"
              onClick={() => setConfirmingDelete((v) => !v)}
            >
              Apagar meu roadmap
            </button>
          )}
        </div>

        {confirmingDelete && (
          <div className="roadmap-delete-confirm" role="alertdialog">
            <p>Isso apaga permanentemente todos os passos do seu roadmap. Não pode ser desfeito.</p>
            {deleteError && <p className="error" role="alert">{deleteError}</p>}
            <div className="roadmap-delete-actions">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancelar
              </button>
              <button
                type="button"
                className="roadmap-delete-confirm-btn"
                onClick={handleDeleteRoadmap}
                disabled={deleting}
              >
                {deleting ? 'Apagando...' : 'Sim, apagar meu roadmap'}
              </button>
            </div>
          </div>
        )}

        {roadmap.ativos.length === 0 && roadmap.concluidos.length === 0 ? (
          <p className="empty-state">
            Nenhum passo no roadmap ainda — jogue mais partidas com campeões abaixo da média do seu
            elo pra receber sugestões de foco aqui.
          </p>
        ) : (
          <>
            {roadmap.ativos.length > 0 && (
              <ul className="roadmap-list">
                {roadmap.ativos.map((step) => (
                  <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={false} />
                ))}
              </ul>
            )}
            {roadmap.concluidos.length > 0 && (
              <>
                <h3 className="roadmap-concluidos-title">Concluídos</h3>
                <ul className="roadmap-list roadmap-list-done">
                  {roadmap.concluidos.map((step) => (
                    <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={true} />
                  ))}
                </ul>
              </>
            )}
            <RoadmapEvolutionChart ativos={roadmap.ativos} concluidos={roadmap.concluidos} />
          </>
        )}
      </section>
    </div>
  )
}

function PlayerAnalysisPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const region = searchParams.get('region')
  const gameName = searchParams.get('gameName')
  const tagLine = searchParams.get('tagLine')

  useDocumentTitle(gameName && tagLine ? `${gameName}#${tagLine} — RiftForge` : 'Análise do Jogador — RiftForge')

  const [result, setResult] = useState<PlayerLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('resumo')

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
    if (!region || !gameName || !tagLine) return
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setResult(null)
    setActiveTab('resumo')
    fetchPlayerLookup({ region, gameName, tagLine })
      .then((data) => {
        setResult(data)
        saveLastIdentity(region, gameName, tagLine)
        if (data.roadmap.roadmap_token) {
          localStorage.setItem(roadmapTokenStorageKey(region, gameName, tagLine), data.roadmap.roadmap_token)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 501) {
          setUnavailable(true)
          return
        }
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      })
      .finally(() => setLoading(false))
  }, [region, gameName, tagLine])

  function goToPlayer(targetRegion: string, targetGameName: string, targetTagLine: string) {
    navigate(
      `/jogador?region=${encodeURIComponent(targetRegion)}&gameName=${encodeURIComponent(targetGameName)}&tagLine=${encodeURIComponent(targetTagLine)}`,
    )
  }

  return (
    <main className="center">
      <h1>Análise do Jogador</h1>

      {/* Ajuste 21/08: busca própria na página, sem precisar voltar pra
          Home — pedido explícito do usuário. */}
      <PlayerSearchInput
        region={region ?? undefined}
        ddragonPatch={ddragonPatch}
        showSubmitButton
        onSelect={(row) => goToPlayer(row.region, row.game_name, row.tag_line)}
        onSubmitFreeText={(parsed) => {
          if (parsed) goToPlayer(region ?? 'br1', parsed.gameName, parsed.tagLine)
        }}
      />

      {!gameName || !tagLine ? (
        <p className="placeholder-page">Busque um jogador acima pra ver a análise aqui.</p>
      ) : (
        <>
          <p>
            <strong>{gameName}#{tagLine}</strong>
          </p>

          {loading && <p className="filters-loading" role="status">Buscando...</p>}

          {unavailable && (
            <p className="empty-state">
              Análise de jogador ainda não disponível em produção — essa busca faz chamadas em tempo real
              à Riot API, que só podem ir ao ar depois que a Production Key for aprovada. Funciona em
              desenvolvimento local com uma chave própria.
            </p>
          )}

          {error && <p className="error" role="alert">Não foi possível buscar esse jogador: {error}</p>}

          {result && (
            <>
              <p className="table-caption">
                {result.partidas_analisadas} partidas recentes analisadas · comparado contra o elo{' '}
                {result.elo_tier_comparado}
                {result.elo_tier_detectado ? (
                  <span className="explain-sub"> (detectado via ranked solo/duo)</span>
                ) : (
                  <span className="explain-sub"> (padrão — sem entrada ranqueada em solo/duo detectada)</span>
                )}
              </p>

              <div className="detail-tabs">
                {TAB_ORDER.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`detail-tab ${activeTab === tab ? 'detail-tab-active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>

              <div className="detail-tab-panel">
                {activeTab === 'resumo' && (
                  <ResumoTab result={result} region={region ?? ''} gameName={gameName} tagLine={tagLine} />
                )}
                {activeTab === 'campeoes' && (
                  <CampeoesTab campeoes={result.campeoes} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
                )}
                {activeTab === 'maestria' && (
                  <MaestriaTab
                    region={region ?? ''}
                    gameName={gameName}
                    tagLine={tagLine}
                    championsMeta={championsMeta}
                    ddragonPatch={ddragonPatch}
                  />
                )}
                {activeTab === 'estilo' && <EstiloTab partidas={result.partidas} />}
                {activeTab === 'partidas' && (
                  <PartidasTab partidas={result.partidas} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}

export default PlayerAnalysisPage
