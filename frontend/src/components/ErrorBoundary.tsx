import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Item novo (revisão técnica §7.4): hoje um erro de render em qualquer
 *  página deixa a tela em branco sem mensagem — React não recupera
 *  sozinho de um erro síncrono durante o render, só um boundary de
 *  classe (não existe equivalente em hook) intercepta isso. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="center" role="alert">
          <h1>Algo deu errado</h1>
          <p className="error">
            A página encontrou um erro inesperado e não pode continuar. Tente recarregar.
          </p>
          <button type="button" className="player-search-submit" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </main>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
