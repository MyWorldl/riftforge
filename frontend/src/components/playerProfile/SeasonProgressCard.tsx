import type { PlayerRankSnapshot } from '../../api/client'
import { TIER_ICONS } from '../../constants/tiers'
import { formatEpochMs } from './shared'

/** Extraído de `ResumoTab` em `PlayerAnalysisPage.tsx` (ajuste 21/08) —
 *  segundo consumidor é a nova página Invocador, com duas diferenças
 *  pedidas pelo usuário:
 *  - `showEloBadge`: badge do tier (`TIER_ICONS`) ao lado do texto — só
 *    no Invocador, a Análise do Jogador não pediu isso.
 *  - `showRetroactiveNote`: a linha "sem histórico retroativo" (e a
 *    variação "Desde [data]...") fazem sentido na Análise do Jogador,
 *    página já estabelecida — mas viram ruído no Invocador, onde toda
 *    primeira busca de um jogador mostraria o mesmo aviso. */
export default function SeasonProgressCard({
  latestSnapshot,
  oldestSnapshot,
  showEloBadge = false,
  showRetroactiveNote = true,
}: {
  latestSnapshot: PlayerRankSnapshot
  oldestSnapshot: PlayerRankSnapshot | null
  showEloBadge?: boolean
  showRetroactiveNote?: boolean
}) {
  const icon = TIER_ICONS[latestSnapshot.tier]
  return (
    <section className="player-summary-card">
      <h2>Progresso na temporada</h2>
      <p>
        Hoje:{' '}
        <strong>
          {showEloBadge && icon && <img className="season-progress-tier-icon" src={icon} alt="" width={20} height={20} />}
          {latestSnapshot.tier} {latestSnapshot.division}
        </strong>{' '}
        · {latestSnapshot.league_points} PDL · {latestSnapshot.wins}V/{latestSnapshot.losses}D
      </p>
      {showRetroactiveNote && oldestSnapshot && oldestSnapshot !== latestSnapshot && (
        <p className="explain-sub">
          Desde {formatEpochMs(new Date(oldestSnapshot.captured_at).getTime())}:{' '}
          {oldestSnapshot.tier} {oldestSnapshot.division} → {latestSnapshot.tier} {latestSnapshot.division}
        </p>
      )}
      {showRetroactiveNote && <p className="explain-sub">Um snapshot por dia, a partir de hoje — sem histórico retroativo.</p>}
    </section>
  )
}
