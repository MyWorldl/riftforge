import { useDocumentTitle } from '../hooks/useDocumentTitle'
import desktopHero from '../assets/desktop-hero.svg'

// Sprint 2 item 15 (revisão técnica §2.6): servido via GitHub Release em
// vez de asset estático do site — o repositório é público desde rodada 29,
// então o link de release funciona pra qualquer visitante sem precisar de
// acesso ao repo. `/releases/latest/download/<nome-do-arquivo>` sempre
// resolve pro asset da release mais recente com esse nome exato (redirect
// do próprio GitHub, sem precisar de chamada à API) — trocar de versão no
// futuro é só publicar uma release nova com os mesmos nomes de arquivo (ou
// atualizar esses dois nomes junto com a versão). Tira 34 MB do bundle do
// site e do histórico de deploy; o binário antigo commitado continua no
// histórico do git (limpar exigiria `git filter-repo`, fora de escopo).
const DOWNLOAD_BASE = 'https://github.com/MyWorldl/riftforge/releases/latest/download'

function DesktopPage() {
  useDocumentTitle('Desktop — RiftForge')
  return (
    <main className="center">
      <h1>Desktop</h1>

      <img src={desktopHero} alt="" className="desktop-hero-image" width={260} height={180} />

      <div className="download-buttons">
        <a className="download-button" href={`${DOWNLOAD_BASE}/RiftForge_0.1.0_x64-setup.exe`}>
          Baixar instalador (.exe)
        </a>
        <a className="download-button download-button-secondary" href={`${DOWNLOAD_BASE}/RiftForge_0.1.0_x64_en-US.msi`}>
          Baixar instalador (.msi)
        </a>
      </div>

      <p className="download-note">
        Windows 64-bit. Os dois instalam a mesma versão (v0.1.0) — use o .exe se não tiver
        preferência, ou o .msi se seu ambiente exigir esse formato (ex: instalação via política de
        grupo).
      </p>

      {/* Ajuste 21/08 (2ª rodada): descida pra baixo dos instaladores,
          pedido do usuário — a página abre direto no CTA de download, a
          explicação fica pra quem rolar a página. */}
      <p>
        Leve o RiftForge pra área de trabalho: a mesma análise de campeões, patch notes e
        classificações do site, num app leve que abre com um clique — sem precisar de aba de
        navegador aberta.
      </p>
    </main>
  )
}

export default DesktopPage
