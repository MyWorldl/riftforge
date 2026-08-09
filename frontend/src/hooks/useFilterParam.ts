import { useSearchParams } from 'react-router-dom'

/** Sprint 4 item 18 (revisão técnica): filtros persistidos na URL —
 *  ChampionsPage/RankingsPage/RecommendPage passam a ler/escrever
 *  região/elo/rota/patch/busca via `useSearchParams`, mesmo padrão já
 *  usado em `ChampionDetailPage.tsx`. Sem isso, não dava pra compartilhar
 *  um link filtrado nem usar o botão voltar do navegador pra desfazer um
 *  filtro — cada página guardava o filtro só em `useState`, perdido a
 *  cada recarga.
 *
 *  `replace: true` de propósito: cada tecla digitada num campo de busca
 *  não deveria empilhar uma entrada de histórico por caractere — o
 *  histórico de navegação continua útil (entrar/sair da página, trocar
 *  de rota) sem virar ruído por causa de filtro. */
export function useFilterParam(key: string, defaultValue = ''): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? defaultValue

  function setValue(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next) params.set(key, next)
        else params.delete(key)
        return params
      },
      { replace: true },
    )
  }

  return [value, setValue]
}
