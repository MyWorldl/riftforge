import { championImageUrl, type ChampionMeta } from '../../api/client'

/** Extraído de `PlayerAnalysisPage.tsx` (ajuste 21/08) — usado tanto lá
 *  quanto na nova página Invocador, que reaproveita as mesmas abas
 *  (Campeões/Maestria/Estilo/Partidas) menos o Roadmap. Ficar duplicado
 *  em duas páginas de ~700 linhas cada seria pior que compartilhar. */
export const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatEpochMs(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function championName(championId: string, championsMeta: Record<string, ChampionMeta> | null): string {
  return championsMeta?.[championId]?.name ?? championId
}

export function ChampionPortrait({
  championId,
  championsMeta,
  ddragonPatch,
  size = 28,
}: {
  championId: string
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  size?: number
}) {
  const meta = championsMeta?.[championId]
  if (!meta || !ddragonPatch) return null
  return (
    <img
      src={championImageUrl(ddragonPatch, meta.image.full)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="champion-portrait"
    />
  )
}

/** Sprint 4 (16/08): mesma convenção OP.GG/u.gg — MVP no time vencedor,
 *  ACE no perdedor, ambos calculados por `player_service._compute_match_badges`
 *  no backend a partir de kills/assists/deaths + kill participation + %
 *  de dano do time. */
export function MatchBadgeChip({ badge }: { badge: 'mvp' | 'ace' | null }) {
  if (!badge) return null
  return (
    <span
      className={`match-badge match-badge-${badge}`}
      title={badge === 'mvp' ? 'Maior impacto no time vencedor' : 'Maior impacto no time perdedor'}
    >
      {badge.toUpperCase()}
    </span>
  )
}
