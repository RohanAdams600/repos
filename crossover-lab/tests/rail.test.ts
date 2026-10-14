import { describe, expect, it } from 'vitest'
import { allAthletes } from '../src/data/roster'
import { filterAthletes, groupByTeam, LEAGUE_STATUSES } from '../src/ui/rail'

describe('rail filters', () => {
  const all = allAthletes()
  it('keeps one league at a time', () => {
    for (const l of ['NFL', 'MLB', 'NBA'] as const) expect(filterAthletes(all, l, '', 'all').every((a) => a.league === l)).toBe(true)
  })
  it('searches name, team and position, case-insensitively', () => {
    const hits = filterAthletes(all, 'NFL', 'colts', 'all')
    expect(hits.some((a) => a.id === 'jonathan-taylor')).toBe(true)
    expect(filterAthletes(all, 'NFL', 'TAYLOR', 'all').some((a) => a.id === 'jonathan-taylor')).toBe(true)
    expect(filterAthletes(all, 'NFL', 'zzzz-nobody', 'all')).toEqual([])
  })
  it('filters by roster status', () => {
    const legends = filterAthletes(all, 'NFL', '', 'legend')
    expect(legends.length).toBeGreaterThan(0)
    expect(legends.every((a) => a.status === 'legend')).toBe(true)
  })
  it('offers practice squads only in the NFL and two-way and 10-day only in the NBA', () => {
    expect(LEAGUE_STATUSES.NFL).toContain('practice-squad')
    expect(LEAGUE_STATUSES.NBA).toEqual(expect.arrayContaining(['two-way', 'ten-day']))
    expect(LEAGUE_STATUSES.MLB).not.toContain('practice-squad')
  })
})

describe('rail grouping', () => {
  it('puts athletes under their club and legends and free agents in their own groups', () => {
    const nfl = filterAthletes(allAthletes(), 'NFL', '', 'all')
    const { byTeam, unattached } = groupByTeam(nfl, 'NFL')
    expect(byTeam.get('nfl-ind')?.some((a) => a.id === 'jonathan-taylor')).toBe(true)
    for (const a of unattached.get('Legends') ?? []) expect(a.status).toBe('legend')
    const placed = [...byTeam.values(), ...unattached.values()].flat()
    expect(placed.length).toBe(nfl.length)
  })
})
