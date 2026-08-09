import type { ChampionScoreRow, KitProfileRow } from '../api/client'

/** Espelha manualmente `TIER_THRESHOLDS` de
 * `backend/app/jobs/compute_scores.py` — do melhor pro pior. Sem arquivo
 * compartilhado entre Python e TS neste repo, mesma categoria de risco
 * de `LAYER_WEIGHTS` em `components/championDisplay.tsx` (também
 * duplicado do backend sem fonte única). Se a lista de tiers do backend
 * mudar, esta precisa mudar junto. */
export const TIER_ORDER = ['GOD', 'S', 'A', 'B', 'C', 'D', 'E'] as const

export type Tier = (typeof TIER_ORDER)[number]

/** Tier desconhecido (dado corrompido/versão divergente) nunca passa no
 * filtro em vez de lançar — mesma filosofia de fallback silencioso já
 * usada em `meetsMinTier`'s chamadores. */
export function meetsMinTier(scoreTier: string, minTier: string): boolean {
  const scoreIndex = TIER_ORDER.indexOf(scoreTier as Tier)
  const minIndex = TIER_ORDER.indexOf(minTier as Tier)
  if (scoreIndex === -1 || minIndex === -1) return false
  return scoreIndex <= minIndex
}

export interface PlaystylePreference {
  dano: number
  alcance: number
  resiliencia: number
}

export const DEFAULT_PLAYSTYLE: PlaystylePreference = { dano: 5, alcance: 5, resiliencia: 5 }

export interface RankedChampion {
  row: ChampionScoreRow
  kit: KitProfileRow | null
  distance: number | null
}

function kitDistance(kit: KitProfileRow, preference: PlaystylePreference): number | null {
  if (kit.dano_score == null || kit.alcance_score == null || kit.resiliencia_score == null) {
    return null
  }
  const dDano = kit.dano_score - preference.dano
  const dAlcance = kit.alcance_score - preference.alcance
  const dResiliencia = kit.resiliencia_score - preference.resiliencia
  return Math.sqrt(dDano * dDano + dAlcance * dAlcance + dResiliencia * dResiliencia)
}

/** Recomendação de campeão v0+v1 (revisão técnica §6, Tier 2). Filtra
 * primeiro por tier mínimo (v0); `useProfile=false` ordena só por
 * `score_final` (v0 puro); `useProfile=true` reordena por proximidade
 * euclidiana aos 3 eixos de Kit declarados (v1) — quem não tem perfil de
 * Kit pro patch fica no fim, ordenado por score, em vez de sumir da
 * lista em silêncio. */
export function rankChampions(
  rows: ChampionScoreRow[],
  kitByChampionId: Map<string, KitProfileRow>,
  options: { minTier: string; useProfile: boolean; preference: PlaystylePreference },
): RankedChampion[] {
  const filtered = rows.filter((row) => meetsMinTier(row.score_tier, options.minTier))

  const withKit: RankedChampion[] = filtered.map((row) => {
    const kit = kitByChampionId.get(row.champion_id) ?? null
    const distance = kit && options.useProfile ? kitDistance(kit, options.preference) : null
    return { row, kit, distance }
  })

  if (!options.useProfile) {
    return withKit.sort((a, b) => b.row.score_final - a.row.score_final)
  }

  const comComPerfil = withKit.filter((r) => r.distance !== null)
  const semPerfil = withKit.filter((r) => r.distance === null)
  comComPerfil.sort((a, b) => (a.distance as number) - (b.distance as number))
  semPerfil.sort((a, b) => b.row.score_final - a.row.score_final)
  return [...comComPerfil, ...semPerfil]
}
