import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete, Measured } from '../src/data/types'
import { MPH_TO_MS } from '../src/data/metrics'
import { createRng } from '../src/sim/rng'
import { throwVelocity, flight, BALLS } from '../src/sim/throwing'
import {
  armSpeed,
  CROW_HOP,
  FEET_TO_M,
  fastestThrowHome,
  fieldingDrill,
  flatTime,
  homeToFirst,
  outfieldThrow,
  RUNNER_TO_FIRST_S,
  SWING_FINISH_S,
  TAG_UP_S,
} from '../src/sim/mlb-events'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

function clone(a: Athlete): Athlete {
  return structuredClone(a)
}

/** Set a metric by name, including ones the shared catalogue does not list yet. */
function setMetric(a: Athlete, key: string, m: Measured): Athlete {
  ;(a.metrics as Record<string, Measured>)[key] = m
  return a
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1)

describe('home to first', () => {
  it('runs 90 ft from a standstill plus the swing, labelled ESTIMATED', () => {
    const r = homeToFirst(ohtani)
    expect(r.quality).toBe('ESTIMATED')
    expect(r.batsLeft).toBe(true)
    expect(r.time).toBeGreaterThan(3.6)
    expect(r.time).toBeLessThan(4.6)
    expect(r.basis).toContain('left side')
    expect(homeToFirst(ohtani)).toEqual(r)
  })

  it('never labels the model VERIFIED, even from a verified sprint', () => {
    expect(taylor.metrics.fortyS?.quality).toBe('VERIFIED')
    expect(homeToFirst(taylor).quality).toBe('ESTIMATED')
  })

  it('gets a faster clone to first faster', () => {
    const fast = clone(ohtani)
    fast.metrics.sprintSpeedFtS = { value: 30, quality: 'ESTIMATED' }
    const slow = clone(ohtani)
    slow.metrics.sprintSpeedFtS = { value: 26, quality: 'ESTIMATED' }
    expect(homeToFirst(fast).time).toBeLessThan(homeToFirst(ohtani).time)
    expect(homeToFirst(ohtani).time).toBeLessThan(homeToFirst(slow).time)
  })

  it('gives left-handed batters a 0.1 s head start and times switch hitters from the left', () => {
    const righty = clone(ohtani)
    righty.bats = 'R'
    const lefty = homeToFirst(ohtani)
    const right = homeToFirst(righty)
    expect(right.batsLeft).toBe(false)
    expect(right.time - lefty.time).toBeCloseTo(SWING_FINISH_S.right - SWING_FINISH_S.left, 9)
    const switcher = clone(ohtani)
    switcher.bats = 'S'
    expect(homeToFirst(switcher).time).toBeCloseTo(lefty.time, 9)
  })

  it('falls back to the swing signature when the profile has no batting side', () => {
    expect(taylor.bats).toBeUndefined()
    expect(homeToFirst(taylor).batsLeft).toBe(taylor.movement.swing.batsLeft)
    const lefty = clone(taylor)
    lefty.movement.swing.batsLeft = true
    expect(homeToFirst(taylor).time - homeToFirst(lefty).time).toBeCloseTo(0.1, 9)
  })

  it('uses a measured home-to-first time as is, with its own label', () => {
    const timed = setMetric(clone(ohtani), 'homeToFirstS', { value: 4.07, quality: 'VERIFIED', sourceId: 'sprint-2024', note: 'Statcast home to first.' })
    const r = homeToFirst(timed)
    expect(r).toMatchObject({ time: 4.07, quality: 'VERIFIED', sourceId: 'sprint-2024', basis: 'Statcast home to first.' })
    // The measured time wins even over a faster sprint profile.
    timed.metrics.sprintSpeedFtS = { value: 31, quality: 'VERIFIED' }
    expect(homeToFirst(timed).time).toBe(4.07)
    const estimate = setMetric(clone(mitchell), 'homeToFirstS', { value: 4.4, quality: 'ESTIMATED' })
    expect(homeToFirst(estimate)).toMatchObject({ time: 4.4, quality: 'ESTIMATED' })
    expect(homeToFirst(estimate).sourceId).toBeUndefined()
  })
})

describe('fielding drill', () => {
  it('is deterministic for a seed', () => {
    expect(fieldingDrill(ohtani, 25, createRng(11))).toEqual(fieldingDrill(ohtani, 25, createRng(11)))
    expect(fieldingDrill(ohtani, 25, createRng(11))).not.toEqual(fieldingDrill(ohtani, 25, createRng(12)))
  })

  it('serves every athlete the same batted balls for the same seed', () => {
    const balls = (a: Athlete) => fieldingDrill(a, 30, createRng(5)).chances.map((c) => ({ type: c.type, ball: c.ball, hang: c.hangTimeS }))
    expect(balls(taylor)).toEqual(balls(ohtani))
    expect(balls(mitchell)).toEqual(balls(ohtani))
  })

  it('keeps outs bounded and counted, always SIMULATED', () => {
    for (const a of BUILT_IN) {
      const d = fieldingDrill(a, 40, createRng(3))
      expect(d.quality).toBe('SIMULATED')
      expect(d.chances).toHaveLength(40)
      expect(d.outs).toBeGreaterThanOrEqual(0)
      expect(d.outs).toBeLessThanOrEqual(40)
      expect(d.outs).toBe(d.chances.filter((c) => c.outcome === 'out').length)
      expect(d.basis.length).toBeGreaterThan(0)
    }
  })

  it('handles empty, negative, fractional and non-finite counts', () => {
    expect(fieldingDrill(ohtani, 0, createRng(1))).toMatchObject({ chances: [], outs: 0, quality: 'SIMULATED' })
    expect(fieldingDrill(ohtani, -4, createRng(1)).chances).toHaveLength(0)
    expect(fieldingDrill(ohtani, Number.NaN, createRng(1)).chances).toHaveLength(0)
    expect(fieldingDrill(ohtani, 3.9, createRng(1)).chances).toHaveLength(3)
  })

  it('keeps each chance inside the model ranges and consistent with its outcome', () => {
    const d = fieldingDrill(ohtani, 300, createRng(21))
    const types = new Set(d.chances.map((c) => c.type))
    expect(types).toEqual(new Set(['grounder', 'liner', 'fly']))
    for (const c of d.chances) {
      expect(c.reactionS).toBeGreaterThanOrEqual(0.25)
      expect(c.reactionS).toBeLessThanOrEqual(0.4)
      expect(c.arrivalS).toBeGreaterThanOrEqual(c.reactionS)
      expect(['out', 'hit', 'error']).toContain(c.outcome)
      if (c.type === 'fly') expect(c.hangTimeS).toBeGreaterThanOrEqual(3)
      if (c.type === 'liner') expect(c.hangTimeS).toBeLessThan(1.1)
      if (c.throwArrivalS !== undefined) {
        expect(c.type).toBe('grounder')
        expect(c.marginS).toBeCloseTo(RUNNER_TO_FIRST_S - c.throwArrivalS, 9)
        expect(c.outcome).toBe(c.marginS > 0 ? 'out' : 'hit')
      } else {
        expect(c.marginS).toBeCloseTo(c.hangTimeS - c.arrivalS, 9)
      }
      // An error is a dropped ball he was there for in time.
      if (c.outcome === 'error') expect(c.marginS).toBeGreaterThanOrEqual(0.25)
    }
    const outs = d.outs / d.chances.length
    expect(outs).toBeGreaterThan(0.4)
    expect(outs).toBeLessThan(0.95)
  })

  it('gets a faster clone to every ball no later', () => {
    const fast = clone(ohtani)
    fast.metrics.sprintSpeedFtS = { value: 30.5, quality: 'ESTIMATED' }
    const base = fieldingDrill(ohtani, 60, createRng(8)).chances
    const quick = fieldingDrill(fast, 60, createRng(8)).chances
    base.forEach((c, i) => expect(quick[i]!.arrivalS).toBeLessThanOrEqual(c.arrivalS + 1e-9))
    expect(mean(quick.map((c) => c.arrivalS))).toBeLessThan(mean(base.map((c) => c.arrivalS)))
  })

  it('beats the runner sooner with a stronger arm, and reads a measured arm strength', () => {
    const weak = clone(ohtani)
    weak.metrics.throwVelocityMph = { value: 70, quality: 'ESTIMATED' }
    const strong = fieldingDrill(ohtani, 80, createRng(9)).chances
    const soft = fieldingDrill(weak, 80, createRng(9)).chances
    let compared = 0
    strong.forEach((c, i) => {
      const s = soft[i]!
      if (c.throwArrivalS !== undefined && s.throwArrivalS !== undefined) {
        compared++
        expect(c.throwArrivalS).toBeLessThan(s.throwArrivalS)
      }
    })
    expect(compared).toBeGreaterThan(5)
    const measured = setMetric(clone(ohtani), 'armStrengthMph', { value: 88, quality: 'VERIFIED' })
    expect(armSpeed(measured, 0.9)).toMatchObject({ mph: 88, quality: 'VERIFIED' })
    expect(fieldingDrill(measured, 5, createRng(1)).basis).toContain('arm strength 88.0 mph')
  })

  it('gives athletes outside MLB a novice glove', () => {
    expect(fieldingDrill(taylor, 5, createRng(2)).basis).toContain('no glove experience')
    expect(fieldingDrill(ohtani, 5, createRng(2)).basis).not.toContain('no glove experience')
  })
})

describe('outfield throw home', () => {
  it('is deterministic for a seed', () => {
    expect(outfieldThrow(ohtani, 250, 8, createRng(4))).toEqual(outfieldThrow(ohtani, 250, 8, createRng(4)))
    expect(outfieldThrow(ohtani, 250, 8, createRng(4))).not.toEqual(outfieldThrow(ohtani, 250, 8, createRng(5)))
  })

  it('throws at 0.97 of baseball velocity, give or take 2%', () => {
    const base = throwVelocity(ohtani, 'baseball').mph * CROW_HOP
    for (const t of outfieldThrow(ohtani, 250, 30, createRng(6)).throws) {
      expect(t.velocityMph).toBeGreaterThanOrEqual(base * 0.98 - 1e-9)
      expect(t.velocityMph).toBeLessThanOrEqual(base * 1.02 + 1e-9)
    }
  })

  it('keeps outs bounded and consistent with the tag-up race', () => {
    for (const a of BUILT_IN) {
      const r = outfieldThrow(a, 230, 25, createRng(14))
      expect(r.quality).toBe('SIMULATED')
      expect(r.throws).toHaveLength(25)
      expect(r.outs).toBeGreaterThanOrEqual(0)
      expect(r.outs).toBeLessThanOrEqual(25)
      expect(r.outs).toBe(r.throws.filter((t) => t.runnerOut).length)
      for (const t of r.throws) {
        expect(t.runnerOut).toBe(t.marginS > 0)
        // The tag always costs something, so an out needs the ball there well inside 3.6 s.
        if (t.runnerOut) expect(t.timeToPlateS).toBeLessThan(TAG_UP_S)
        expect(t.timeToPlateS).toBeGreaterThan(t.releaseS)
        expect(Number.isFinite(t.dx)).toBe(true)
      }
    }
  })

  it('gets the ball home sooner with a stronger arm', () => {
    const strong = clone(ohtani)
    strong.metrics.throwVelocityMph = { value: 100, quality: 'ESTIMATED' }
    const weak = clone(ohtani)
    weak.metrics.throwVelocityMph = { value: 82, quality: 'ESTIMATED' }
    const s = outfieldThrow(strong, 260, 15, createRng(31))
    const w = outfieldThrow(weak, 260, 15, createRng(31))
    s.throws.forEach((t, i) => expect(t.timeToPlateS).toBeLessThan(w.throws[i]!.timeToPlateS))
    expect(s.outs).toBeGreaterThanOrEqual(w.outs)
  })

  it('takes longer from deeper and hops a weak arm in from far out', () => {
    const near = mean(outfieldThrow(ohtani, 200, 10, createRng(2)).throws.map((t) => t.timeToPlateS))
    const far = mean(outfieldThrow(ohtani, 320, 10, createRng(2)).throws.map((t) => t.timeToPlateS))
    expect(far).toBeGreaterThan(near)
    expect(outfieldThrow(mitchell, 330, 5, createRng(2)).throws.every((t) => t.bounces)).toBe(true)
    expect(outfieldThrow(ohtani, 180, 5, createRng(2)).throws.some((t) => t.bounces)).toBe(false)
  })

  it('clamps the distance and handles empty or non-finite input', () => {
    expect(outfieldThrow(ohtani, 900, 1, createRng(1)).distanceFt).toBe(400)
    expect(outfieldThrow(ohtani, 5, 1, createRng(1)).distanceFt).toBe(30)
    expect(outfieldThrow(ohtani, Number.NaN, 1, createRng(1)).distanceFt).toBe(250)
    expect(outfieldThrow(ohtani, 250, 0, createRng(1))).toMatchObject({ throws: [], outs: 0, quality: 'SIMULATED' })
    expect(outfieldThrow(ohtani, 250, -2, createRng(1)).throws).toHaveLength(0)
    const close = outfieldThrow(ohtani, 30, 3, createRng(1))
    for (const t of close.throws) expect(t.timeToPlateS - t.releaseS).toBeLessThan(0.5)
  })
})

describe('throw paths', () => {
  it('lands an on-the-fly throw on the plate', () => {
    const speed = 95 * MPH_TO_MS
    const d = 220 * FEET_TO_M
    const path = fastestThrowHome(speed, d)
    expect(path.bounces).toBe(false)
    expect(flight(speed, path.angleDeg, BALLS.baseball.drag).distance).toBeCloseTo(d, 0)
  })

  it('arrives sooner at higher speed', () => {
    const d = 260 * FEET_TO_M
    let last = Infinity
    for (const mph of [65, 75, 85, 95, 105]) {
      const t = fastestThrowHome(mph * MPH_TO_MS, d).flightS
      expect(t).toBeLessThan(last)
      last = t
    }
  })

  it('times a flat flight with drag', () => {
    expect(flatTime(0, 40, 0.006)).toBe(0)
    expect(flatTime(30, 0, 0.006)).toBe(Infinity)
    // With almost no drag the time is distance over speed.
    expect(flatTime(30, 40, 1e-9)).toBeCloseTo(0.75, 6)
    expect(flatTime(30, 40, 0.0061)).toBeGreaterThan(0.75)
  })
})
