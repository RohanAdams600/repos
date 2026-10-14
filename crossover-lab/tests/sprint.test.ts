import { describe, expect, it } from 'vitest'
import { YD_TO_M } from '../src/data/metrics'
import { BUILT_IN } from '../src/data/roster'
import { distanceAt, runSprint, solveVmax, speedAt, sprintProfile, stateAt, TAU_S } from '../src/sim/sprint'

describe('sprint model', () => {
  it('solves vmax so the model reproduces the input time', () => {
    const v = solveVmax(36.576, 4.39, TAU_S)
    expect(distanceAt(v, TAU_S, 4.39)).toBeCloseTo(36.576, 6)
  })

  it('reproduces each verified sprint test', () => {
    const [taylor, , mitchell] = BUILT_IN
    expect(runSprint(sprintProfile(taylor!), 40 * YD_TO_M).time).toBeCloseTo(4.39, 2)
    expect(runSprint(sprintProfile(mitchell!), 75 * 0.3048).time).toBeCloseTo(3.01, 2)
  })

  it('accelerates monotonically before fatigue and slows after', () => {
    const p = sprintProfile(BUILT_IN[0]!)
    let last = 0
    for (let t = 0; t <= 6; t += 0.25) {
      const v = speedAt(p, t)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
    expect(speedAt(p, 20)).toBeLessThan(speedAt(p, 6))
  })

  it('gives plausible pro top speeds and 100 m times', () => {
    for (const a of BUILT_IN) {
      const p = sprintProfile(a)
      expect(p.vmax / 0.44704).toBeGreaterThan(18)
      expect(p.vmax / 0.44704).toBeLessThan(25)
      const t100 = runSprint(p, 100).time
      expect(t100).toBeGreaterThan(10.2)
      expect(t100).toBeLessThan(12.5)
    }
  })

  it('interpolates race state between samples', () => {
    const r = runSprint(sprintProfile(BUILT_IN[0]!), 36.576)
    const mid = stateAt(r.samples, r.time / 2)
    expect(mid.distance).toBeGreaterThan(0)
    expect(mid.distance).toBeLessThan(36.576)
    expect(stateAt(r.samples, r.time + 1).distance).toBeCloseTo(36.576, 6)
  })
})
