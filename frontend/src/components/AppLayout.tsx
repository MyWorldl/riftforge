import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

function IconHome() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 7.5 8 2l6 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3.5 6.5V13.5a.5.5 0 0 0 .5.5h3v-4h2v4h3a.5.5 0 0 0 .5-.5V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 1.5 13 3.5v4c0 3.5-2.2 5.8-5 7-2.8-1.2-5-3.5-5-7v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconTrophy() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4.5 2.5h7v3.5a3.5 3.5 0 0 1-7 0v-3.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <path d="M4.5 3.5h-2v1.5a2 2 0 0 0 2 2M11.5 3.5h2v1.5a2 2 0 0 1-2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M8 9.5v2M6 14.5h4M6.5 12.5h3l.5 2h-4l.5-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconWand() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 14 10.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 1.5v2M15 3h-2M11.5 6.5v1.5M14 8h-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M2.8 14c0-2.9 2.3-4.8 5.2-4.8s5.2 1.9 5.2 4.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function IconFileText() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4 1.5h6l2.5 2.5V14a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
      <path d="M5.5 7.5h5M5.5 10h5M5.5 5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

const NAV_ITEMS: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: <IconHome />, end: true },
  { to: '/campeoes', label: 'Campeões', icon: <IconShield /> },
  { to: '/recomendacao', label: 'Recomendação', icon: <IconWand /> },
  { to: '/classificacoes', label: 'Classificações', icon: <IconTrophy /> },
  { to: '/jogador', label: 'Análise do Jogador', icon: <IconUser /> },
  { to: '/patch-notes', label: 'Patch Notes', icon: <IconFileText /> },
]

function IconChevronDown() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconDesktop() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <path d="M6 14h4M8 11v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

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
      {/* Sprint 4 item 21 (revisão técnica §7.4, acessibilidade): sem isso,
          quem navega por teclado precisava passar por marca + 2 <nav> +
          tema + configurações antes de chegar no conteúdo real de CADA
          página — invisível até receber foco, visível (posicionado sobre
          o header) quando o Tab chega nele.

          `onClick` com `preventDefault` em vez de deixar o `href="#..."`
          nativo agir: o app usa `HashRouter` (rotas vivem em
          `window.location.hash`), então um link de âncora comum pra
          `#main-content` seria interpretado como troca de ROTA pelo
          React Router, não como salto de foco na mesma página — o clique
          não fazia nada de visível (nem navegava, nem focava). Foco
          manual via `.focus()` funciona nos dois tipos de router. */}
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>

      <header className="top-bar">
        <NavLink to="/" className="brand">RiftForge</NavLink>
        <nav className="top-bar-tabs" aria-label="Seções">
          <span className="top-bar-game-selector">
            League of Legends
            <IconChevronDown />
          </span>
          <NavLink
            to="/desktop"
            className="top-bar-desktop-link"
            title="Baixar o RiftForge para desktop"
          >
            <IconDesktop />
            Desktop
          </NavLink>
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

      <nav className="nav-row" aria-label="Principal">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Alvo do skip-link acima — `tabIndex={-1}` pra receber foco
          programático sem entrar na ordem normal de Tab (não é um link
          nem controle real, só o ponto de pouso). Cada página continua
          renderizando seu próprio `<main>`; este `span` fica antes dele
          de propósito, sem envolvê-lo, pra não mexer no layout flex do
          `.app-shell` (um wrapper por cima do `<main>` quebraria o
          `flex: 1` que `.center` depende). */}
      <span id="main-content" tabIndex={-1} className="skip-link-target" />
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
          . Bandeiras de região por{' '}
          <a href="https://github.com/lipis/flag-icons" target="_blank" rel="noreferrer">
            flag-icons
          </a>{' '}
          (MIT).
        </p>
      </footer>
    </div>
  )
}

export default AppLayout
