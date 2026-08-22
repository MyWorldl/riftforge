import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import heroImage from '../assets/hero.svg'
import FlagSelect from '../components/FlagSelect'
import PlayerSearchInput from '../components/PlayerSearchInput'
import { REGIONS } from '../constants/regions'
import {
  championImageUrl,
  fetchChampions,
  fetchChampionScores,
  fetchPatchNotes,
  fetchRankings,
  type ChampionMeta,
  type ChampionScoreRow,
  type PatchNotesResult,
  type RankingRow,
} from '../api/client'
import { LANE_LABELS } from '../components/championDisplay'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const DEFAULT_ELO_TIER = 'GOLD'
const LANE_ORDER = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
// Pedido do usuário: "melhores jogadores da região do usuário atual" — sem
// conta/login ainda pra saber a região de verdade, usa BR fixo (a única
// região com coleta de ranking madura hoje).
const BEST_PLAYERS_REGION = 'br1'

/** Sprint C item C3 (repaginação, pesquisa de design §2): mesmo estilo de
 *  ícone (stroke 16x16) já usado em `AppLayout.tsx` — duplicado aqui em
 *  vez de exportado de lá, mesmo padrão de duplicação local que
 *  `ChampionsPage.tsx` já segue pra ícones/constantes pequenas.
 *  `IconSwords` é novo: Matchups não tem ícone próprio ainda porque não
 *  fica na sidebar principal (só acessível via campeão). */
function IconShield() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path d="M8 1.5 13 3.5v4c0 3.5-2.2 5.8-5 7-2.8-1.2-5-3.5-5-7v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconTrophy() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path d="M4.5 2.5h7v3.5a3.5 3.5 0 0 1-7 0v-3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <path d="M4.5 3.5h-2v1.5a2 2 0 0 0 2 2M11.5 3.5h2v1.5a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M8 9.5v2M6 14.5h4M6.5 12.5h3l.5 2h-4l.5-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconSwords() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path d="M2 2 9 9M9 9v3.5L11 14l1-1-1.5-2H9M6.5 6.5 5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M14 2 7 9M7 9v3.5L5 14l-1-1 1.5-2H7M9.5 6.5 11 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M2.8 14c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Ajuste 21/08 (página Invocador, nova) — mesmo ícone de lupa de
 *  `AppLayout.tsx::IconSearch`, duplicado aqui (mesmo padrão local já
 *  seguido pelos outros ícones deste arquivo). */
function IconSearch() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M10.3 10.3 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const SHORTCUTS = [
  { to: '/campeoes', label: 'Campeões', description: 'Placar de força por elo, rota e patch.', icon: <IconShield /> },
  { to: '/classificacoes', label: 'Classificações', description: 'Top jogadores por região e tier apex.', icon: <IconTrophy /> },
  { to: '/matchups', label: 'Matchups', description: 'Confrontos favoráveis e desfavoráveis por campeão.', icon: <IconSwords /> },
  { to: '/invocador', label: 'Invocador', description: 'Veja o perfil de qualquer jogador, o seu incluso.', icon: <IconSearch /> },
  { to: '/jogador', label: 'Análise do Jogador', description: 'Seu histórico recente e roadmap de progressão.', icon: <IconUser /> },
]

/** Pega o campeão de maior `score_final` por rota — base do painel
 *  "Melhores campeões atuais de cada rota" (substituiu "Cobertura de
 *  meta", pedido do usuário). `LANE_ORDER` garante a ordem fixa
 *  Topo/Selva/Meio/Atirador/Suporte independente da ordem que o
 *  backend devolveu as linhas. */
function bestChampionPerLane(scores: ChampionScoreRow[] | null): [string, ChampionScoreRow][] {
  if (!scores) return []
  const best = new Map<string, ChampionScoreRow>()
  for (const row of scores) {
    const current = best.get(row.lane)
    if (!current || row.score_final > current.score_final) best.set(row.lane, row)
  }
  return LANE_ORDER.filter((lane) => best.has(lane)).map((lane) => [lane, best.get(lane) as ChampionScoreRow])
}

/** Item novo (revisão técnica §6, Tier 1): "melhores subidas do patch" +
 *  contexto adicional — os dados já eram calculados noutro lugar (`/patch-
 *  notes`, `/scores/champions`, `/rankings`), só nunca tinham lugar na
 *  Home, que até aqui só tinha o formulário de busca. Falha em silêncio
 *  (a coluna some) em vez de mostrar erro — a Home não deve quebrar por
 *  causa de um resumo opcional. Pedido do usuário: "Cobertura de meta"
 *  virou "Melhores campeões atuais de cada rota", e uma terceira coluna
 *  ("Melhores jogadores") entrou ao lado de "Maiores altas". */
function PatchHighlights() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')
  const [patchNotes, setPatchNotes] = useState<PatchNotesResult | null>(null)
  const [laneScores, setLaneScores] = useState<ChampionScoreRow[] | null>(null)
  const [topPlayers, setTopPlayers] = useState<RankingRow[] | null>(null)

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
    fetchPatchNotes(DEFAULT_ELO_TIER)
      .then(setPatchNotes)
      .catch(() => setPatchNotes(null))
    fetchChampionScores({ eloTier: DEFAULT_ELO_TIER })
      .then(setLaneScores)
      .catch(() => setLaneScores(null))
    fetchRankings({ region: BEST_PLAYERS_REGION })
      .then((rows) => setTopPlayers(rows.slice(0, 5)))
      .catch(() => setTopPlayers(null))
  }, [])

  const topAltas = patchNotes?.altas.slice(0, 5) ?? []
  const bestByLane = bestChampionPerLane(laneScores)
  const hasTopPlayers = (topPlayers?.length ?? 0) > 0

  if (topAltas.length === 0 && bestByLane.length === 0 && !hasTopPlayers) return null

  return (
    <div className="home-highlights">
      {topAltas.length > 0 && (
        <div className="home-highlights-col">
          <h2>Maiores altas do patch {patchNotes?.patch_atual}</h2>
          <ul className="home-highlights-list">
            {topAltas.map((row) => {
              const meta = championsMeta?.[row.champion_id]
              return (
                <li key={`${row.champion_id}-${row.lane}`}>
                  {meta && ddragonPatch && (
                    <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={28} height={28} />
                  )}
                  <span className="home-highlights-name">{meta?.name ?? row.champion_id}</span>
                  <span className="explain-sub">{LANE_LABELS[row.lane] ?? row.lane}</span>
                  <span className="value-pos">+{row.delta.toFixed(1)}</span>
                </li>
              )
            })}
          </ul>
          <Link to="/patch-notes" className="home-highlights-link">Ver tudo →</Link>
        </div>
      )}

      {hasTopPlayers && (
        <div className="home-highlights-col">
          <h2>Melhores jogadores (BR)</h2>
          <ul className="home-highlights-list">
            {(topPlayers ?? []).map((row) => (
              <li key={`${row.tier}-${row.rank_position}`}>
                <span className="home-highlights-rank">#{row.rank_position}</span>
                <span className="home-highlights-name">
                  {row.game_name ?? '—'}
                  {row.tag_line ? `#${row.tag_line}` : ''}
                </span>
                <span className="explain-sub">{row.league_points} LP</span>
              </li>
            ))}
          </ul>
          <Link to="/classificacoes" className="home-highlights-link">Ver tudo →</Link>
        </div>
      )}

      {bestByLane.length > 0 && (
        <div className="home-highlights-col">
          <h2>Melhores campeões atuais de cada rota</h2>
          <ul className="home-highlights-list">
            {bestByLane.map(([lane, row]) => {
              const meta = championsMeta?.[row.champion_id]
              return (
                <li key={lane}>
                  {meta && ddragonPatch && (
                    <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={28} height={28} />
                  )}
                  <span className="home-highlights-name">{meta?.name ?? row.champion_id}</span>
                  <span className="explain-sub">{LANE_LABELS[lane] ?? lane}</span>
                  <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                </li>
              )
            })}
          </ul>
          <Link to="/campeoes" className="home-highlights-link">Ver tudo →</Link>
        </div>
      )}
    </div>
  )
}

function HomePage() {
  useDocumentTitle('RiftForge')
  const navigate = useNavigate()
  const [region, setRegion] = useState('br1')
  const [formError, setFormError] = useState<string | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')

  // Ajuste 21/08 (2ª rodada): só pro ícone de invocador nas sugestões
  // de `PlayerSearchInput` — `PatchHighlights` abaixo já busca isso
  // também, mas é local àquele componente; mais barato duplicar 1
  // chamada (cacheada pelo navegador) do que replumbar o estado entre
  // os dois.
  useEffect(() => {
    fetchChampions()
      .then((data) => setDdragonPatch(data.patch))
      .catch(() => {})
  }, [])

  // Ajuste 21/08: busca "conforme digita" (`PlayerSearchInput`) — leva
  // pro Invocador (perfil geral de qualquer jogador), não mais direto
  // pra Análise do Jogador. Texto livre "Nome#Tag" continua funcionando
  // como fallback pra quem não está entre os jogadores já indexados.
  function goToPlayer(targetRegion: string, gameName: string, tagLine: string) {
    setFormError(null)
    navigate(
      `/invocador?region=${encodeURIComponent(targetRegion)}&gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`,
    )
  }

  return (
    <main className="center">
      <div className="hero">
        <img src={heroImage} alt="RiftForge" className="hero-image" />
      </div>

      {/* Pedido do usuário: texto de boas-vindas de verdade (é a Home),
          no máximo 2 linhas — antes ia direto pra explicação técnica do
          score, sem nenhum acolhimento antes disso. */}
      <p className="hero-tagline">
        Bem-vindo ao RiftForge! O jeito mais rápido de saber quem está forte agora,
        por elo, rota e patch.
      </p>

      <nav className="home-shortcuts" aria-label="Atalhos">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to} className="home-shortcut-card">
            <span className="home-shortcut-icon">{s.icon}</span>
            <span className="home-shortcut-label">{s.label}</span>
            <span className="home-shortcut-description">{s.description}</span>
          </Link>
        ))}
      </nav>

      <div className="player-search-form">
        <label>
          Região
          <FlagSelect options={REGIONS} value={region} onChange={setRegion} />
        </label>
        <label>
          Buscar
          <PlayerSearchInput
            region={region}
            ddragonPatch={ddragonPatch}
            showSubmitButton
            onSelect={(row) => goToPlayer(row.region, row.game_name, row.tag_line)}
            onSubmitFreeText={(parsed) => {
              if (parsed) goToPlayer(region, parsed.gameName, parsed.tagLine)
              else setFormError('Use o formato Nome#Tag (ex: Fulano#BR1) ou escolha uma sugestão.')
            }}
          />
        </label>
      </div>
      {formError && <p className="error">{formError}</p>}

      <PatchHighlights />
    </main>
  )
}

export default HomePage
