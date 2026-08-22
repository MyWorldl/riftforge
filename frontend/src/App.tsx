import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import AccountPage from './pages/AccountPage'
import ChampionDetailPage from './pages/ChampionDetailPage'
import ChampionsPage from './pages/ChampionsPage'
import DesktopPage from './pages/DesktopPage'
import HomePage from './pages/HomePage'
import InvocadorPage from './pages/InvocadorPage'
import MatchupsPage from './pages/MatchupsPage'
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
        <Route path="/matchups/:championId?" element={<MatchupsPage />} />
        <Route path="/invocador" element={<InvocadorPage />} />
        <Route path="/jogador" element={<PlayerAnalysisPage />} />
        <Route path="/patch-notes" element={<PatchNotesPage />} />
        <Route path="/desktop" element={<DesktopPage />} />
        <Route path="/conta" element={<AccountPage />} />
      </Route>
    </Routes>
  )
}

export default App
