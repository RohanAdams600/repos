import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete } from '../src/data/types'
import { carry, makeBatter, makePitcher, pitchFlight, pitchPosition, simulateDuel } from '../src/sim/atbat'
import { blendAthletes } from '../src/sim/build'
import { mondayOf, weeklyCard } from '../src/sim/dynasty'
import { jumpValue, repsAt } from '../src/sim/events'
import { sayersPowerW, strengthAtReference } from '../src/sim/normalize'
import { createRng } from '../src/sim/rng'
import { freeThrowContest, makeProbability, threePointContest } from '../src/sim/shooting'
import { flight, throwContest, throwVelocity } from '../src/sim/throwing'
import { EVENTS, points, runTournament } from '../src/sim/tournament'
import { overall } from '../src/grades/grades'
import { platesFor } from '../src/three/props'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

describe('strength and jumps', () => {
  it('converts a one-rep max to reps at a load (Epley)', () => {
    expect(repsAt(315, 225)).toBe(13)
    expect(repsAt(225, 225)).toBe(1)
    expect(repsAt(200, 225)).toBe(0)
  })

  it('loads plates per side on a 45 lb bar', () => {
    expect(platesFor(225)).toEqual([45, 45])
    expect(platesFor(365)).toEqual([45, 45, 45, 25])
    expect(platesFor(250)).toEqual([45, 45, 10, 2.5])
  })

  it('scales strength allometrically to 200 lb', () => {
    expect(strengthAtReference(400, 200)).toBeCloseTo(400, 6)
    expect(strengthAtReference(400, 250)).toBeLessThan(400)
  })

  it('uses the Sayers peak power equation', () => {
    expect(sayersPowerW(36, 226)).toBeCloseTo(60.7 * 91.44 + 45.3 * 102.51 - 2055, 0)
  })

  it('keeps verified jumps and labels estimates', () => {
    expect(jumpValue(mitchell, 'maxVertical')).toMatchObject({ value: 40.5, quality: 'VERIFIED' })
    expect(jumpValue(taylor, 'standingVertical').quality).toBe('ESTIMATED')
  })
})

describe('throwing', () => {
  it('keeps the native ball velocity and converts others as estimates', () => {
    expect(throwVelocity(ohtani, 'baseball')).toMatchObject({ mph: 101.7, quality: 'VERIFIED' })
    const fb = throwVelocity(ohtani, 'football')
    expect(fb.quality).toBe('ESTIMATED')
    expect(fb.mph).toBeGreaterThan(50)
    expect(fb.mph).toBeLessThan(65)
  })

  it('throws farther with more speed and less drag', () => {
    expect(flight(30, 40, 0.006).distance).toBeGreaterThan(flight(25, 40, 0.006).distance)
    expect(flight(30, 40, 0.003).distance).toBeGreaterThan(flight(30, 40, 0.006).distance)
    const long = throwContest(ohtani, 'baseball')
    expect(long.distanceYd).toBeGreaterThan(90)
    expect(long.distanceYd).toBeLessThan(140)
  })
})

describe('at-bat', () => {
  it('flies each pitch to its target in the computed time', () => {
    const p = makePitcher(ohtani)
    const f = pitchFlight(p, p.arsenal[0]!, { x: 0.1, y: 0.8 })
    const end = pitchPosition(f, f.time)
    expect(end[0]).toBeCloseTo(0.1, 6)
    expect(end[1]).toBeCloseTo(0.8, 6)
    expect(end[2]).toBeCloseTo(0, 6)
    expect(f.time).toBeGreaterThan(0.35)
    expect(f.time).toBeLessThan(0.5)
  })

  it('carries a 105 mph, 28 degree fly ball about 400 feet', () => {
    const ft = carry(105, 28).distance / 0.3048
    expect(ft).toBeGreaterThan(380)
    expect(ft).toBeLessThan(425)
  })

  it('replays the same duel for the same seed', () => {
    const run = () => simulateDuel(makePitcher(ohtani), makeBatter(taylor), createRng(42), 5)
    expect(JSON.stringify(run().appearances.map((a) => a.result))).toBe(JSON.stringify(run().appearances.map((a) => a.result)))
  })

  it('makes non-hitters strike out far more than the hitter', () => {
    const rng = createRng(7)
    const pro = simulateDuel(makePitcher(ohtani), makeBatter(ohtani), rng, 200).line
    const rb = simulateDuel(makePitcher(ohtani), makeBatter(taylor), rng, 200).line
    expect(rb.k / rb.pa).toBeGreaterThan(pro.k / pro.pa + 0.1)
    expect(pro.avg).toBeGreaterThan(rb.avg)
  })
})

describe('shooting', () => {
  it('uses verified percentages for the NBA guard and defaults for others', () => {
    expect(makeProbability(mitchell, 'freeThrow').p).toBeCloseTo(0.865, 3)
    expect(makeProbability(taylor, 'top').quality).toBe('ESTIMATED')
  })

  it('scores contests within their limits', () => {
    const rng = createRng(3)
    const t = threePointContest(mitchell, rng)
    expect(t.shots).toHaveLength(25)
    expect(t.score).toBeGreaterThanOrEqual(0)
    expect(t.score).toBeLessThanOrEqual(30)
    expect(freeThrowContest(taylor, rng).made).toBeLessThanOrEqual(10)
  })
})

describe('decathlon scoring', () => {
  it('matches the official decathlon 100 m table', () => {
    expect(points(EVENTS.dash100, 10.395)).toBe(1000)
    expect(points(EVENTS.dash100, 18.5)).toBe(0)
  })

  it('crowns a winner with the highest total', () => {
    const s = runTournament([taylor, ohtani, mitchell], ['dash40', 'vertical', 'bench'], 1)
    expect(s[0]!.total).toBeGreaterThanOrEqual(s[1]!.total)
    expect(s[0]!.results).toHaveLength(3)
  })
})

describe('build-an-athlete', () => {
  const opts = { name: 'Test', number: '9', base: 'A' as const, today: '2026-10-14' }

  it('takes all of A or all of B at the ends of each slider', () => {
    const allA = blendAthletes(taylor, mitchell, { body: 0, speed: 0, power: 0, agility: 0, skill: 0 }, opts)
    const allB = blendAthletes(taylor, mitchell, { body: 1, speed: 1, power: 1, agility: 1, skill: 1 }, opts)
    expect(allA.metrics.heightIn!.value).toBe(70)
    expect(allB.metrics.heightIn!.value).toBe(74)
    expect(allB.metrics.maxVerticalIn!.value).toBe(40.5)
  })

  it('labels every figure SIMULATED and plays the base sport', () => {
    const c = blendAthletes(taylor, mitchell, { body: 0.5, speed: 0.5, power: 0.5, agility: 0.5, skill: 0.5 }, opts)
    expect(c.league).toBe('NFL')
    expect(c.custom).toBe(true)
    expect(Object.values(c.metrics).every((m) => m!.quality === 'SIMULATED')).toBe(true)
    expect(overall(c).quality).toBe('SIMULATED')
  })
})

describe('dynasty cards', () => {
  it('ends the weekly line on the real current overall', () => {
    const card = weeklyCard(taylor, new Date('2026-10-14T12:00:00Z'))
    expect(card.weeks).toHaveLength(8)
    expect(card.weeks[7]!.overall).toBe(overall(taylor).value)
    expect(card.weeks[7]!.weekStart).toBe('2026-10-12')
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf(new Date('2026-10-18T09:00:00Z')).toISOString().slice(0, 10)).toBe('2026-10-12')
  })
})
