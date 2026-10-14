import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete } from '../src/data/types'
import {
  BALL_AND_HAND_IN,
  canDunk,
  COMFORT_MARGIN_IN,
  dunkContest,
  dunkMakeProbability,
  dunkPlan,
  DUNKS,
  ISO_MOVES,
  isoPossessions,
  judgeDunk,
  JUDGE_MAX,
  JUDGE_MIN,
  MAX_ATTEMPTS,
  oneOnOneShootout,
  REACH_PER_HEIGHT,
  RIM_HEIGHT_IN,
  TIEBREAK_ZONE,
} from '../src/sim/nba-events'
import { createRng } from '../src/sim/rng'
import { ZONES, type Zone } from '../src/sim/shooting'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

function clone(a: Athlete, edit: (c: Athlete) => void, id = `${a.id}-clone`): Athlete {
  const c = structuredClone(a)
  c.id = id
  edit(c)
  return c
}

/** Short, low-jumping clone that cannot reach the rim. */
const grounded = clone(
  mitchell,
  (c) => {
    delete c.metrics.standingReachIn
    c.metrics.heightIn = { value: 66, quality: 'SIMULATED' }
    c.metrics.maxVerticalIn = { value: 12, quality: 'SIMULATED' }
  },
  'grounded',
)

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

describe('canDunk', () => {
  it('uses the profile reach and never labels the result better than ESTIMATED', () => {
    const d = canDunk(mitchell)
    expect(d.standingReachIn).toBe(99)
    expect(d.verticalIn).toBe(40.5)
    expect(d.maxReachIn).toBeCloseTo(139.5, 6)
    expect(d.clearanceIn).toBeCloseTo(139.5 - RIM_HEIGHT_IN - BALL_AND_HAND_IN, 6)
    expect(d.canDunk).toBe(true)
    // His reach is a simulated figure, so the check is too.
    expect(d.quality).toBe('SIMULATED')

    const measured = clone(mitchell, (c) => {
      c.metrics.standingReachIn = { value: 99, quality: 'VERIFIED', sourceId: 'draftexpress' }
    })
    expect(canDunk(measured).quality).toBe('ESTIMATED')
  })

  it('estimates reach as 1.33 x height when the profile has none', () => {
    const d = canDunk(taylor)
    expect(d.standingReachIn).toBeCloseTo(REACH_PER_HEIGHT * 70, 6)
    expect(d.clearanceIn).toBeCloseTo(REACH_PER_HEIGHT * 70 + 36 - 126, 6)
    expect(d.quality).toBe('ESTIMATED')
    expect(d.basis).toContain('1.33')
  })

  it('gives a higher-vertical clone more clearance, inch for inch', () => {
    const hops = clone(mitchell, (c) => {
      c.metrics.maxVerticalIn = { value: 45, quality: 'SIMULATED' }
    })
    expect(canDunk(hops).clearanceIn).toBeGreaterThan(canDunk(mitchell).clearanceIn)
    expect(canDunk(hops).clearanceIn - canDunk(mitchell).clearanceIn).toBeCloseTo(4.5, 6)
  })

  it('says when an athlete cannot dunk', () => {
    const d = canDunk(grounded)
    expect(d.clearanceIn).toBeLessThan(0)
    expect(d.canDunk).toBe(false)
  })

  it('falls back to a simulated 74 in athlete with no height or reach', () => {
    const blank = clone(mitchell, (c) => {
      delete c.metrics.standingReachIn
      delete c.metrics.heightIn
    })
    const d = canDunk(blank)
    expect(d.standingReachIn).toBeCloseTo(REACH_PER_HEIGHT * 74, 6)
    expect(d.quality).toBe('SIMULATED')
  })
})

describe('dunk catalogue', () => {
  it('lists eight distinct dunks with difficulty 1 to 10 and harder dunks needing more clearance', () => {
    expect(DUNKS).toHaveLength(8)
    expect(new Set(DUNKS.map((d) => d.id)).size).toBe(8)
    for (const d of DUNKS) {
      expect(d.difficulty).toBeGreaterThanOrEqual(1)
      expect(d.difficulty).toBeLessThanOrEqual(10)
    }
    const byDifficulty = [...DUNKS].sort((x, y) => x.difficulty - y.difficulty)
    for (let i = 1; i < byDifficulty.length; i++) expect(byDifficulty[i]!.requiredClearanceIn).toBeGreaterThanOrEqual(byDifficulty[i - 1]!.requiredClearanceIn)
    expect(DUNKS.map((d) => d.id)).toEqual(expect.arrayContaining(['two-hand', 'one-hand', 'tomahawk', 'reverse', 'windmill', '360', 'between-the-legs', 'free-throw-line']))
  })

  it('makes dunks less likely as the margin shrinks and difficulty rises', () => {
    expect(dunkMakeProbability(-0.1, 1)).toBe(0)
    expect(dunkMakeProbability(1, 5)).toBeLessThan(dunkMakeProbability(4, 5))
    expect(dunkMakeProbability(4, 5)).toBeLessThan(dunkMakeProbability(10, 5))
    expect(dunkMakeProbability(4, 9)).toBeLessThan(dunkMakeProbability(4, 2))
    for (const m of [0, 0.5, 3, 20, 100]) {
      const p = dunkMakeProbability(m, 10)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    }
  })

  it('opens with the hardest dunk cleared with margin to spare, and never plans one out of reach', () => {
    const check = canDunk(mitchell)
    const plan = dunkPlan(check)
    const comfortable = DUNKS.filter((d) => check.clearanceIn - d.requiredClearanceIn >= COMFORT_MARGIN_IN)
    const hardest = Math.max(...comfortable.map((d) => d.difficulty))
    expect(plan[0]!.difficulty).toBe(hardest)
    for (const d of plan) expect(check.clearanceIn - d.requiredClearanceIn).toBeGreaterThanOrEqual(0)
    expect(dunkPlan(canDunk(grounded))).toEqual([])
  })
})

describe('dunkContest', () => {
  it('replays the same contest for the same seed', () => {
    const run = (seed: number) => JSON.stringify(dunkContest([taylor, ohtani, mitchell], 3, createRng(seed)))
    expect(run(11)).toBe(run(11))
    expect(run(11)).not.toBe(run(12))
  })

  it('always scores five integer judges from 6 to 10, with up to three attempts', () => {
    for (const seed of SEEDS) {
      const c = dunkContest([taylor, ohtani, mitchell, grounded], 4, createRng(seed))
      for (const e of c.entries) {
        expect(e.rounds).toHaveLength(4)
        for (const r of e.rounds) {
          expect(r.judges).toHaveLength(5)
          for (const j of r.judges) {
            expect(Number.isInteger(j)).toBe(true)
            expect(j).toBeGreaterThanOrEqual(JUDGE_MIN)
            expect(j).toBeLessThanOrEqual(JUDGE_MAX)
          }
          expect(r.total).toBe(r.judges.reduce((s, x) => s + x, 0))
          expect(r.attempts).toBeGreaterThanOrEqual(1)
          expect(r.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS)
          if (!r.made) expect(r.attempts).toBe(MAX_ATTEMPTS)
        }
        expect(e.total).toBe(e.rounds.reduce((s, r) => s + r.total, 0))
      }
    }
  })

  it('crowns the highest total and lists the standings in order', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const c = dunkContest([taylor, ohtani, mitchell], 3, createRng(seed))
      const totals = c.standings.map((k) => c.totals[k]!)
      for (let i = 1; i < totals.length; i++) expect(totals[i - 1]!).toBeGreaterThanOrEqual(totals[i]!)
      expect(c.winner).toBe(c.standings[0])
      expect(c.totals[c.winner!]).toBe(Math.max(...Object.values(c.totals)))
      expect(c.quality).toBe('SIMULATED')
    }
  })

  it('gives a non-dunker layups, scored low, and says so', () => {
    const c = dunkContest([grounded, mitchell], 3, createRng(5))
    const e = c.entries[0]!
    expect(e.layupsOnly).toBe(true)
    expect(e.note).toMatch(/cannot dunk/)
    expect(e.note).toMatch(/layup/)
    for (const r of e.rounds) {
      expect(r.dunk).toBe('layup')
      for (const j of r.judges) expect(j).toBeLessThanOrEqual(JUDGE_MIN + 1)
    }
    expect(c.entries[1]!.layupsOnly).toBe(false)
    expect(c.winner).toBe(mitchell.id)
  })

  it('makes each athlete try his planned dunks in order', () => {
    const c = dunkContest([mitchell], 2, createRng(9))
    const plan = dunkPlan(canDunk(mitchell))
    expect(c.entries[0]!.rounds.map((r) => r.dunk)).toEqual(plan.slice(0, 2).map((d) => d.id))
  })

  it('has judges reward difficulty and dock retries and repeats', () => {
    const mean = (difficulty: number, attempts: number, repeat: boolean) => {
      const rng = createRng(21)
      let sum = 0
      for (let i = 0; i < 400; i++) sum += judgeDunk(difficulty, attempts, repeat, rng).reduce((s, x) => s + x, 0)
      return sum / 400
    }
    expect(mean(9, 1, false)).toBeGreaterThan(mean(2, 1, false) + 5)
    expect(mean(6, 3, false)).toBeLessThan(mean(6, 1, false))
    expect(mean(6, 1, true)).toBeLessThan(mean(6, 1, false))
  })

  it('handles an empty field, zero rounds and a mirror match', () => {
    const empty = dunkContest([], 3, createRng(1))
    expect(empty.entries).toEqual([])
    expect(empty.winner).toBeUndefined()

    const none = dunkContest([taylor, mitchell], 0, createRng(1))
    expect(none.entries.every((e) => e.rounds.length === 0 && e.total === 0)).toBe(true)
    expect(none.winner).toBe(mitchell.id)
    expect(none.tiebreak).toMatch(/clearance/)

    const mirror = dunkContest([mitchell, mitchell], 2, createRng(3))
    expect(Object.keys(mirror.totals)).toEqual([mitchell.id, `${mitchell.id}-2`])
    expect(mirror.entries.map((e) => e.athleteId)).toEqual([mitchell.id, mitchell.id])
  })
})

describe('isoPossessions', () => {
  it('replays the same possessions for the same seed', () => {
    const run = (seed: number) => JSON.stringify(isoPossessions(mitchell, taylor, 50, createRng(seed)))
    expect(run(4)).toBe(run(4))
    expect(run(4)).not.toBe(run(5))
  })

  it('keeps points per possession within 0 to 3 and every possession consistent', () => {
    const pairs: [Athlete, Athlete][] = [
      [mitchell, mitchell],
      [mitchell, taylor],
      [taylor, mitchell],
      [ohtani, grounded],
    ]
    for (const [h, d] of pairs) {
      for (const seed of SEEDS.slice(0, 10)) {
        const r = isoPossessions(h, d, 60, createRng(seed))
        expect(r.possessions).toHaveLength(60)
        expect(r.pointsPerPossession).toBeGreaterThanOrEqual(0)
        expect(r.pointsPerPossession).toBeLessThanOrEqual(3)
        expect(r.points).toBe(r.possessions.reduce((s, p) => s + p.points, 0))
        expect(r.quality).toBe('SIMULATED')
        for (const p of r.possessions) {
          expect(ISO_MOVES[p.move].zones).toContain(p.zone)
          expect(p.clockS).toBeGreaterThanOrEqual(2)
          expect(p.clockS).toBeLessThanOrEqual(24)
          expect(p.p).toBeGreaterThan(0)
          expect(p.p).toBeLessThan(1)
          const three = ZONES[p.zone].three
          if (p.result === 'make2') expect([p.points, three]).toEqual([2, false])
          if (p.result === 'make3') expect([p.points, three]).toEqual([3, true])
          if (p.result === 'miss' || p.result === 'turnover') expect(p.points).toBe(0)
          if (p.result === 'foul') expect(p.points).toBeLessThanOrEqual(three ? 3 : 2)
        }
      }
    }
  })

  it('handles zero, negative and fractional possession counts', () => {
    expect(isoPossessions(mitchell, taylor, 0, createRng(1))).toMatchObject({ possessions: [], points: 0, pointsPerPossession: 0 })
    expect(isoPossessions(mitchell, taylor, -3, createRng(1)).possessions).toHaveLength(0)
    expect(isoPossessions(mitchell, taylor, 2.9, createRng(1)).possessions).toHaveLength(2)
  })

  it('favours the guard with the ball against a non-basketball defender', () => {
    const guard = isoPossessions(mitchell, taylor, 1500, createRng(8))
    const back = isoPossessions(taylor, mitchell, 1500, createRng(8))
    expect(guard.edge).toBeGreaterThan(0)
    expect(back.edge).toBeLessThan(0)
    expect(guard.pointsPerPossession).toBeGreaterThan(back.pointsPerPossession)
    const turnovers = (r: typeof guard) => r.possessions.filter((p) => p.result === 'turnover').length
    expect(turnovers(back)).toBeGreaterThan(turnovers(guard))
  })

  it('reads lane agility and wingspan into the matchup', () => {
    const quick = clone(taylor, (c) => {
      c.metrics.laneAgilityS = { value: 10.2, quality: 'SIMULATED' }
    })
    const long = clone(taylor, (c) => {
      c.metrics.wingspanIn = { value: 84, quality: 'SIMULATED' }
    })
    const base = isoPossessions(mitchell, taylor, 0, createRng(1))
    expect(isoPossessions(mitchell, quick, 0, createRng(1)).edge).toBeLessThan(base.edge)
    expect(isoPossessions(mitchell, long, 0, createRng(1)).contestIn).toBeGreaterThan(base.contestIn)
    expect(base.contestIn).toBeCloseTo(71.5 - 74, 6)
  })

  it('reports a move mix that sums to one', () => {
    const r = isoPossessions(mitchell, mitchell, 0, createRng(1))
    expect(Object.values(r.moveShare).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9)
  })
})

describe('oneOnOneShootout', () => {
  const SPOTS: Zone[] = ['rim', 'midLeft', 'cornerRight', 'top']

  it('replays the same shootout for the same seed', () => {
    const run = (seed: number) => JSON.stringify(oneOnOneShootout(mitchell, ohtani, SPOTS, 3, createRng(seed)))
    expect(run(2)).toBe(run(2))
    expect(run(2)).not.toBe(run(3))
  })

  it('alternates shooters and scores two inside the arc, three outside', () => {
    const r = oneOnOneShootout(mitchell, ohtani, SPOTS, 3, createRng(6))
    expect(r.shots).toHaveLength(SPOTS.length * 3 * 2)
    r.shots.forEach((s, i) => {
      expect(s.shooter).toBe(i % 2 === 0 ? mitchell.id : ohtani.id)
      expect(s.points).toBe(s.made ? (ZONES[s.zone].three ? 3 : 2) : 0)
    })
    for (const id of r.ids) expect(r.scores[id]).toBe(r.shots.filter((s) => s.shooter === id).reduce((t, s) => t + s.points, 0))
    expect(r.quality).toBe('SIMULATED')
  })

  it('always has a winner, through sudden death from the top of the key when tied', () => {
    let suddenDeaths = 0
    for (const seed of SEEDS) {
      for (const spots of [SPOTS, ['freeThrow'] as Zone[], [] as Zone[]]) {
        const r = oneOnOneShootout(taylor, ohtani, spots, 1, createRng(seed))
        expect(r.ids).toContain(r.winner)
        const [a, b] = r.ids
        if (r.scores[a] !== r.scores[b]) {
          expect(r.decidedBy).toBe('regulation')
          expect(r.tiebreakShots).toEqual([])
          expect(r.scores[r.winner]).toBe(Math.max(r.scores[a]!, r.scores[b]!))
        } else {
          suddenDeaths++
          expect(r.decidedBy).not.toBe('regulation')
          expect(r.tiebreakShots.length % 2).toBe(0)
          expect(r.tiebreakShots.every((s) => s.zone === TIEBREAK_ZONE)).toBe(true)
          if (r.decidedBy === 'sudden-death') {
            const last = r.tiebreakShots.slice(-2)
            expect(last[0]!.made).not.toBe(last[1]!.made)
            expect(last.find((s) => s.made)!.shooter).toBe(r.winner)
          }
        }
      }
    }
    expect(suddenDeaths).toBeGreaterThan(0)
  })

  it('still finds a winner between two shooters who cannot score', () => {
    const brick = (id: string) =>
      clone(
        mitchell,
        (c) => {
          c.metrics.threePointPct = { value: 0, quality: 'SIMULATED' }
          c.metrics.rimFinishPct = { value: 0, quality: 'SIMULATED' }
          c.metrics.midRangePct = { value: 0, quality: 'SIMULATED' }
          c.seasons = []
        },
        id,
      )
    for (const seed of SEEDS.slice(0, 10)) {
      const r = oneOnOneShootout(brick('brick-a'), brick('brick-b'), ['top'], 2, createRng(seed))
      expect(['brick-a', 'brick-b']).toContain(r.winner)
    }
  })

  it('keeps two score lines in a mirror match', () => {
    const r = oneOnOneShootout(mitchell, mitchell, SPOTS, 2, createRng(1))
    expect(r.ids).toEqual([mitchell.id, `${mitchell.id}-2`])
    expect(Object.keys(r.scores)).toHaveLength(2)
    expect(r.ids).toContain(r.winner)
  })
})
