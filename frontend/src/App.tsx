import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChampionDetailPage from './pages/ChampionDetailPage'
import ChampionsPage from './pages/ChampionsPage'
import DesktopPage from './pages/DesktopPage'
import HomePage from './pages/HomePage'
import PatchNotesPage from './pages/PatchNotesPage'
import PlayerAnalysisPage from './pages/PlayerAnalysisPage'
import RankingsPage from './pages/RankingsPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/campeoes" element={<ChampionsPage />} />
        <Route path="/campeoes/:championId" element={<ChampionDetailPage />} />
        <Route path="/classificacoes" element={<RankingsPage />} />
        <Route path="/jogador" element={<PlayerAnalysisPage />} />
        <Route path="/patch-notes" element={<PatchNotesPage />} />
        <Route path="/desktop" element={<DesktopPage />} />
      </Route>
    </Routes>
  )
}

export default App
