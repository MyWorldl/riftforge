/** Extraído (ajuste 21/08) da duplicação local que existia em
 *  `ChampionsPage.tsx` e `MatchupsPage.tsx` — terceiro consumidor
 *  (`InvocadorPage.tsx`, badge de elo em "Progresso na temporada")
 *  cruzou o limite de "vale a pena duplicar de novo". Item novo (revisão
 *  técnica §7.6): esses 10 PNGs (~95KB) ficam em `public/tiers/` (path
 *  de string comum, não `import`) — só carregam quando o `<img>`
 *  realmente renderiza, não bundlados no chunk JS inicial. */
export const TIER_ICONS: Record<string, string> = {
  IRON: '/tiers/iron.png',
  BRONZE: '/tiers/bronze.png',
  SILVER: '/tiers/silver.png',
  GOLD: '/tiers/gold.png',
  PLATINUM: '/tiers/platinum.png',
  EMERALD: '/tiers/emerald.png',
  DIAMOND: '/tiers/diamond.png',
  MASTER: '/tiers/master.png',
  GRANDMASTER: '/tiers/grandmaster.png',
  CHALLENGER: '/tiers/challenger.png',
}
