import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Pedido do usuário: só a estrutura visual — o RiftForge ainda não tem
 *  login/conta de verdade (nenhum backend de autenticação existe), os
 *  campos abaixo são a prévia do que a tela vai precisar quando essa
 *  funcionalidade for construída. Campos desabilitados de propósito,
 *  mesmo padrão de preview já usado no botão de Configurações antes
 *  desta página existir. */
function AccountPage() {
  useDocumentTitle('Minha Conta — RiftForge')
  return (
    <main className="center">
      <h1>Minha Conta</h1>
      <p>
        O RiftForge ainda não tem login nem contas de usuário de verdade — esta é só a estrutura
        visual de como a tela vai ficar quando essa parte for construída.
      </p>

      <form className="account-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Nome de usuário
          <input type="text" placeholder="Em breve" disabled />
        </label>
        <label>
          E-mail
          <input type="email" placeholder="Em breve" disabled />
        </label>
        <label>
          Senha
          <input type="password" placeholder="Em breve" disabled />
        </label>
        <button type="submit" className="player-search-submit" disabled>
          Salvar (em breve)
        </button>
      </form>
    </main>
  )
}

export default AccountPage
