import type { PlayerRoadmapStep } from './api/client'

/** Sprint 4 item 22: gráfico de evolução do roadmap — componente novo e
 *  pequeno, não reaproveita `HistoryChart.tsx` (acoplado a score-por-patch,
 *  eixo X = sequência de patches, não faz sentido aqui). O dado já está
 *  gravado desde a rodada 28 (`delta_pct_inicial`/`delta_pct_atual` por
 *  passo); este componente só exibe, nenhuma chamada de rede própria. */

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

interface RoadmapEvolutionChartProps {
  ativos: PlayerRoadmapStep[]
  concluidos: PlayerRoadmapStep[]
}

const WIDTH = 600
const ROW_HEIGHT = 34
const PADDING_TOP = 8
const PADDING_BOTTOM = 24
const LABEL_WIDTH = 140
const PADDING_RIGHT = 16

/** Domínio sempre inclui 0 (a linha "média do elo", o que o roadmap usa
 *  de referência) e uma margem — sem isso, um passo com delta perto de 0
 *  ficaria colado na borda do gráfico. */
function buildDomain(steps: PlayerRoadmapStep[]): [number, number] {
  const values = steps.flatMap((s) => [s.delta_pct_inicial, s.delta_pct_atual, 0])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const margin = Math.max((max - min) * 0.15, 3)
  return [min - margin, max + margin]
}

function RoadmapEvolutionChart({ ativos, concluidos }: RoadmapEvolutionChartProps) {
  const steps = [...ativos, ...concluidos]
  if (steps.length === 0) return null

  const [domainMin, domainMax] = buildDomain(steps)
  const plotWidth = WIDTH - LABEL_WIDTH - PADDING_RIGHT
  const height = PADDING_TOP + PADDING_BOTTOM + ROW_HEIGHT * steps.length

  function xFor(pct: number): number {
    const fraction = (pct - domainMin) / (domainMax - domainMin)
    return LABEL_WIDTH + fraction * plotWidth
  }

  const zeroX = xFor(0)

  return (
    <div className="roadmap-evolution-chart">
      <p className="roadmap-evolution-title">Evolução por passo</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="roadmap-evolution-svg"
        role="img"
        aria-label="Evolução do gap em relação à média do elo, por passo do roadmap"
      >
        <line
          x1={zeroX}
          x2={zeroX}
          y1={PADDING_TOP}
          y2={height - PADDING_BOTTOM}
          className="roadmap-evolution-zeroline"
        />
        <text x={zeroX} y={height - 8} className="roadmap-evolution-zerolabel" textAnchor="middle">
          média do elo
        </text>

        {steps.map((step, i) => {
          const y = PADDING_TOP + ROW_HEIGHT * i + ROW_HEIGHT / 2
          const xInicial = xFor(step.delta_pct_inicial)
          const xAtual = xFor(step.delta_pct_atual)
          const melhorou = step.delta_pct_atual >= step.delta_pct_inicial
          return (
            <g key={`${step.champion_id}-${step.lane}`}>
              <text x={0} y={y} className="roadmap-evolution-label" dominantBaseline="middle">
                {step.champion_id} · {LANE_LABELS[step.lane] ?? step.lane}
              </text>
              <line
                x1={xInicial}
                x2={xAtual}
                y1={y}
                y2={y}
                className={`roadmap-evolution-line ${melhorou ? 'value-pos' : 'value-neg'}`}
                stroke="currentColor"
              />
              <circle cx={xInicial} cy={y} r={3.5} className="roadmap-evolution-dot-inicial">
                <title>Ponto de partida: {step.delta_pct_inicial >= 0 ? '+' : ''}{step.delta_pct_inicial.toFixed(1)}%</title>
              </circle>
              <circle
                cx={xAtual}
                cy={y}
                r={4.5}
                className={`roadmap-evolution-dot-atual ${step.delta_pct_atual >= 0 ? 'value-pos' : 'value-neg'}`}
                fill="currentColor"
              >
                <title>
                  {step.status === 'completed' ? 'Concluído' : 'Atual'}: {step.delta_pct_atual >= 0 ? '+' : ''}
                  {step.delta_pct_atual.toFixed(1)}%
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
      <p className="roadmap-evolution-hint">
        Cada linha vai do gap quando o passo entrou no roadmap (ponto vazado) até o gap agora (ponto cheio) —
        passe o mouse pra ver os números.
      </p>
    </div>
  )
}

export default RoadmapEvolutionChart
