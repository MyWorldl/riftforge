import type { PlayerMatchSummary } from '../../api/client'

/** Aba Estilo: agregados calculados no cliente a partir de `partidas`
 *  (mesmo dado do Bloco 1, sem chamada nova) — CS/min, visão, dano ao
 *  time e participação em abates médios, e total de multikills. */
export default function EstiloTab({ partidas }: { partidas: PlayerMatchSummary[] }) {
  const comStats = partidas.filter((p) => p.total_cs != null && p.game_duration_s > 0)
  const csPerMin = comStats.length
    ? comStats.reduce((acc, p) => acc + (p.total_cs ?? 0) / (p.game_duration_s / 60), 0) / comStats.length
    : null

  const withVision = partidas.filter((p) => p.vision_score != null)
  const avgVision = withVision.length
    ? withVision.reduce((acc, p) => acc + (p.vision_score ?? 0), 0) / withVision.length
    : null

  const withKp = partidas.filter((p) => p.kill_participation != null)
  const avgKp = withKp.length
    ? withKp.reduce((acc, p) => acc + (p.kill_participation ?? 0), 0) / withKp.length
    : null

  const withDmg = partidas.filter((p) => p.team_damage_percentage != null)
  const avgDmgShare = withDmg.length
    ? withDmg.reduce((acc, p) => acc + (p.team_damage_percentage ?? 0), 0) / withDmg.length
    : null

  const multikills = partidas.reduce(
    (acc, p) => acc + (p.double_kills ?? 0) + (p.triple_kills ?? 0) + (p.quadra_kills ?? 0) + (p.penta_kills ?? 0),
    0,
  )

  if (partidas.length === 0) return <p className="empty-state">Sem partidas analisadas ainda.</p>

  return (
    <div className="style-stat-grid">
      <div className="champion-detail-stat">
        <span>CS/min médio</span>
        <strong>{csPerMin != null ? csPerMin.toFixed(1) : '—'}</strong>
      </div>
      <div className="champion-detail-stat">
        <span>Visão média</span>
        <strong>{avgVision != null ? avgVision.toFixed(1) : '—'}</strong>
      </div>
      <div className="champion-detail-stat">
        <span>Participação em abates</span>
        <strong>{avgKp != null ? `${(avgKp * 100).toFixed(0)}%` : '—'}</strong>
      </div>
      <div className="champion-detail-stat">
        <span>% de dano do time</span>
        <strong>{avgDmgShare != null ? `${(avgDmgShare * 100).toFixed(0)}%` : '—'}</strong>
      </div>
      <div className="champion-detail-stat">
        <span>Multikills (soma)</span>
        <strong>{multikills}</strong>
      </div>
      <p className="explain-sub style-stat-caption">
        Médias sobre as {partidas.length} partidas analisadas — partidas sem cada campo (payload antigo
        da Riot) ficam fora da média daquele campo específico.
      </p>
    </div>
  )
}
