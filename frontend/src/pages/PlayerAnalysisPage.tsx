import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  championImageUrl,
  deletePlayerRoadmap,
  fetchChampions,
  fetchPlayerLookup,
  fetchPlayerMastery,
  HttpError,
  type ChampionMeta,
  type PlayerChampionSummary,
  type PlayerLookupResult,
  type PlayerMasteryResult,
  type PlayerMatchSummary,
  type PlayerRoadmapStep,
} from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import RoadmapEvolutionChart from '../RoadmapEvolutionChart'

const LANE_LABELS: Record<string, string> = {
  TOP: 'Topo',
  JUNGLE: 'Selva',
  MIDDLE: 'Meio',
  BOTTOM: 'Atirador',
  UTILITY: 'Suporte',
}

type TabKey = 'resumo' | 'campeoes' | 'maestria' | 'estilo' | 'partidas'

const TAB_ORDER: TabKey[] = ['resumo', 'campeoes', 'maestria', 'estilo', 'partidas']

const TAB_LABELS: Record<TabKey, string> = {
  resumo: 'Resumo',
  campeoes: 'Campeões',
  maestria: 'Maestria',
  estilo: 'Estilo',
  partidas: 'Partidas',
}

/** Revisão técnica 09/08 §2.3: token opaco do roadmap fica só no
 *  localStorage do próprio navegador — nunca é enviado a lugar nenhum
 *  além do `DELETE`, e nunca precisa de consentimento de cookie porque
 *  não é rastreamento. */
function roadmapTokenStorageKey(region: string, gameName: string, tagLine: string): string {
  return `riftforge:roadmap_token:${region}:${gameName}:${tagLine}`.toLowerCase()
}

/** Sprint B item 2 (revisão técnica §5.3): última identidade buscada, pra
 *  `PatchNotesPage.tsx` montar o bloco "Mudanças que te afetam" sem exigir
 *  nova busca. Mesma política de privacidade do token acima — só
 *  localStorage, nunca enviado a lugar nenhum além do próprio endpoint que
 *  o usuário já está chamando. */
export const LAST_IDENTITY_STORAGE_KEY = 'riftforge:last_identity'

function saveLastIdentity(region: string, gameName: string, tagLine: string): void {
  localStorage.setItem(LAST_IDENTITY_STORAGE_KEY, JSON.stringify({ region, gameName, tagLine }))
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatEpochMs(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function championName(championId: string, championsMeta: Record<string, ChampionMeta> | null): string {
  return championsMeta?.[championId]?.name ?? championId
}

function ChampionPortrait({
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
function MatchBadgeChip({ badge }: { badge: 'mvp' | 'ace' | null }) {
  if (!badge) return null
  return (
    <span
      className={`match-badge match-badge-${badge}`}
      title={
        badge === 'mvp'
          ? 'Maior impacto no time vencedor'
          : 'Maior impacto no time perdedor'
      }
    >
      {badge.toUpperCase()}
    </span>
  )
}

/** Roadmap de Progressão do Jogador (rodada 28) — passo ativo mostra o
 *  gap atual (sempre negativo, é isso que o qualifica pra virar passo)
 *  e a amostra que embasa ele. Reaproveita `.value-neg`/`.value-pos` já
 *  usados na tabela abaixo, mesma linguagem visual. */
function RoadmapStepRow({ step, done }: { step: PlayerRoadmapStep; done: boolean }) {
  return (
    <li className="roadmap-step">
      <span className="roadmap-step-champion">
        {step.champion_id} · {LANE_LABELS[step.lane] ?? step.lane}
      </span>
      <span className={done ? 'value-pos' : 'value-neg'}>
        {step.delta_pct_atual >= 0 ? '+' : ''}
        {step.delta_pct_atual.toFixed(1)}% WR vs. média do elo
      </span>
      <span className="explain-sub">{step.partidas_atual} partidas</span>
      {done && <span className="roadmap-step-done" title="Concluído">✓</span>}
    </li>
  )
}

/** Aba Resumo: identidade + progresso de temporada (snapshot mais
 *  recente, Sprint 4 bloco 2) + roadmap (movido pra cá, era a única
 *  seção da página antes das abas) + contagem rápida de selos MVP/ACE
 *  nas partidas analisadas. */
function ResumoTab({
  result,
  region,
  gameName,
  tagLine,
}: {
  result: PlayerLookupResult
  region: string
  gameName: string
  tagLine: string
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [roadmap, setRoadmap] = useState(result.roadmap)

  useEffect(() => setRoadmap(result.roadmap), [result])

  function handleDeleteRoadmap() {
    setDeleting(true)
    setDeleteError(null)
    const token = localStorage.getItem(roadmapTokenStorageKey(region, gameName, tagLine))
    deletePlayerRoadmap({ region, gameName, tagLine }, token)
      .then(() => {
        setRoadmap({ ativos: [], concluidos: [], roadmap_token: null })
        localStorage.removeItem(roadmapTokenStorageKey(region, gameName, tagLine))
        setConfirmingDelete(false)
      })
      .catch((err: Error) => setDeleteError(err.message))
      .finally(() => setDeleting(false))
  }

  const latestSnapshot = result.progresso_temporada.at(-1) ?? null
  const oldestSnapshot = result.progresso_temporada[0] ?? null
  const mvpCount = result.partidas.filter((p) => p.badge === 'mvp').length
  const aceCount = result.partidas.filter((p) => p.badge === 'ace').length

  return (
    <div>
      {latestSnapshot && (
        <section className="player-summary-card">
          <h2>Progresso na temporada</h2>
          <p>
            Hoje: <strong>{latestSnapshot.tier} {latestSnapshot.division}</strong> ·{' '}
            {latestSnapshot.league_points} PDL · {latestSnapshot.wins}V/{latestSnapshot.losses}D
          </p>
          {oldestSnapshot && oldestSnapshot !== latestSnapshot && (
            <p className="explain-sub">
              Desde {formatEpochMs(new Date(oldestSnapshot.captured_at).getTime())}:{' '}
              {oldestSnapshot.tier} {oldestSnapshot.division} → {latestSnapshot.tier} {latestSnapshot.division}
            </p>
          )}
          <p className="explain-sub">
            Um snapshot por dia, a partir de hoje — sem histórico retroativo.
          </p>
        </section>
      )}

      {(mvpCount > 0 || aceCount > 0) && (
        <p className="table-caption">
          Nas últimas {result.partidas.length} partidas: {mvpCount} MVP{mvpCount === 1 ? '' : 's'}, {aceCount} ACE{aceCount === 1 ? '' : 's'}
        </p>
      )}

      <section className="roadmap-section">
        <div className="roadmap-section-header">
          <h2>Seu roadmap</h2>
          {(roadmap.ativos.length > 0 || roadmap.concluidos.length > 0) && (
            <button
              type="button"
              className="roadmap-delete-toggle"
              onClick={() => setConfirmingDelete((v) => !v)}
            >
              Apagar meu roadmap
            </button>
          )}
        </div>

        {confirmingDelete && (
          <div className="roadmap-delete-confirm" role="alertdialog">
            <p>Isso apaga permanentemente todos os passos do seu roadmap. Não pode ser desfeito.</p>
            {deleteError && <p className="error" role="alert">{deleteError}</p>}
            <div className="roadmap-delete-actions">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                Cancelar
              </button>
              <button
                type="button"
                className="roadmap-delete-confirm-btn"
                onClick={handleDeleteRoadmap}
                disabled={deleting}
              >
                {deleting ? 'Apagando...' : 'Sim, apagar meu roadmap'}
              </button>
            </div>
          </div>
        )}

        {roadmap.ativos.length === 0 && roadmap.concluidos.length === 0 ? (
          <p className="empty-state">
            Nenhum passo no roadmap ainda — jogue mais partidas com campeões abaixo da média do seu
            elo pra receber sugestões de foco aqui.
          </p>
        ) : (
          <>
            {roadmap.ativos.length > 0 && (
              <ul className="roadmap-list">
                {roadmap.ativos.map((step) => (
                  <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={false} />
                ))}
              </ul>
            )}
            {roadmap.concluidos.length > 0 && (
              <>
                <h3 className="roadmap-concluidos-title">Concluídos</h3>
                <ul className="roadmap-list roadmap-list-done">
                  {roadmap.concluidos.map((step) => (
                    <RoadmapStepRow key={`${step.champion_id}-${step.lane}`} step={step} done={true} />
                  ))}
                </ul>
              </>
            )}
            <RoadmapEvolutionChart ativos={roadmap.ativos} concluidos={roadmap.concluidos} />
          </>
        )}
      </section>
    </div>
  )
}

/** Comparador (item novo, auditoria 16/08): compara 2 campeões DESTE
 *  jogador — partidas/vitórias/KDA/gap vs. média do elo — diferente do
 *  comparador de `ChampionDetailPage.tsx`, que compara linhas globais de
 *  `ChampionScoreRow`, não o histórico pessoal do jogador buscado. */
function PlayerComparator({
  campeoes,
  championsMeta,
  ddragonPatch,
}: {
  campeoes: PlayerChampionSummary[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const [keyA, setKeyA] = useState('')
  const [keyB, setKeyB] = useState('')

  function keyOf(c: PlayerChampionSummary): string {
    return `${c.champion_id}-${c.lane}`
  }

  const options = campeoes.map((c) => ({ key: keyOf(c), label: `${championName(c.champion_id, championsMeta)} (${LANE_LABELS[c.lane] ?? c.lane})` }))
  const a = campeoes.find((c) => keyOf(c) === keyA)
  const b = campeoes.find((c) => keyOf(c) === keyB)

  return (
    <div className="player-comparator">
      <div className="player-comparator-pickers">
        <select value={keyA} onChange={(e) => setKeyA(e.target.value)}>
          <option value="">Campeão A...</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <select value={keyB} onChange={(e) => setKeyB(e.target.value)}>
          <option value="">Campeão B...</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {a && b && (
        <div className="table-scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th></th>
                <th>{championName(a.champion_id, championsMeta)}</th>
                <th>{championName(b.champion_id, championsMeta)}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Rota</td>
                <td><ChampionPortrait championId={a.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} /> {LANE_LABELS[a.lane] ?? a.lane}</td>
                <td><ChampionPortrait championId={b.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} /> {LANE_LABELS[b.lane] ?? b.lane}</td>
              </tr>
              <tr>
                <td>Partidas</td>
                <td>{a.partidas}</td>
                <td>{b.partidas}</td>
              </tr>
              <tr>
                <td>Vitórias</td>
                <td>{a.vitorias}</td>
                <td>{b.vitorias}</td>
              </tr>
              <tr>
                <td>KDA médio</td>
                <td>{a.kda_medio.toFixed(2)}</td>
                <td>{b.kda_medio.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Vs. média do elo</td>
                <td>
                  {a.comparativo_baseline ? (
                    <span className={a.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                      {a.comparativo_baseline.delta_pct >= 0 ? '+' : ''}{a.comparativo_baseline.delta_pct.toFixed(1)}% WR
                    </span>
                  ) : <span className="explain-sub">sem baseline</span>}
                </td>
                <td>
                  {b.comparativo_baseline ? (
                    <span className={b.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                      {b.comparativo_baseline.delta_pct >= 0 ? '+' : ''}{b.comparativo_baseline.delta_pct.toFixed(1)}% WR
                    </span>
                  ) : <span className="explain-sub">sem baseline</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CampeoesTab({
  campeoes,
  championsMeta,
  ddragonPatch,
}: {
  campeoes: PlayerChampionSummary[]
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  return (
    <div>
      <div className="table-scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Campeão</th>
              <th>Rota</th>
              <th>Partidas</th>
              <th>Vitórias</th>
              <th>KDA médio</th>
              <th>Vs. média do elo</th>
              <th>Tier atual</th>
            </tr>
          </thead>
          <tbody>
            {campeoes.map((c) => (
              <tr key={`${c.champion_id}-${c.lane}`}>
                <td>
                  <ChampionPortrait championId={c.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />{' '}
                  {championName(c.champion_id, championsMeta)}
                </td>
                <td>{LANE_LABELS[c.lane] ?? c.lane}</td>
                <td>{c.partidas}</td>
                <td>{c.vitorias}</td>
                <td>{c.kda_medio.toFixed(2)}</td>
                <td>
                  {c.comparativo_baseline ? (
                    <span className={c.comparativo_baseline.delta_pct >= 0 ? 'value-pos' : 'value-neg'}>
                      {c.comparativo_baseline.delta_pct >= 0 ? '+' : ''}
                      {c.comparativo_baseline.delta_pct.toFixed(1)}% WR
                    </span>
                  ) : (
                    <span className="explain-sub">sem baseline</span>
                  )}
                </td>
                <td>
                  {c.score_atual ? (
                    <span className={`tier-badge tier-${c.score_atual.score_tier}`}>
                      {c.score_atual.score_tier}
                      {c.score_atual.tier_provisorio ? '*' : ''}
                    </span>
                  ) : (
                    <span className="explain-sub">sem dado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {campeoes.length >= 2 && (
        <>
          <h2>Comparar</h2>
          <PlayerComparator campeoes={campeoes} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
        </>
      )}
    </div>
  )
}

/** Aba Maestria (Sprint 4 bloco 3): endpoint próprio, sob demanda — só
 *  busca na primeira vez que a aba é aberta, não junto do lookup
 *  principal (ver `app/services/player_mastery_service.py`). */
function MaestriaTab({
  region,
  gameName,
  tagLine,
  championsMeta,
  ddragonPatch,
}: {
  region: string
  gameName: string
  tagLine: string
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  const [mastery, setMastery] = useState<PlayerMasteryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPlayerMastery({ region, gameName, tagLine })
      .then(setMastery)
      .catch((err: Error) => setError(err.message))
  }, [region, gameName, tagLine])

  if (error) return <p className="error">Não foi possível buscar maestria: {error}</p>
  if (!mastery) return <p className="filters-loading">Buscando maestria...</p>
  if (mastery.maestrias.length === 0) return <p className="empty-state">Sem dado de maestria pra esse jogador.</p>

  return (
    <>
      <MonochampionBadge info={mastery.monochampion} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
      <ul className="mastery-list">
        {mastery.maestrias.map((m) => (
          <li className="mastery-item" key={m.champion_id}>
            <ChampionPortrait championId={m.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} size={40} />
            <div className="mastery-item-info">
              <strong>{championName(m.champion_id, championsMeta)}</strong>
              <span className="explain-sub">Nível {m.champion_level} · {m.champion_points.toLocaleString('pt-BR')} pts</span>
            </div>
            <span className="explain-sub">Última partida: {formatEpochMs(m.last_play_time)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Selo "Monochampion" (16/08): calculado sobre histórico retido (até 30
 *  dias, ver `_determine_monochampion`). `ativo` exige amostra mínima E
 *  concentração média acima do limiar — antes disso mostra estado
 *  "acumulando" em vez de esconder o dado (mesmo espírito do
 *  `tier_provisorio` em Campeões). `null` só na primeiríssima busca desse
 *  jogador, quando ainda não existe snapshot nenhum. */
function MonochampionBadge({
  info,
  championsMeta,
  ddragonPatch,
}: {
  info: PlayerMasteryResult['monochampion']
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
}) {
  if (!info) return null
  const pct = Math.round(info.concentracao_media * 100)

  return (
    <div className={`monochampion-badge ${info.ativo ? 'monochampion-badge-ativo' : 'monochampion-badge-acumulando'}`}>
      <ChampionPortrait championId={info.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} size={32} />
      <div className="mastery-item-info">
        <strong>
          {info.ativo ? 'Monochampion' : 'Monochampion (acumulando histórico)'}
          {': '}
          {championName(info.champion_id, championsMeta)}
        </strong>
        <span className="explain-sub">
          {pct}% de concentração média · {info.amostras} {info.amostras === 1 ? 'dia retido' : 'dias retidos'}
          {!info.ativo && ' · selo acende com histórico suficiente'}
        </span>
      </div>
    </div>
  )
}

/** Aba Estilo: agregados calculados no cliente a partir de `partidas`
 *  (mesmo dado do Bloco 1, sem chamada nova) — CS/min, visão, dano ao
 *  time e participação em abates médios, e total de multikills. */
function EstiloTab({ partidas }: { partidas: PlayerMatchSummary[] }) {
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

function PartidasTab({
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

function PlayerAnalysisPage() {
  const [searchParams] = useSearchParams()
  const region = searchParams.get('region')
  const gameName = searchParams.get('gameName')
  const tagLine = searchParams.get('tagLine')

  useDocumentTitle(gameName && tagLine ? `${gameName}#${tagLine} — RiftForge` : 'Análise do Jogador — RiftForge')

  const [result, setResult] = useState<PlayerLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('resumo')

  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!region || !gameName || !tagLine) return
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setResult(null)
    setActiveTab('resumo')
    fetchPlayerLookup({ region, gameName, tagLine })
      .then((data) => {
        setResult(data)
        saveLastIdentity(region, gameName, tagLine)
        if (data.roadmap.roadmap_token) {
          localStorage.setItem(roadmapTokenStorageKey(region, gameName, tagLine), data.roadmap.roadmap_token)
        }
      })
      .catch((err: unknown) => {
        if (err instanceof HttpError && err.status === 501) {
          setUnavailable(true)
          return
        }
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      })
      .finally(() => setLoading(false))
  }, [region, gameName, tagLine])

  if (!gameName || !tagLine) {
    return (
      <main className="center">
        <h1>Análise do Jogador</h1>
        <p className="placeholder-page">Busque um jogador pela Home para ver a análise aqui.</p>
      </main>
    )
  }

  return (
    <main className="center">
      <h1>Análise do Jogador</h1>
      <p>
        <strong>{gameName}#{tagLine}</strong>
      </p>

      {loading && <p className="filters-loading" role="status">Buscando...</p>}

      {unavailable && (
        <p className="empty-state">
          Análise de jogador ainda não disponível em produção — essa busca faz chamadas em tempo real
          à Riot API, que só podem ir ao ar depois que a Production Key for aprovada. Funciona em
          desenvolvimento local com uma chave própria.
        </p>
      )}

      {error && <p className="error" role="alert">Não foi possível buscar esse jogador: {error}</p>}

      {result && (
        <>
          <p className="table-caption">
            {result.partidas_analisadas} partidas recentes analisadas · comparado contra o elo{' '}
            {result.elo_tier_comparado}
            {result.elo_tier_detectado ? (
              <span className="explain-sub"> (detectado via ranked solo/duo)</span>
            ) : (
              <span className="explain-sub"> (padrão — sem entrada ranqueada em solo/duo detectada)</span>
            )}
          </p>

          <div className="detail-tabs">
            {TAB_ORDER.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`detail-tab ${activeTab === tab ? 'detail-tab-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className="detail-tab-panel">
            {activeTab === 'resumo' && (
              <ResumoTab result={result} region={region ?? ''} gameName={gameName} tagLine={tagLine} />
            )}
            {activeTab === 'campeoes' && (
              <CampeoesTab campeoes={result.campeoes} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
            )}
            {activeTab === 'maestria' && (
              <MaestriaTab
                region={region ?? ''}
                gameName={gameName}
                tagLine={tagLine}
                championsMeta={championsMeta}
                ddragonPatch={ddragonPatch}
              />
            )}
            {activeTab === 'estilo' && <EstiloTab partidas={result.partidas} />}
            {activeTab === 'partidas' && (
              <PartidasTab partidas={result.partidas} championsMeta={championsMeta} ddragonPatch={ddragonPatch} />
            )}
          </div>
        </>
      )}
    </main>
  )
}

export default PlayerAnalysisPage
