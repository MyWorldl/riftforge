import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  championImageUrl,
  fetchChampionScores,
  fetchChampions,
  type ChampionMeta,
  type ChampionScoreRow,
} from '../api/client'
import MatchupPanel from '../MatchupPanel'
import { matchesNameSearch } from '../components/championDisplay'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFilterParam } from '../hooks/useFilterParam'
import { CHAMPIONS_COUNTRY_OPTIONS, CHAMPIONS_ENABLED_REGIONS } from '../constants/regions'
import FlagSelect from '../components/FlagSelect'

/** Sprint 4 item 23 (revisão técnica): página dedicada de matchups —
 *  `matchup_repository`/`compute_matchups` já existiam completos desde a
 *  rodada 21, só faltava rota própria + UI; antes só dava pra ver
 *  matchups entrando por `ChampionDetailPage.tsx` (aba "Matchups na
 *  rota"). Reaproveita `MatchupPanel.tsx` como o corpo da página — o que
 *  muda aqui é ter URL própria (compartilhável, sem precisar passar pela
 *  lista de Campeões primeiro) e um seletor de campeão quando nenhum é
 *  passado no path. */

const LANES = [
  { value: 'TOP', label: 'Topo' },
  { value: 'JUNGLE', label: 'Selva' },
  { value: 'MIDDLE', label: 'Meio' },
  { value: 'BOTTOM', label: 'Atirador' },
  { value: 'UTILITY', label: 'Suporte' },
]

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

function MatchupsPage() {
  const { championId } = useParams()
  const navigate = useNavigate()

  useDocumentTitle(championId ? `Matchups — ${championId} — RiftForge` : 'Matchups — RiftForge')

  const [lane, setLane] = useFilterParam('lane', 'TOP')
  const [eloTier, setEloTier] = useFilterParam('eloTier', 'GOLD')
  const [region, setRegion] = useFilterParam('region', 'br1')

  const [championsMeta, setChampionsMeta] = useState<Record<string, ChampionMeta> | null>(null)
  const [ddragonPatch, setDdragonPatch] = useState('')
  const [scores, setScores] = useState<ChampionScoreRow[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchChampions()
      .then((data) => {
        setChampionsMeta(data.champions)
        setDdragonPatch(data.patch)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setScores(null)
    fetchChampionScores({ eloTier, lane, region })
      .then(setScores)
      .catch(() => setScores(null))
  }, [eloTier, lane, region])

  const row = scores?.find((r) => r.champion_id === championId)
  const meta = championId ? championsMeta?.[championId] : undefined

  const candidates = (scores ?? []).filter((r) => matchesNameSearch(r, search, championsMeta))

  return (
    <main className="center center-wide">
      <h1>Matchups</h1>
      <p>Confronto direto entre campeões na mesma rota — quem ganha mais contra quem.</p>

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
      </div>

      {championId && row && (
        <>
          <div className="champion-detail-header champion-detail-header-compact">
            {meta && ddragonPatch && (
              <img src={championImageUrl(ddragonPatch, meta.image.full)} alt="" width={48} height={48} loading="lazy" />
            )}
            <h2>{meta?.name ?? championId}</h2>
            <Link to="/matchups" className="matchups-change-champion">Trocar campeão</Link>
          </div>
          <MatchupPanel
            championId={row.champion_id}
            lane={row.lane}
            eloTier={row.elo_tier}
            patch={row.patch}
            region={row.region}
            championsMeta={championsMeta}
            ddragonPatch={ddragonPatch}
          />
        </>
      )}

      {championId && scores && !row && (
        <p className="empty-state">
          Sem score calculado pra {championId} nessa rota/elo/região ainda — escolha outro campeão ou troque o
          filtro.
        </p>
      )}

      {!championId && (
        <div className="compare-tab-picker matchups-picker">
          <input
            type="text"
            placeholder="Buscar campeão"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="compare-tab-suggestions matchups-suggestions">
            {scores === null && <li className="explain-sub">Carregando...</li>}
            {scores !== null && candidates.length === 0 && (
              <li className="explain-sub">Nenhum campeão encontrado pra essa rota/elo/região.</li>
            )}
            {candidates.map((r) => {
              const m = championsMeta?.[r.champion_id]
              return (
                <li key={r.champion_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/matchups/${r.champion_id}?lane=${lane}&eloTier=${eloTier}&region=${region}`)}
                  >
                    {m && ddragonPatch && (
                      <img src={championImageUrl(ddragonPatch, m.image.full)} alt="" width={22} height={22} loading="lazy" />
                    )}
                    <span>{m?.name ?? r.champion_id}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </main>
  )
}

export default MatchupsPage
