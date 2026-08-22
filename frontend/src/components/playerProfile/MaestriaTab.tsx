import { useEffect, useState } from 'react'
import { fetchPlayerMastery, type ChampionMeta, type PlayerMasteryResult } from '../../api/client'
import { ChampionPortrait, championName, formatEpochMs } from './shared'

/** Selo "Monochampion" (16/08): calculado sobre histórico retido (até 30
 *  dias, ver `_determine_monochampion`). `ativo` exige amostra mínima E
 *  concentração média acima do limiar — antes disso mostra estado
 *  "acumulando" em vez de esconder o dado (mesmo espírito do
 *  `tier_provisorio` em Campeões). `null` só na primeiríssima busca desse
 *  jogador, quando ainda não existe snapshot nenhum.
 *
 *  Ajuste 21/08: `showAccumulatingCaption` esconde a legenda "(acumulando
 *  histórico)"/"selo acende com histórico suficiente" no Invocador — os
 *  números continuam aparecendo, só a ressalva de pouco histórico some,
 *  mesmo pedido que motivou `SeasonProgressCard`'s `showRetroactiveNote`. */
function MonochampionBadge({
  info,
  championsMeta,
  ddragonPatch,
  showAccumulatingCaption = true,
}: {
  info: PlayerMasteryResult['monochampion']
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  showAccumulatingCaption?: boolean
}) {
  if (!info) return null
  const pct = Math.round(info.concentracao_media * 100)

  return (
    <div className={`monochampion-badge ${info.ativo ? 'monochampion-badge-ativo' : 'monochampion-badge-acumulando'}`}>
      <ChampionPortrait championId={info.champion_id} championsMeta={championsMeta} ddragonPatch={ddragonPatch} size={32} />
      <div className="mastery-item-info">
        <strong>
          {info.ativo || !showAccumulatingCaption ? 'Monochampion' : 'Monochampion (acumulando histórico)'}
          {': '}
          {championName(info.champion_id, championsMeta)}
        </strong>
        <span className="explain-sub">
          {pct}% de concentração média · {info.amostras} {info.amostras === 1 ? 'dia retido' : 'dias retidos'}
          {!info.ativo && showAccumulatingCaption && ' · selo acende com histórico suficiente'}
        </span>
      </div>
    </div>
  )
}

/** Aba Maestria (Sprint 4 bloco 3): endpoint próprio, sob demanda — só
 *  busca na primeira vez que a aba é aberta, não junto do lookup
 *  principal (ver `app/services/player_mastery_service.py`). */
export default function MaestriaTab({
  region,
  gameName,
  tagLine,
  championsMeta,
  ddragonPatch,
  showAccumulatingCaption = true,
}: {
  region: string
  gameName: string
  tagLine: string
  championsMeta: Record<string, ChampionMeta> | null
  ddragonPatch: string
  showAccumulatingCaption?: boolean
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
      <MonochampionBadge
        info={mastery.monochampion}
        championsMeta={championsMeta}
        ddragonPatch={ddragonPatch}
        showAccumulatingCaption={showAccumulatingCaption}
      />
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
