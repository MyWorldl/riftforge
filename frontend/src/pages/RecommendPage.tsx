import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  championImageUrl,
  fetchChampionScores,
  fetchChampions,
  fetchKitProfile,
  type ChampionMeta,
  type ChampionScoreRow,
  type KitProfileRow,
} from '../api/client'
import FlagSelect from '../components/FlagSelect'
import { formatPct } from '../components/championDisplay'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { CHAMPIONS_COUNTRY_OPTIONS, CHAMPIONS_ENABLED_REGIONS } from '../constants/regions'
import { DEFAULT_PLAYSTYLE, TIER_ORDER, rankChampions, type PlaystylePreference } from '../lib/recommendation'

/** Recomendação de campeão v0+v1 (revisão técnica §6, Tier 2) — página
 *  nova, wizard. v2 (contrapick) fica fora de propósito: já existe na
 *  aba Matchups da página de detalhe (rodada 21), decisão explícita do
 *  usuário. Rota é obrigatória aqui (diferente de Campeões) — recomendar
 *  "pra qualquer rota" não faz sentido no contexto de escolher o que
 *  jogar. */
const LANES = [
  { value: 'TOP', label: 'Topo' },
  { value: 'JUNGLE', label: 'Selva' },
  { value: 'MIDDLE', label: 'Meio' },
  { value: 'BOTTOM', label: 'Atirador' },
  { value: 'UTILITY', label: 'Suporte' },
]

/** Mesma duplicação local de `ChampionsPage.tsx` — só GOLD tem dado real
 *  coletado hoje (`collect-matches.yml`), os demais ficam "(em breve)". */
const TIER_ICONS: Record<string, string> = {
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

const ELO_SELECT_OPTIONS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
].map((t) => ({ value: t, label: t, flag: TIER_ICONS[t], disabled: t !== 'GOLD' }))

const REGION_SELECT_OPTIONS = CHAMPIONS_COUNTRY_OPTIONS.map((c) => ({
  ...c,
  disabled: !CHAMPIONS_ENABLED_REGIONS.includes(c.value),
}))

function detailHref(championId: string, eloTier: string, lane: string, patch: string, region: string): string {
  const params = new URLSearchParams({ eloTier, lane, patch, region })
  return `/campeoes/${championId}?${params}`
}

function RecommendPage() {
  useDocumentTitle('Recomendação de Campeão — RiftForge')

  const [lane, setLane] = useState('TOP')
  const [eloTier, setEloTier] = useState('GOLD')
  const [region, setRegion] = useState('br1')
  const [minTier, setMinTier] = useState('C')
  const [useProfile, setUseProfile] = useState(false)
  const [preference, setPreference] = useState<PlaystylePreference>(DEFAULT_PLAYSTYLE)

  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')

  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [scoresError, setScoresError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [kitProfile, setKitProfile] = useState<KitProfileRow[] | null>(null)

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setScoresError(null)
    fetchChampionScores({ eloTier, lane, region }, controller.signal)
      .then((data) => setScores(data))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setScoresError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [eloTier, lane, region])

  // Perfil de Kit segue o mesmo patch que os scores já resolveram — não
  // pode ser resolvido de forma independente ("mais recente com score"
  // e "mais recente com Kit calculado" podem divergir, ver plano da
  // rodada 27 — decisão de escopo §3). Buscado sempre que há score,
  // independente do toggle, pra ligar "usar perfil" ser instantâneo.
  const resolvedPatch = scores && scores.length > 0 ? scores[0].patch : null
  useEffect(() => {
    if (!resolvedPatch) {
      setKitProfile(null)
      return
    }
    const controller = new AbortController()
    fetchKitProfile(resolvedPatch, controller.signal)
      .then((result) => setKitProfile(result.perfis))
      .catch(() => setKitProfile(null))
    return () => controller.abort()
  }, [resolvedPatch])

  const kitByChampionId = useMemo(
    () => new Map((kitProfile ?? []).map((k) => [k.champion_id, k])),
    [kitProfile],
  )

  const ranked = useMemo(
    () => rankChampions(scores ?? [], kitByChampionId, { minTier, useProfile, preference }),
    [scores, kitByChampionId, minTier, useProfile, preference],
  )

  const topResults = ranked.slice(0, 20)

  return (
    <main className="center center-wide">
      <h1>Recomendação de Campeão</h1>
      <p>Diz sua rota, elo e o tier mínimo que você aceita — a gente ranqueia por score, e por perfil de jogo se você quiser.</p>

      <div className="filters">
        <label>
          Rota
          <select value={lane} onChange={(e) => setLane(e.target.value)}>
            {LANES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>

        <label>
          Elo
          <FlagSelect options={ELO_SELECT_OPTIONS} value={eloTier} onChange={setEloTier} iconShape="contain" />
        </label>

        <label>
          Região
          <FlagSelect options={REGION_SELECT_OPTIONS} value={region} onChange={setRegion} />
        </label>

        <label>
          Tier mínimo
          <select value={minTier} onChange={(e) => setMinTier(e.target.value)}>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {loading && <span className="filters-loading" role="status">Buscando...</span>}
      </div>

      <label className="recommend-profile-toggle">
        <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} />
        Usar perfil de jogo
      </label>

      <div className="recommend-sliders">
        <label className="playstyle-slider">
          Dano
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={preference.dano}
            disabled={!useProfile}
            onChange={(e) => setPreference((p) => ({ ...p, dano: Number(e.target.value) }))}
          />
          <span>{preference.dano}</span>
        </label>
        <label className="playstyle-slider">
          Alcance
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={preference.alcance}
            disabled={!useProfile}
            onChange={(e) => setPreference((p) => ({ ...p, alcance: Number(e.target.value) }))}
          />
          <span>{preference.alcance}</span>
        </label>
        <label className="playstyle-slider">
          Resiliência
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={preference.resiliencia}
            disabled={!useProfile}
            onChange={(e) => setPreference((p) => ({ ...p, resiliencia: Number(e.target.value) }))}
          />
          <span>{preference.resiliencia}</span>
        </label>
      </div>

      {scoresError && <p className="error" role="alert">Backend indisponível: {scoresError}</p>}

      {!scoresError && scores && scores.length === 0 && (
        <p className="empty-state">Sem score calculado pra essa rota/elo/região ainda.</p>
      )}

      {!scoresError && scores && scores.length > 0 && ranked.length === 0 && (
        <p className="empty-state">Nenhum campeão atinge o tier mínimo escolhido.</p>
      )}

      {topResults.length > 0 && (
        <ol className="recommend-results">
          {topResults.map(({ row, kit }) => {
            const meta = championsMeta?.[row.champion_id]
            return (
              <li key={row.champion_id} className="recommend-result">
                <Link
                  to={detailHref(row.champion_id, row.elo_tier, row.lane, row.patch, row.region)}
                  className="champion-cell"
                >
                  {meta && ddragonPatch && (
                    <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={32} height={32} />
                  )}
                  <span>{meta?.name ?? row.champion_id}</span>
                </Link>
                <span className={`tier-badge tier-${row.score_tier}`}>{row.score_tier}</span>
                <span>{formatPct(row.win_rate)} vitórias</span>
                {useProfile && kit && (
                  <span className="recommend-axes">
                    Dano {kit.dano_score ?? '—'} · Alcance{' '}
                    {kit.alcance_score != null ? kit.alcance_score.toFixed(1) : '—'} · Resiliência{' '}
                    {kit.resiliencia_score ?? '—'}
                  </span>
                )}
                {useProfile && !kit && (
                  <span className="recommend-axes">Sem dado de Kit pra esse patch</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}

export default RecommendPage
