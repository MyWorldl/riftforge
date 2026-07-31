import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/campeoes', label: 'Campeões' },
  { to: '/classificacoes', label: 'Classificações' },
  { to: '/jogador', label: 'Análise do Jogador' },
  { to: '/patch-notes', label: 'Patch Notes' },
]

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AppLayout() {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <NavLink to="/" className="brand">RiftForge</NavLink>
        <nav className="top-bar-tabs">
          <span className="top-bar-tab top-bar-tab-active">League of Legends</span>
          <NavLink to="/desktop" className="top-bar-tab">Desktop</NavLink>
        </nav>

        <div className="top-bar-actions">
          <ThemeToggle />
          {/* Preview: configurações do site ainda não existem, botão fica
              desabilitado até a tela real ser construída. */}
          <button
            type="button"
            className="icon-toggle"
            disabled
            title="Configurações (em breve)"
            aria-label="Configurações (em breve)"
          >
            <IconSettings />
          </button>
        </div>
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
        <p>
          RiftForge não é endossado pela Riot Games e não reflete os pontos de vista ou opiniões da Riot
          Games ou de qualquer pessoa oficialmente envolvida na produção ou gerenciamento de League of
          Legends. League of Legends e Riot Games são marcas registradas ou marcas comerciais da Riot
          Games, Inc.
        </p>
        <p className="icon-credit">
          Ícone de bigorna por{' '}
          <a href="https://freeicons.io/profile/9950" target="_blank" rel="noreferrer">
            Muhammad Naufal Subhiansyah
          </a>{' '}
          via{' '}
          <a href="https://freeicons.io" target="_blank" rel="noreferrer">
            freeicons.io
          </a>
          .
        </p>
      </footer>
    </div>
  )
}

export default AppLayout
