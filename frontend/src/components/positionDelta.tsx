/** Selo de variação de posição (▲/▼ + quantas posições, "=" pra sem
 *  mudança) — usado junto do número da posição (`.posicao-cell`) em toda
 *  página que mostra ranking com histórico (Campeões, Classificações).
 *  Ajuste 22/08 (pedido do usuário): extraído de `ChampionsPage.tsx` pra
 *  cá pra virar a ÚNICA implementação — antes cada página tinha a sua
 *  própria cópia (`VariationBadge`/`DeltaPositionBadge`, símbolos e
 *  estrutura de coluna diferentes), o que gerou a inconsistência que o
 *  usuário pediu pra corrigir. Qualquer página nova com esse tipo de
 *  variação deve reaproveitar este componente, não duplicar de novo. */
export function PositionDeltaBadge({ posicao }: { posicao: number | null | undefined }) {
  if (posicao === undefined || posicao === null || posicao === 0) {
    return <span className="delta-position delta-position-none">=</span>
  }
  const subiu = posicao > 0
  return (
    <span className={`delta-position ${subiu ? 'delta-position-up' : 'delta-position-down'}`}>
      {subiu ? '▲' : '▼'}
      {Math.abs(posicao)}
    </span>
  )
}
