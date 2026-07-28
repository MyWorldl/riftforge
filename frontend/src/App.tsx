import { useEffect, useState } from 'react'
import { fetchChampions, type ChampionsResponse } from './api/client'
import './App.css'

function App() {
  const [data, setData] = useState<ChampionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchChampions()
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main id="center">
      <h1>RiftForge</h1>
      <p>Análise de campeões de League of Legends por patch, elo e rota.</p>

      {error && <p role="alert">Backend indisponível: {error}</p>}
      {!error && !data && <p>Carregando campeões...</p>}
      {data && (
        <>
          <p>Patch: {data.patch}</p>
          <ul>
            {Object.values(data.champions)
              .slice(0, 10)
              .map((champion) => (
                <li key={champion.id}>
                  {champion.name} — {champion.title}
                </li>
              ))}
          </ul>
        </>
      )}
    </main>
  )
}

export default App
