import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import heroImage from '../assets/hero.svg'
import FlagSelect from '../components/FlagSelect'
import { REGIONS } from '../constants/regions'
import {
  championImageUrl,
  fetchChampions,
  fetchMetaCoverage,
  fetchPatchNotes,
  type ChampionMeta,
  type MetaCoverageResult,
  type PatchNotesResult,
} from '../api/client'
import { LANE_LABELS } from '../components/championDisplay'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const DEFAULT_ELO_TIER = 'GOLD'

/** Sprint C item C3 (repaginação, pesquisa de design §2): mesmo estilo de
 *  ícone (stroke 16x16) já usado em `AppLayout.tsx` — duplicado aqui em
 *  vez de exportado de lá, mesmo padrão de duplicação local que
 *  `RecommendPage.tsx`/`ChampionsPage.tsx` já seguem pra ícones/constantes
 *  pequenas. `IconSwords` é novo: Matchups não tem ícone próprio ainda
 *  porque não fica na sidebar principal (só acessível via campeão). */
function IconShield() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path d="M8 1.5 13 3.5v4c0 3.5-2.2 5.8-5 7-2.8-1.2-5-3.5-5-7v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconWand() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path d="M2 14 10.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 1.5v2M15 3h-2M11.5 6.5v1.5M14 8h-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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

const SHORTCUTS = [
  { to: '/campeoes', label: 'Campeões', description: 'Placar de força por elo, rota e patch.', icon: <IconShield /> },
  { to: '/recomendacao', label: 'Recomendação', description: 'Diz sua rota e elo, a gente ranqueia.', icon: <IconWand /> },
  { to: '/classificacoes', label: 'Classificações', description: 'Top jogadores por região e tier apex.', icon: <IconTrophy /> },
  { to: '/matchups', label: 'Matchups', description: 'Confrontos favoráveis e desfavoráveis por campeão.', icon: <IconSwords /> },
  { to: '/jogador', label: 'Análise do Jogador', description: 'Seu histórico recente e roadmap de progressão.', icon: <IconUser /> },
]

/** Item novo (revisão técnica §6, Tier 1): "melhores subidas do patch" +
 *  "contexto por rota" — os dois já eram calculados (`/patch-notes` e
 *  `compute_meta.py`), só nunca tinham lugar na Home, que até aqui só
 *  tinha o formulário de busca. Falha em silêncio (o widget some) em vez
 *  de mostrar erro — a Home não deve quebrar por causa de um resumo
 *  opcional. */
function PatchHighlights() {
  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')
  const [patchNotes, setPatchNotes] = useState<PatchNotesResult | null>(null)
  const [coverage, setCoverage] = useState<MetaCoverageResult | null>(null)

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
    fetchMetaCoverage(DEFAULT_ELO_TIER)
      .then(setCoverage)
      .catch(() => setCoverage(null))
  }, [])

  const topAltas = patchNotes?.altas.slice(0, 5) ?? []
  const hasCoverage = (coverage?.cobertura.length ?? 0) > 0

  if (topAltas.length === 0 && !hasCoverage) return null

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

      {hasCoverage && (
        <div className="home-highlights-col">
          <h2>Cobertura de meta por rota</h2>
          <p className="explain-sub">
            Dos 10 campeões mais escolhidos em cada rota, quantos também estão vencendo mais da
            metade das partidas (≥50% de vitórias). 100% quer dizer que os campeões populares ali
            realmente são bons — quem todo mundo escolhe, funciona. Um número baixo quer dizer o
            contrário: boa parte do que está sendo escolhido está perdendo mais do que ganhando,
            sinal de que popularidade e força de campeão andam separadas nessa rota.
          </p>
          <ul className="home-coverage-list">
            {coverage?.cobertura
              .slice()
              .sort((a, b) => (LANE_LABELS[a.lane] ?? a.lane).localeCompare(LANE_LABELS[b.lane] ?? b.lane))
              .map((row) => (
                <li key={row.lane}>
                  <span className="home-coverage-label">{LANE_LABELS[row.lane] ?? row.lane}</span>
                  <span className="home-coverage-bar-cell">
                    <span className="home-coverage-bar" style={{ width: `${row.cobertura * 100}%` }} />
                  </span>
                  <span className="home-coverage-value">{(row.cobertura * 100).toFixed(0)}%</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function HomePage() {
  useDocumentTitle('RiftForge')
  const navigate = useNavigate()
  const [region, setRegion] = useState('br1')
  const [riotId, setRiotId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = riotId.trim()
    const hashIndex = trimmed.lastIndexOf('#')
    if (hashIndex <= 0 || hashIndex === trimmed.length - 1) {
      setFormError('Use o formato Nome#Tag (ex: Fulano#BR1).')
      return
    }
    setFormError(null)
    const gameName = trimmed.slice(0, hashIndex)
    const tagLine = trimmed.slice(hashIndex + 1)
    navigate(
      `/jogador?region=${encodeURIComponent(region)}&gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`,
    )
  }

  return (
    <main className="center">
      <div className="hero">
        <img src={heroImage} alt="RiftForge" className="hero-image" />
      </div>

      <p className="hero-tagline">
        Poder dos campeões de League of Legends por elo, rota e patch — score em camadas com tier God-E.
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

      <form className="player-search-form" onSubmit={handleSubmit}>
        <label>
          Região
          <FlagSelect options={REGIONS} value={region} onChange={setRegion} />
        </label>
        <label>
          Buscar
          <input
            type="text"
            placeholder="Nome de jogador + #BR1"
            value={riotId}
            onChange={(e) => setRiotId(e.target.value)}
          />
        </label>
        <button type="submit" className="player-search-submit">Buscar</button>
      </form>
      {formError && <p className="error">{formError}</p>}

      <PatchHighlights />
    </main>
  )
}

export default HomePage
