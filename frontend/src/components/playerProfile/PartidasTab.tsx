import type { ChampionMeta, PlayerMatchSummary } from '../../api/client'
import { ChampionPortrait, LANE_LABELS, MatchBadgeChip, championName, formatDuration } from './shared'

export default function PartidasTab({
  partidas,
  championsMeta,
  ddragonPatch,
}: {
  partidas: PlayerMatchSummary[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  if (partidas.length === 0) return <p className="empty-state">Sem partidas analisadas ainda.</p>

  return (
    <ul className="match-list">
      {partidas.map((p) => (
        <li className={`match-item ${p.win ? 'match-item-win' : 'match-item-loss'}`} key={p.match_id}>
          <ChampionPortrait championId={p.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} size={36} />
          <div className="match-item-main">
            <span className="match-item-champion">
              {championName(p.champion_id, championsMeta)}
              <MatchBadgeChip badge={p.badge} />
            </span>
            <span className="explain-sub">
              {LANE_LABELS[p.lane] ?? p.lane} · {p.win ? 'Vitória' : 'Derrota'} · {formatDuration(p.game_duration_s)}
            </span>
          </div>
          <span className="match-item-kda">{p.kills}/{p.deaths}/{p.assists}</span>
          <span className="explain-sub match-item-stats">
            {p.total_cs != null && `${p.total_cs} CS`}
            {p.gold_earned != null && ` · ${p.gold_earned.toLocaleString('pt-BR')} ouro`}
            {p.vision_score != null && ` · ${p.vision_score} visão`}
          </span>
        </li>
      ))}
    </ul>
  )
}
