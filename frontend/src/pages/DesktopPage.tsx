function DesktopPage() {
  return (
    <main className="center">
      <h1>Desktop</h1>
      <p>
        O RiftForge também roda como aplicativo de desktop (Windows), empacotado com Tauri e usando o
        mesmo backend do site.
      </p>
      <p>
        O instalador (MSI/NSIS) é gerado a partir do código-fonte em{' '}
        <code>frontend/src-tauri/</code> — veja as instruções de build na seção "Desktop" do{' '}
        <a
          href="https://github.com/MyWorldl/riftforge#readme"
          target="_blank"
          rel="noreferrer"
        >
          README do repositório
        </a>
        .
      </p>
    </main>
  )
}

export default DesktopPage
