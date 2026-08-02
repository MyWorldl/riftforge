import { useEffect, useState } from 'react'
import {
  championImageUrl,
  fetchChampionExplanation,
  type ChampionExplanation,
  type ChampionMeta,
  type ChampionScoreRow,
  type PowerProfile,
  type ScoreExplanation,
} from '../api/client'
import roleIconTop from '../assets/roles/top.png'
import roleIconJungle from '../assets/roles/jungle.png'
import roleIconMiddle from '../assets/roles/middle.png'
import roleIconBottom from '../assets/roles/bottom.png'
import roleIconUtility from '../assets/roles/utility.png'

/** Componentes compartilhados entre `ChampionsPage` (lista) e
 *  `ChampionDetailPage` (página de um campeão só, item novo pedido pelo
 *  usuário depois que a linha da tabela ficou apertada demais pra caber
 *  Composição + Ações). Extraído daqui em vez de duplicado nos dois
 *  lugares — a explicação por camada, o perfil de poder e a barra de
 *  composição são exatamente os mesmos dados/regras nas duas telas. */

export function formatPct(value: number | null): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`
}

export function rowKey(row: ChampionScoreRow): string {
  return `${row.champion_id}-${row.lane}-${row.patch}`
}

export function matchesNameSearch(
  row: ChampionScoreRow,
  search: string,
  championsMeta: Record<string, ChampionMeta> | null,
): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  const name = championsMeta?.[row.champion_id]?.name ?? row.champion_id
  return name.toLowerCase().includes(needle) || row.champion_id.toLowerCase().includes(needle)
}

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

const LANE_ICONS: Partial<Record<string, string>> = {
  TOP: roleIconTop,
  JUNGLE: roleIconJungle,
  MIDDLE: roleIconMiddle,
  BOTTOM: roleIconBottom,
  UTILITY: roleIconUtility,
}

export function LaneCell({ lane }: { lane: string }) {
  const icon = LANE_ICONS[lane]
  return (
    <div className="lane-cell">
      {icon && <img src={icon} alt="" width={18} height={18} />}
      <span>{LANE_LABELS[lane] ?? lane}</span>
    </div>
  )
}

export const LAYER_LABELS: Record<string, string> = {
  performance: 'Performance',
  kit: 'Kit',
  build: 'Build',
  meta: 'Meta',
}

const LAYER_HINTS: Record<string, string> = {
  performance: 'Win rate ajustado, presença (pick/ban) e KDA',
  kit: 'Poder intrínseco do kit do campeão',
  build: 'Flexibilidade de build, dependência do item certo e power spike',
  meta: 'Saúde do metagame da rota e tendência entre patches',
}

/** Item 5.1 — barra de 4 segmentos reaproveitando os scores de camada já
 *  presentes em `ChampionScoreRow` (`performance_score`/`kit_score`/
 *  `build_score`/`meta_score`), sem nenhuma chamada extra ao backend.
 *  Contribuição = nota da camada × peso do modelo (mesmos pesos de
 *  `compute_scores.py`), não a nota bruta — senão uma camada de peso baixo
 *  com nota alta pareceria mais importante do que realmente é. */
const LAYER_WEIGHTS: Record<string, number> = { performance: 0.4, kit: 0.25, build: 0.25, meta: 0.1 }

export function LayerContributionBar({ row }: { row: ChampionScoreRow }) {
  const layers = (
    [
      ['performance', row.performance_score],
      ['kit', row.kit_score],
      ['build', row.build_score],
      ['meta', row.meta_score],
    ] as [string, number | null][]
  )
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, score]) => ({ key, contribuicao: score * LAYER_WEIGHTS[key] }))

  const total = layers.reduce((sum, l) => sum + l.contribuicao, 0) || 1
  const hint = layers
    .map((l) => `${LAYER_LABELS[l.key] ?? l.key}: ${((l.contribuicao / total) * 100).toFixed(0)}%`)
    .join(' · ')

  return (
    <div className="mini-contribution-bar" title={hint}>
      {layers.map((l) => (
        <span
          key={l.key}
          className={`mini-contribution-seg mini-contribution-${l.key}`}
          style={{ width: `${(l.contribuicao / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

/** Ícones das ações — `currentColor` puxa a cor do elemento pai, então
 *  hover/estado ativo funcionam sem CSS extra, tanto em `<button>` quanto
 *  em `<Link>`. */
export function IconInfo() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="4.8" r="0.9" fill="currentColor" />
      <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconChart() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 13V9M6.4 13V5M10.7 13V7.5M15 13V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconSwords() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 2l5 5M14 2 9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 14l5-5M14 14 9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function IconBuild() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  )
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`
}

const POWER_LABELS: Record<PowerProfile['classificacao'], string> = {
  estrutural: 'Estrutural',
  meta: 'Depende do meta',
  equilibrado: 'Equilibrado',
  indeterminado: '—',
}

const POWER_HINTS: Record<PowerProfile['classificacao'], string> = {
  estrutural: 'Poder vem majoritariamente do próprio campeão (Kit+Build) — deve se manter em patches futuros',
  meta: 'Poder vem majoritariamente do patch atual (Performance+Meta) — pode cair quando o meta mudar',
  equilibrado: 'Poder próprio e favorecimento do patch atual pesam de forma parecida',
  indeterminado: 'Sem dado suficiente pra classificar',
}

function PowerProfileBadge({ perfil }: { perfil: PowerProfile }) {
  return (
    <span className={`power-badge power-${perfil.classificacao}`} title={POWER_HINTS[perfil.classificacao]}>
      {POWER_LABELS[perfil.classificacao]}
    </span>
  )
}

/** Item 3.2, versão detalhada: duas barras lado a lado (Kit+Build vs.
 *  Performance+Meta) com os pesos reais usados naquela linha. */
function PowerProfileDetail({ perfil }: { perfil: PowerProfile }) {
  const { estrutural, meta, classificacao } = perfil
  if (estrutural.score === null || meta.score === null) return null

  const maxScore = Math.max(estrutural.score, meta.score, 1)

  return (
    <div className="power-detail">
      <span className="power-detail-title">
        Perfil de poder: <PowerProfileBadge perfil={perfil} />
      </span>
      <div className="power-detail-bars">
        <div className="power-detail-row">
          <span className="power-detail-label">Estrutural (Kit+Build)</span>
          <span className="power-detail-bar-cell">
            <span className="power-detail-bar bar-estrutural" style={{ width: `${(estrutural.score / maxScore) * 100}%` }} />
          </span>
          <span className="power-detail-value">
            {estrutural.score.toFixed(1)} <span className="explain-sub">({(estrutural.peso * 100).toFixed(0)}%)</span>
          </span>
        </div>
        <div className="power-detail-row">
          <span className="power-detail-label">Meta (Performance+Meta)</span>
          <span className="power-detail-bar-cell">
            <span className="power-detail-bar bar-meta" style={{ width: `${(meta.score / maxScore) * 100}%` }} />
          </span>
          <span className="power-detail-value">
            {meta.score.toFixed(1)} <span className="explain-sub">({(meta.peso * 100).toFixed(0)}%)</span>
          </span>
        </div>
      </div>
      {classificacao === 'meta' && (
        <p className="explain-missing">
          Cuidado ao projetar esse campeão pro próximo patch — boa parte do score de hoje vem do momento atual, não
          de característica própria.
        </p>
      )}
    </div>
  )
}

/** Item 3.3 — heurística v1 baseada na variação de KDA por partida
 *  (não é métrica oficial da Riot, ver `compute_skill_expression.py`). */
export function SkillExpressionBadges({ skill }: { skill: ChampionScoreRow['skill_expression'] }) {
  if (!skill) return null
  const hint =
    'Aproximação baseada na variação do KDA entre as partidas do campeão, não uma métrica oficial da Riot.'
  return (
    <div className="skill-expression-row" title={hint}>
      <span className="skill-expression-label">Skill Expression:</span>
      <span className={`skill-badge skill-level-${skill.ceiling_label}`}>Ceiling: {skill.ceiling_label}</span>
      <span className={`skill-badge skill-level-${skill.floor_label}`}>Floor: {skill.floor_label}</span>
      {skill.amostra_insuficiente && <span className="explain-sub">(amostra pequena)</span>}
    </div>
  )
}

/** Frase em linguagem natural — o ponto do item 3.1 é o usuário entender
 *  sem precisar ler a tabela de números. */
function explanationHeadline(explanation: ScoreExplanation): string {
  const layers = explanation.camadas
  if (layers.length === 0) return 'Sem camadas disponíveis para explicar este score.'

  const top = layers[0]
  const bottom = layers[layers.length - 1]
  const label = (c: typeof top) => LAYER_LABELS[c.camada] ?? c.camada

  if (top.contribuicao <= 0) {
    return `Nenhuma camada puxou para cima — ${label(bottom)} é o que mais segura o score.`
  }
  if (bottom.contribuicao >= 0) {
    return `Todas as camadas puxam para cima — ${label(top)} é a que mais contribui.`
  }
  return `${label(top)} puxa para cima; ${label(bottom)} é o que mais segura.`
}

/** Item 4.3 (revisão técnica): busca a explicação sob demanda em vez de ler
 *  de `row.explicacao`/`row.perfil_poder` (removidos de `ChampionScoreRow`)
 *  — mesmo padrão lazy-fetch já usado por `MatchupPanel`/
 *  `BuildRecommendationPanel`. */
export function ScoreExplanationPanel({ row }: { row: ChampionScoreRow }) {
  const [data, setData] = useState<ChampionExplanation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    fetchChampionExplanation({
      championId: row.champion_id,
      lane: row.lane,
      eloTier: row.elo_tier,
      patch: row.patch,
    })
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [row.champion_id, row.lane, row.elo_tier, row.patch])

  if (error) return <p className="error">Não foi possível carregar a explicação: {error}</p>
  if (!data) return <p className="filters-loading">Buscando explicação...</p>

  const { explicacao } = data
  const layers = explicacao.camadas
  const maxAbs = Math.max(...layers.map((c) => Math.abs(c.contribuicao)), 0.01)

  return (
    <div className="explain">
      <p className="explain-headline">{explanationHeadline(explicacao)}</p>
      <p className="explain-sample">
        Amostra: {row.n_matches} {row.n_matches === 1 ? 'partida' : 'partidas'} ({row.confianca.toFixed(1)}% de confiança)
      </p>

      <div className="explain-rows">
        <div className="explain-row explain-base">
          <span className="explain-label">Base neutra</span>
          <span className="explain-bar-cell" />
          <span className="explain-value">{explicacao.base.toFixed(1)}</span>
        </div>

        {layers.map((c) => {
          const positive = c.contribuicao >= 0
          const width = `${(Math.abs(c.contribuicao) / maxAbs) * 100}%`
          return (
            <div className="explain-row" key={c.camada}>
              <span className="explain-label" title={LAYER_HINTS[c.camada]}>
                {LAYER_LABELS[c.camada] ?? c.camada}
                <span className="explain-sub">
                  nota {c.score.toFixed(1)} · peso {(c.peso * 100).toFixed(0)}%
                </span>
              </span>
              <span className="explain-bar-cell">
                <span className="explain-bar-half explain-bar-neg">
                  {!positive && <span className="explain-bar bar-neg" style={{ width }} />}
                </span>
                <span className="explain-bar-half explain-bar-pos">
                  {positive && <span className="explain-bar bar-pos" style={{ width }} />}
                </span>
              </span>
              <span className={`explain-value ${positive ? 'value-pos' : 'value-neg'}`}>{signed(c.contribuicao)}</span>
            </div>
          )
        })}

        <div className="explain-row explain-total">
          <span className="explain-label">Score final</span>
          <span className="explain-bar-cell" />
          <span className="explain-value">{row.score_final.toFixed(1)}</span>
        </div>
      </div>

      {explicacao.camadas_ausentes.length > 0 && (
        <p className="explain-missing">
          Sem dado de {explicacao.camadas_ausentes.map((c) => LAYER_LABELS[c] ?? c).join(', ')} para este patch — o
          peso foi redistribuído entre as camadas acima, não contado como zero.
        </p>
      )}

      <PowerProfileDetail perfil={data.perfil_poder} />
      <SkillExpressionBadges skill={row.skill_expression} />
    </div>
  )
}

/** Item 5.1 — comparador lado a lado: até 3 campeões, mesmos dados que já
 *  vêm em `ChampionScoreRow` (sem fetch extra). Usado tanto na lista de
 *  Campeões (`ChampionsPage.tsx`) quanto na aba "Comparar" da página de
 *  detalhe (`ChampionDetailPage.tsx`) — mesmo componente, dois pontos de
 *  entrada diferentes pra montar a seleção. */
export function ComparatorPanel({
  rows,
  championsMeta,
  ddragonPatch,
  onRemove,
  onClear,
}: {
  rows: ChampionScoreRow[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  onRemove: (key: string) => void
  onClear: () => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="comparator-panel">
      <div className="comparator-header">
        <span>Comparando {rows.length} {rows.length === 1 ? 'campeão' : 'campeões'}</span>
        <button type="button" className="comparator-clear" onClick={onClear}>Limpar</button>
      </div>
      <div className="comparator-grid">
        {rows.map((row) => {
          const meta = championsMeta?.[row.champion_id]
          return (
            <div className="comparator-card" key={rowKey(row)}>
              <div className="comparator-card-header">
                {meta && ddragonPatch && (
                  <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={28} height={28} />
                )}
                <span>{meta?.name ?? row.champion_id}</span>
                <button
                  type="button"
                  className="comparator-remove"
                  onClick={() => onRemove(rowKey(row))}
                  aria-label="Remover da comparação"
                >
                  ×
                </button>
              </div>
              <div className="comparator-stat">
                <span>Score</span>
                <strong>
                  {row.score_final.toFixed(1)}{' '}
                  <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                </strong>
              </div>
              <div className="comparator-stat">
                <span>Performance</span>
                <strong>{row.performance_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Kit</span>
                <strong>{row.kit_score !== null ? row.kit_score.toFixed(1) : '—'}</strong>
              </div>
              <div className="comparator-stat">
                <span>Build</span>
                <strong>{row.build_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Meta</span>
                <strong>{row.meta_score.toFixed(1)}</strong>
              </div>
              <div className="comparator-stat">
                <span>Vitória</span>
                <strong>{formatPct(row.win_rate)}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
