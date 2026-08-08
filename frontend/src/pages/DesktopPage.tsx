import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Servidos como asset estático do próprio site (frontend/public/downloads)
// em vez de GitHub Release — o repositório é privado, então um link de
// release não seria baixável por um visitante comum sem acesso ao repo.
const DOWNLOAD_BASE = '/downloads'

// Revisão técnica §2.6: sem GitHub Releases (repo privado), não existe uma
// verificação de integridade automática como a que a própria plataforma
// ofereceria — o checksum publicado ao lado do link é a alternativa manual,
// pra quem quiser conferir que o arquivo baixado é exatamente o que foi
// gerado, sem depender de mudar a hospedagem pra isso.
// Gerado com sha256sum sobre os artefatos de frontend/public/downloads.
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
