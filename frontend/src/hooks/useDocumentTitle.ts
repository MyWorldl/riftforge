import { useEffect } from 'react'

/** Item novo (revisão técnica §7.5): `<title>` era estático em todas as
 *  rotas (SPA sem SSR, então isso não vem de graça do `index.html`) —
 *  ruim pra aba do navegador e pra histórico/favoritos. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
