import { describe, expect, it } from 'vitest'
import type { ChampionScoreRow } from '../api/client'
import { sortScores } from './ChampionsPage'

function champion(overrides: Partial<ChampionScoreRow> & Pick<ChampionScoreRow, 'champion_id'>): ChampionScoreRow {
  return {
    lane: 'MIDDLE',
    patch: '16.15',
    elo_tier: 'GOLD',
    region: 'br1',
    n_matches: 100,
    win_rate: 0.5,
    pick_rate: 0.1,
    ban_rate: 0.05,
    score_final: 50,
    score_tier: 'A',
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

describe('sortScores', () => {
  const rows = [
    champion({ champion_id: 'Ahri', score_final: 70, win_rate: 0.55, pick_rate: 0.2, ban_rate: 0.1 }),
    champion({ champion_id: 'Zed', score_final: 90, win_rate: 0.45, pick_rate: 0.05, ban_rate: 0.3 }),
    champion({ champion_id: 'Garen', score_final: 80, win_rate: 0.6, pick_rate: 0.1, ban_rate: 0.02 }),
  ]

  it('ordena por score desc por padrão', () => {
    expect(sortScores(rows, 'score', 'desc').map((r) => r.champion_id)).toEqual(['Zed', 'Garen', 'Ahri'])
  })

  it('ordena por score asc', () => {
    expect(sortScores(rows, 'score', 'asc').map((r) => r.champion_id)).toEqual(['Ahri', 'Garen', 'Zed'])
  })

  it('ordena por win_rate', () => {
    expect(sortScores(rows, 'win_rate', 'desc').map((r) => r.champion_id)).toEqual(['Garen', 'Ahri', 'Zed'])
  })

  it('ordena por pick_rate', () => {
    expect(sortScores(rows, 'pick_rate', 'desc').map((r) => r.champion_id)).toEqual(['Ahri', 'Garen', 'Zed'])
  })

  it('ordena por ban_rate', () => {
    expect(sortScores(rows, 'ban_rate', 'desc').map((r) => r.champion_id)).toEqual(['Zed', 'Ahri', 'Garen'])
  })

  it('trata win_rate/pick_rate/ban_rate nulos como o pior valor (-1)', () => {
    const withNull = [
      champion({ champion_id: 'SemDado', win_rate: null }),
      champion({ champion_id: 'ComDado', win_rate: 0.1 }),
    ]
    expect(sortScores(withNull, 'win_rate', 'desc').map((r) => r.champion_id)).toEqual(['ComDado', 'SemDado'])
  })

  it('não modifica o array original', () => {
    const original = [...rows]
    sortScores(rows, 'score', 'asc')
    expect(rows).toEqual(original)
  })
})
