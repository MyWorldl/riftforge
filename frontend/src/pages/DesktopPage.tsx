// Servidos como asset estático do próprio site (frontend/public/downloads)
// em vez de GitHub Release — o repositório é privado, então um link de
// release não seria baixável por um visitante comum sem acesso ao repo.
const DOWNLOAD_BASE = '/downloads'

function DesktopPage() {
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
