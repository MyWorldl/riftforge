import { useEffect, useState } from 'react'
import {
  fetchBuildRecommendation,
  itemImageUrl,
  runeIconUrl,
  type BuildRecommendation,
  type ItemMeta,
  type RuneTree,
} from './api/client'

interface BuildRecommendationPanelProps {
  championId: string
  lane: string
  eloTier: string
  patch: string
  region: string
  itemsMeta: Record<string, ItemMeta> | null
  ddragonPatch: string
  runeTrees: RuneTree[] | null
}

function findRune(runeTrees: RuneTree[] | null, runeId: number | null) {
  if (!runeTrees || runeId == null) return null
  for (const tree of runeTrees) {
    for (const slot of tree.slots) {
      const found = slot.runes.find((r) => r.id === runeId)
      if (found) return found
    }
  }
  return null
}

function findStyle(runeTrees: RuneTree[] | null, styleId: number | null) {
  if (!runeTrees || styleId == null) return null
  return runeTrees.find((t) => t.id === styleId) ?? null
}

export default function BuildRecommendationPanel({
  championId,
  lane,
  eloTier,
  patch,
  region,
  itemsMeta,
  ddragonPatch,
  runeTrees,
}: BuildRecommendationPanelProps) {
  const [build, setBuild] = useState<BuildRecommendation | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBuild(undefined)
    setError(null)
    fetchBuildRecommendation({ championId, lane, eloTier, patch: patch || undefined, region })
      .then(setBuild)
      .catch((err: Error) => setError(err.message))
  }, [championId, lane, eloTier, patch, region])

  if (error) return <p className="error">Não foi possível carregar o build recomendado: {error}</p>
  if (build === undefined) return <p className="filters-loading">Buscando build recomendado...</p>
  if (build === null) {
    return <p className="empty-state">Sem build calculado pra essa rota/elo ainda.</p>
  }

  const keystone = findRune(runeTrees, build.keystone_id)
  const primaryStyle = findStyle(runeTrees, build.primary_style_id)
  const subStyle = findStyle(runeTrees, build.sub_style_id)

  return (
    <div className="build-panel">
      {build.amostra_insuficiente && (
        <p className="explain-missing">
          Amostra pequena — o build/runa abaixo é o mais popular observado, não necessariamente o de
          maior confiança estatística.
        </p>
      )}

      <div className="build-section">
        <span className="build-section-label">
          Itens · {build.item_build_games} {build.item_build_games === 1 ? 'jogo' : 'jogos'} ·{' '}
          {(build.item_build_win_rate * 100).toFixed(1)}% vitórias
        </span>
        <div className="build-item-row">
          {build.item_build.length === 0 && <span className="explain-sub">Sem itens registrados</span>}
          {build.item_build.map((itemId, index) => {
            const meta = itemsMeta?.[String(itemId)]
            return meta && ddragonPatch ? (
              <img
                key={`${itemId}-${index}`}
                src={itemImageUrl(ddragonPatch, meta.image.full)}
                alt={meta.name}
                title={meta.name}
                width={32}
                height={32}
              />
            ) : (
              <span key={`${itemId}-${index}`} className="build-item-unknown" title={String(itemId)} />
            )
          })}
        </div>
      </div>

      <div className="build-section">
        <span className="build-section-label">
          Runas · {build.rune_games} {build.rune_games === 1 ? 'jogo' : 'jogos'} ·{' '}
          {(build.rune_win_rate * 100).toFixed(1)}% vitórias
        </span>
        {keystone ? (
          <div className="build-rune-row">
            <img src={runeIconUrl(keystone.icon)} alt={keystone.name} title={keystone.name} width={28} height={28} />
            <span className="explain-sub">
              {keystone.name}
              {primaryStyle && ` (${primaryStyle.name})`}
              {subStyle && ` + ${subStyle.name}`}
            </span>
          </div>
        ) : (
          <span className="explain-sub">Sem dado de runa pra esse campeão ainda.</span>
        )}
      </div>
    </div>
  )
}
