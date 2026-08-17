/** Espelha manualmente `TIER_THRESHOLDS` de
 * `backend/app/jobs/compute_scores.py` — do melhor pro pior. Sem arquivo
 * compartilhado entre Python e TS neste repo, mesma categoria de risco
 * de `LAYER_WEIGHTS` em `components/championDisplay.tsx` (também
 * duplicado do backend sem fonte única). Se a lista de tiers do backend
 * mudar, esta precisa mudar junto. Usado por `TierChangeSection.tsx`
 * (Patch Notes) pra ordenar mudança de tier melhor→pior. */
export const TIER_ORDER = ['GOD', 'S', 'A', 'B', 'C', 'D', 'E'] as const
