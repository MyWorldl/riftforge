import { useDocumentTitle } from '../hooks/useDocumentTitle'

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

// A própria página de release do GitHub já mostra o digest de cada asset
// (aba "Assets" → ícone de informação) — o checksum aqui continua existindo
// pra quem quiser conferir sem sair desta página. Gerado com sha256sum
// sobre os artefatos antes de subir pra release (ver Sprint 2 item 15).
const CHECKSUMS_SHA256 = {
  exe: '4358d6cc59bb13325ecde859ea7703cb3d45270fe221b148462d33dc3ea13696',
  msi: 'ec654f938ccfd95c59fb91ad8406bcf353ddc89c6efb3f195db2bb7835b15dc7',
}

function DesktopPage() {
  useDocumentTitle('Desktop — RiftForge')
  return (
    <main className="center">
      <h1>Desktop</h1>
      <p>
        O RiftForge também roda como aplicativo de desktop (Windows), empacotado com Tauri e usando o
        mesmo backend do site.
      </p>

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

      <p className="download-checksums">
        SHA-256 (.exe): <code>{CHECKSUMS_SHA256.exe}</code>
        <br />
        SHA-256 (.msi): <code>{CHECKSUMS_SHA256.msi}</code>
      </p>

      <p>
        Prefere compilar você mesmo? O código-fonte fica em <code>frontend/src-tauri/</code> — veja
        as instruções de build na seção "Desktop" do{' '}
        <a href="https://github.com/MyWorldl/riftforge#readme" target="_blank" rel="noreferrer">
          README do repositório
        </a>
        .
      </p>
    </main>
  )
}

export default DesktopPage
