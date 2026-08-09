import { describe, expect, it } from 'vitest'
import type { ChampionScoreRow, KitProfileRow } from '../api/client'
import { DEFAULT_PLAYSTYLE, meetsMinTier, rankChampions } from './recommendation'

function champion(overrides: Partial<ChampionScoreRow> & Pick<ChampionScoreRow, 'champion_id' | 'score_tier' | 'score_final'>): ChampionScoreRow {
  return {
    lane: 'MIDDLE',
    patch: '16.15',
    elo_tier: 'GOLD',
    region: 'br1',
    n_matches: 100,
    win_rate: 0.5,
    pick_rate: 0.1,
    ban_rate: 0.05,
    confianca: 100,
    tier_provisorio: false,
    trap_flag: false,
    performance_score: 50,
    kit_score: 50,
    build_score: 50,
    meta_score: 50,
    skill_expression: null,
    ...overrides,
  }
}

function kit(championId: string, overrides: Partial<KitProfileRow> = {}): KitProfileRow {
  return { champion_id: championId, dano_score: 5, alcance_score: 5, resiliencia_score: 5, ...overrides }
}

describe('meetsMinTier', () => {
  it('aceita um tier estritamente melhor que o mínimo', () => {
    expect(meetsMinTier('S', 'A')).toBe(true)
  })

  it('aceita um tier igual ao mínimo', () => {
    expect(meetsMinTier('A', 'A')).toBe(true)
  })

  it('rejeita um tier pior que o mínimo', () => {
    expect(meetsMinTier('B', 'A')).toBe(false)
  })

  it('GOD é o melhor tier possível', () => {
    expect(meetsMinTier('GOD', 'S')).toBe(true)
    expect(meetsMinTier('S', 'GOD')).toBe(false)
  })

  it('rejeita tier desconhecido em vez de lançar', () => {
    expect(meetsMinTier('X', 'A')).toBe(false)
    expect(meetsMinTier('A', 'X')).toBe(false)
  })
})

describe('rankChampions', () => {
  const rows = [
    champion({ champion_id: 'Ahri', score_tier: 'S', score_final: 80 }),
    champion({ champion_id: 'Zed', score_tier: 'A', score_final: 70 }),
    champion({ champion_id: 'Garen', score_tier: 'B', score_final: 60 }),
  ]

  it('filtra campeões abaixo do tier mínimo', () => {
    const result = rankChampions(rows, new Map(), {
      minTier: 'A',
      useProfile: false,
      preference: DEFAULT_PLAYSTYLE,
    })
    expect(result.map((r) => r.row.champion_id)).toEqual(['Ahri', 'Zed'])
  })

  it('v0 (sem perfil): ordena só por score_final desc', () => {
    const result = rankChampions(rows, new Map(), {
      minTier: 'B',
      useProfile: false,
      preference: DEFAULT_PLAYSTYLE,
    })
    expect(result.map((r) => r.row.champion_id)).toEqual(['Ahri', 'Zed', 'Garen'])
  })

  it('v1 (com perfil): ordena por distância euclidiana ao perfil de jogo', () => {
    const kitByChampionId = new Map([
      ['Ahri', kit('Ahri', { dano_score: 9, alcance_score: 9, resiliencia_score: 1 })],
      ['Zed', kit('Zed', { dano_score: 5, alcance_score: 5, resiliencia_score: 5 })],
    ])
    // Preferência idêntica ao perfil de Zed — Zed deve vir primeiro mesmo
    // tendo score_final menor que Ahri.
    const result = rankChampions(rows, kitByChampionId, {
      minTier: 'B',
      useProfile: true,
      preference: { dano: 5, alcance: 5, resiliencia: 5 },
    })
    expect(result[0].row.champion_id).toBe('Zed')
    expect(result[0].distance).toBe(0)
  })

  it('v1: campeão sem perfil de Kit cai pro fim, ordenado por score', () => {
    const kitByChampionId = new Map([['Ahri', kit('Ahri')]])
    const result = rankChampions(rows, kitByChampionId, {
      minTier: 'B',
      useProfile: true,
      preference: DEFAULT_PLAYSTYLE,
    })
    // Zed e Garen não têm perfil de Kit — ficam depois de Ahri, entre eles
    // ordenados por score_final desc (Zed 70 > Garen 60).
    expect(result.map((r) => r.row.champion_id)).toEqual(['Ahri', 'Zed', 'Garen'])
    expect(result[1].distance).toBeNull()
    expect(result[2].distance).toBeNull()
  })
})
