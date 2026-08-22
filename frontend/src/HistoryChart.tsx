import { useEffect, useId, useState } from 'react'
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

// Ajuste 21/08 (pedido do usuário, escolheu a opção "A" de 3 mockups):
// mesmas faixas de `TIER_LINES` acima, só que como intervalos [min, max]
// pra colorir a linha/área por zona — GOD cobre até 100 (teto do eixo),
// E cobre até 0 (piso do eixo), sem gap entre uma faixa e a próxima.
const TIER_BANDS: { min: number; max: number; tier: string }[] = [
  { min: 90, max: 100, tier: 'GOD' },
  { min: 78, max: 90, tier: 'S' },
  { min: 65, max: 78, tier: 'A' },
  { min: 50, max: 65, tier: 'B' },
  { min: 35, max: 50, tier: 'C' },
  { min: 20, max: 35, tier: 'D' },
  { min: 0, max: 20, tier: 'E' },
]

function yFor(score: number): number {
  const usable = HEIGHT - PADDING_TOP - PADDING_BOTTOM
  return PADDING_TOP + usable * (1 - score / 100)
}

/** Fração (0-1) da posição vertical de `score` dentro da área útil do
 *  gráfico — usada como `offset` dos stops do gradiente abaixo, que usa
 *  `gradientUnits="userSpaceOnUse"` com o vetor cravado exatamente nos
 *  limites de `PADDING_TOP`/`HEIGHT - PADDING_BOTTOM` (mesma área onde
 *  `yFor` desenha os pontos), então o resultado bate com a posição real
 *  da linha, não com o SVG inteiro. */
function gradientOffset(score: number): number {
  const usable = HEIGHT - PADDING_TOP - PADDING_BOTTOM
  return (yFor(score) - PADDING_TOP) / usable
}

function xFor(index: number, total: number): number {
  const usable = WIDTH - PADDING_LEFT - PADDING_RIGHT
  if (total <= 1) return PADDING_LEFT + usable / 2
  return PADDING_LEFT + (usable * index) / (total - 1)
}

/** Ajuste 21/08 (2ª rodada — pedido do usuário: "ajuste a posição das
 *  bolinhas"): a suavização por bezier quadrática nos pontos médios
 *  (versão anterior) NÃO passa exatamente pelos pontos internos — só
 *  perto deles — então os pontinhos (posicionados no dado real, `cx`/
 *  `cy` = `xFor`/`yFor` exatos) apareciam "flutuando" fora da curva nos
 *  picos/vales. Troca pra Catmull-Rom convertida em bezier cúbica
 *  (fórmula padrão, tensão uniforme 1/6): a curva passa exatamente por
 *  cada ponto e continua suave entre eles — sem essa troca não dá pra
 *  ter as duas coisas (suave E fiel ao dado) ao mesmo tempo. Pontas
 *  duplicam o ponto vizinho que não existe (`i-1`/`i+2` clampados),
 *  técnica padrão pra não precisar de caso especial no primeiro/último
 *  segmento. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

/** Fecha a curva suave numa área preenchível — desce até o piso do
 *  eixo (score 0) nas duas pontas e volta pro início, formando um
 *  polígono fechado sob a linha (opção "A" escolhida pelo usuário). */
function areaPath(lineD: string, points: { x: number; y: number }[]): string {
  const first = points[0]
  const last = points[points.length - 1]
  const baseline = HEIGHT - PADDING_BOTTOM
  return `${lineD} L ${last.x.toFixed(1)} ${baseline} L ${first.x.toFixed(1)} ${baseline} Z`
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
  // Id único por instância — evita colidir com o id de outro
  // `HistoryChart` que por acaso esteja montado ao mesmo tempo (o
  // `url(#...)` do gradiente é global ao documento, não escopado ao
  // componente).
  const gradientId = `history-tier-gradient-${useId()}`

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

  const linePoints = points.map((p, i) => ({ x: xFor(i, points.length), y: yFor(p.score_final) }))
  const linePath = smoothPath(linePoints)
  const areaFillPath = areaPath(linePath, linePoints)

  // Muitos patches lado a lado colidem no rótulo — mostra só o que cabe
  // sem sobrepor, nunca menos que o primeiro e o último.
  const labelStep = Math.max(1, Math.ceil(points.length / 12))

  return (
    <div className="history-chart">
      <p className="history-chart-title">
        Evolução de {championName} — {lane} / {eloTier}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="history-svg" role="img" aria-label={`Histórico de score de ${championName}`}>
        <defs>
          {/* Ajuste 21/08 (pedido do usuário, escolheu a opção "A" de 3
              mockups): gradiente vertical com degraus (2 stops no mesmo
              offset em cada fronteira de tier) em vez de transição suave
              entre cores — a linha/área ficam na cor exata do tier que
              estão cruzando naquele instante, não uma mistura. Cores via
              classe CSS (`.history-tier-stop-*`), não atributo `stop-
              color` direto — atributo SVG não resolve `var()`, mesmo
              motivo de `.history-dot.tier-*` já usar classe pra isso. */}
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={PADDING_TOP}
            x2="0"
            y2={HEIGHT - PADDING_BOTTOM}
          >
            {TIER_BANDS.flatMap((band) => [
              <stop key={`${band.tier}-max`} offset={gradientOffset(band.max)} className={`history-tier-stop-${band.tier}`} />,
              <stop key={`${band.tier}-min`} offset={gradientOffset(band.min)} className={`history-tier-stop-${band.tier}`} />,
            ])}
          </linearGradient>
        </defs>

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

        <path d={areaFillPath} fill={`url(#${gradientId})`} className="history-area" />
        <path d={linePath} stroke={`url(#${gradientId})`} className="history-line" fill="none" />

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
