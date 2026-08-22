/** Extraído de `HomePage.tsx` (ajuste 21/08) — passa a ser usado também
 *  por `PlayerSearchInput` (fallback de texto livre em Home/Invocador/
 *  Análise do Jogador), então precisa existir num lugar compartilhado em
 *  vez de duplicado por página. */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim()
  const hashIndex = trimmed.lastIndexOf('#')
  if (hashIndex <= 0 || hashIndex === trimmed.length - 1) return null
  return {
    gameName: trimmed.slice(0, hashIndex),
    tagLine: trimmed.slice(hashIndex + 1),
  }
}
