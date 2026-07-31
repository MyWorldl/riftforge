import { NavLink, Outlet } from 'react-router-dom'

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/campeoes', label: 'Campeões' },
  { to: '/classificacoes', label: 'Classificações' },
  { to: '/jogador', label: 'Análise do Jogador' },
  { to: '/patch-notes', label: 'Patch Notes' },
]

function AppLayout() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <NavLink to="/" className="brand">RiftForge</NavLink>
        <nav className="top-bar-tabs">
          <span className="top-bar-tab top-bar-tab-active">League of Legends</span>
          <NavLink to="/desktop" className="top-bar-tab">Desktop</NavLink>
        </nav>
      </header>

      <nav className="nav-row">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />

      <footer className="riot-disclaimer">
        RiftForge não é endossado pela Riot Games e não reflete os pontos de vista ou opiniões da Riot
        Games ou de qualquer pessoa oficialmente envolvida na produção ou gerenciamento de League of
        Legends. League of Legends e Riot Games são marcas registradas ou marcas comerciais da Riot
        Games, Inc.
      </footer>
    </div>
  )
}

export default AppLayout
