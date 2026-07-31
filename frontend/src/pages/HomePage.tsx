import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import heroImage from '../assets/hero.svg'
import { REGIONS } from '../constants/regions'

function HomePage() {
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
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
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
    </main>
  )
}

export default HomePage
