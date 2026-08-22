import { useEffect, useState } from 'react'
import { fetchChampionHistory, type ChampionHistoryPoint } from './api/client'

interface HistoryChartProps {
  championId: string
  championName: string
  eloTier: string
  lane: string
}

const WIDTH = 800
const HEIGHT = 220
const PADDING_LEFT = 34
const PADDING_RIGHT = 12
const PADDING_TOP = 12
const PADDING_BOTTOM = 28

// Mesmas faixas de 02_MODELO_SCORE_TIERS.md §9 — as linhas de grade do
// gráfico são os limites de tier, não valores redondos arbitrários (0/25/
// 50/75/100), porque o que importa aqui é "em que tier o campeão estava
// em cada patch", não o valor bruto.
const TIER_LINES = [
  { valor: 90, label: 'GOD' },
  { valor: 78, label: 'S' },
  { valor: 65, label: 'A' },
  { valor: 50, label: 'B' },
  { valor: 35, label: 'C' },
  { valor: 20, label: 'D' },
]

const CONFIANCA_PISO = 30

function yFor(score: number): number {
  const usable = HEIGHT - PADDING_TOP - PADDING_BOTTOM
  return PADDING_TOP + usable * (1 - score / 100)
}

function xFor(index: number, total: number): number {
  const usable = WIDTH - PADDING_LEFT - PADDING_RIGHT
  if (total <= 1) return PADDING_LEFT + usable / 2
  return PADDING_LEFT + (usable * index) / (total - 1)
}

/** Ajuste 21/08 (pedido do usuário, referência visual própria): curva
 *  suave em vez de segmentos retos entre os pontos — deixa o gráfico
 *  menos "quebrado"/anguloso. Técnica de curva quadrática pelos pontos
 *  médios (sem biblioteca externa): cada ponto intermediário vira o
 *  controle de uma curva até o meio do caminho pro próximo ponto, só a
 *  última curva termina no ponto real — passa perto de cada ponto sem
 *  precisar de Catmull-Rom completo. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
  }
  const last = points[points.length - 1]
  const secondLast = points[points.length - 2]
  d += ` Q ${secondLast.x.toFixed(1)} ${secondLast.y.toFixed(1)} ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}

/** Opacidade reflete confiança relativa ao piso de segurança (30%) — não é
 *  um adorno, é a mesma trava do backend (§11) tornada visível: um ponto
 *  apagado é um ponto em que o tier ainda é provisório. */
function opacityFor(confianca: number): number {
  const fracao = Math.min(confianca / CONFIANCA_PISO, 1)
  return 0.35 + fracao * 0.65
}

export default function HistoryChart({ championId, championName, eloTier, lane }: HistoryChartProps) {
  const [points, setPoints] = useState<ChampionHistoryPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPoints(null)
    setError(null)
    fetchChampionHistory({ championId, eloTier, lane })
      .then(setPoints)
      .catch((err: Error) => setError(err.message))
  }, [championId, eloTier, lane])

  if (error) return <p className="error">Não foi possível carregar o histórico: {error}</p>
  if (!points) return <p className="empty-state">Carregando histórico...</p>
  if (points.length < 2) {
    return <p className="empty-state">Só há dado de um patch pra {championName} nessa rota/elo ainda — sem histórico pra mostrar.</p>
  }

  const linePath = smoothPath(points.map((p, i) => ({ x: xFor(i, points.length), y: yFor(p.score_final) })))

  // Muitos patches lado a lado colidem no rótulo — mostra só o que cabe
  // sem sobrepor, nunca menos que o primeiro e o último.
  const labelStep = Math.max(1, Math.ceil(points.length / 12))

  return (
    <div className="history-chart">
      <p className="history-chart-title">
        Evolução de {championName} — {lane} / {eloTier}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="history-svg" role="img" aria-label={`Histórico de score de ${championName}`}>
        {TIER_LINES.map((t) => (
          <g key={t.valor}>
            <line
              x1={PADDING_LEFT}
              x2={WIDTH - PADDING_RIGHT}
              y1={yFor(t.valor)}
              y2={yFor(t.valor)}
              className="history-gridline"
            />
            <text x={PADDING_LEFT - 6} y={yFor(t.valor)} className="history-gridlabel" textAnchor="end" dominantBaseline="middle">
              {t.label}
            </text>
          </g>
        ))}

        <path d={linePath} className="history-line" fill="none" />

        {points.map((p, i) => (
          <g key={`${p.patch}-${p.lane}`}>
            <circle
              cx={xFor(i, points.length)}
              cy={yFor(p.score_final)}
              r={5}
              className={`history-dot tier-${p.score_tier}`}
              style={{ opacity: opacityFor(p.confianca) }}
            >
              <title>
                {p.patch}: {p.score_final.toFixed(1)} ({p.score_tier}
                {p.tier_provisorio ? ', provisório' : ''}) — {p.n_matches} partida{p.n_matches === 1 ? '' : 's'},{' '}
                {p.confianca.toFixed(1)}% de confiança
              </title>
            </circle>
            {i % labelStep === 0 || i === points.length - 1 ? (
              <text x={xFor(i, points.length)} y={HEIGHT - 8} className="history-axis-label" textAnchor="middle">
                {p.patch}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <p className="history-chart-hint">
        Pontos mais apagados ainda não bateram o piso de confiança pra tier definitivo — passe o mouse pra ver os
        números.
      </p>
    </div>
  )
}
