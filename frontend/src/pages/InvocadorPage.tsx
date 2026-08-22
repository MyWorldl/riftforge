import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchChampions, fetchPlayerLookup, HttpError, type ChampionMeta, type PlayerLookupResult } from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import PlayerSearchInput from '../components/PlayerSearchInput'
import CampeoesTab from '../components/playerProfile/CampeoesTab'
import EstiloTab from '../components/playerProfile/EstiloTab'
import MaestriaTab from '../components/playerProfile/MaestriaTab'
import PartidasTab from '../components/playerProfile/PartidasTab'
import SeasonProgressCard from '../components/playerProfile/SeasonProgressCard'

type TabKey = 'resumo' | 'campeoes' | 'maestria' | 'estilo' | 'partidas'

const TAB_ORDER: TabKey[] = ['resumo', 'campeoes', 'maestria', 'estilo', 'partidas']

const TAB_LABELS: Record<TabKey, string> = {
  resumo: 'Resumo',
  campeoes: 'Campeões',
  maestria: 'Maestria',
  estilo: 'Estilo',
  partidas: 'Partidas',
}

/** Aba Resumo do Invocador — deliberadamente mais enxuta que a de
 *  "Análise do Jogador" (ajuste 21/08, pedido do usuário): só o card de
 *  Progresso na Temporada (com badge de elo, sem a ressalva "sem
 *  histórico retroativo" — toda primeira busca aqui mostraria o mesmo
 *  aviso, vira ruído) e a contagem de MVP/ACE. SEM Roadmap — essa é a
 *  diferença central entre as duas páginas: Invocador é pra ver o
 *  perfil de QUALQUER jogador (o seu incluso), Análise do Jogador
 *  continua sendo a página de acompanhamento/coaching do seu próprio
 *  progresso. */
function ResumoTab({ result }: { result: PlayerLookupResult }) {
  const latestSnapshot = result.progresso_temporada.at(-1) ?? null
  const mvpCount = result.partidas.filter((p) => p.badge === 'mvp').length
  const aceCount = result.partidas.filter((p) => p.badge === 'ace').length

  return (
    <div>
      {latestSnapshot && <SeasonProgressCard latestSnapshot={latestSnapshot} oldestSnapshot={null} showEloBadge showRetroactiveNote={false} />}

      {(mvpCount > 0 || aceCount > 0) && (
        <p className="table-caption">
          Nas últimas {result.partidas.length} partidas: {mvpCount} MVP{mvpCount === 1 ? '' : 's'}, {aceCount} ACE{aceCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

/** Página "Invocador" (ajuste 21/08, nova): perfil geral de qualquer
 *  jogador (o próprio incluso) — mesmas abas de "Análise do Jogador"
 *  menos o Roadmap. Deliberadamente NÃO chama `saveLastIdentity`/não
 *  persiste `roadmap_token`: essas duas coisas alimentam "Mudanças que
 *  te afetam" (Patch Notes) e a exclusão do Roadmap, ambas sobre o
 *  jogador que VOCÊ acompanha — sobrescrever isso com o perfil de
 *  qualquer pessoa que alguém buscar aqui quebraria essa feature pro
 *  jogador errado. */
function InvocadorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const region = searchParams.get('region')
  const gameName = searchParams.get('gameName')
  const tagLine = searchParams.get('tagLine')

  useDocumentTitle(gameName && tagLine ? `${gameName}#${tagLine} — RiftForge` : 'Invocador — RiftForge')

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
      .then(setResult)
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
      `/invocador?region=${encodeURIComponent(targetRegion)}&gameName=${encodeURIComponent(targetGameName)}&tagLine=${encodeURIComponent(targetTagLine)}`,
    )
  }

  return (
    <main className="center">
      <h1>Invocador</h1>

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
        <p className="placeholder-page">Busque um jogador acima pra ver o perfil aqui.</p>
      ) : (
        <>
          <p>
            <strong>{gameName}#{tagLine}</strong>
          </p>

          {loading && <p className="filters-loading" role="status">Buscando...</p>}

          {unavailable && (
            <p className="empty-state">
              Perfil de jogador ainda não disponível em produção — essa busca faz chamadas em tempo real
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
                {activeTab === 'resumo' && <ResumoTab result={result} />}
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
                    showAccumulatingCaption={false}
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

export default InvocadorPage
