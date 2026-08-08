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
            % dos top picks da rota com taxa de vitória saudável (≥50%) — quanto maior, mais rotas
            diferentes estão competitivas nesse patch.
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
