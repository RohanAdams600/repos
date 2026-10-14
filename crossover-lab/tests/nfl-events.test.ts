import { describe, expect, it } from 'vitest'
import { MPH_TO_MS, YD_TO_M } from '../src/data/metrics'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete, Measured, MetricKey } from '../src/data/types'
import { createRng } from '../src/sim/rng'
import { throwVelocity } from '../src/sim/throwing'
import {
  armStrength,
  changeOfDirection,
  cutRetention,
  getOff,
  NON_DEFENDER_PENALTY,
  passRush,
  PATH_HZ,
  plantTime,
  qbAccuracy,
  ROUTE_IDS,
  ROUTES,
  routeRace,
  RUSH_WINDOW_S,
  tackleBreak,
  type RouteId,
} from '../src/sim/nfl-events'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

const sim = (value: number): Measured => ({ value, quality: 'SIMULATED' })

/** Synthetic NFL athlete built on Taylor's profile with edited metrics. */
function clone(id: string, group: string, position: string, metrics: Partial<Record<MetricKey, number>> = {}): Athlete {
  const a = structuredClone(taylor)
  a.id = id
  a.name = id
  a.positionGroup = group
  a.position = position
  for (const [key, value] of Object.entries(metrics)) a.metrics[key as MetricKey] = sim(value)
  return a
}

const linebacker = () => clone('lb', 'LB', 'LB', { weightLb: 238, fortyS: 4.65, shuttleS: 4.3, threeConeS: 7.1, bench1RmLb: 380, squat1RmLb: 550, deadlift1RmLb: 600 })
const edge = (extra: Partial<Record<MetricKey, number>> = {}) =>
  clone('edge', 'DL', 'DE', { weightLb: 270, fortyS: 4.8, tenSplitS: 1.7, shuttleS: 4.5, threeConeS: 7.4, bench1RmLb: 405, squat1RmLb: 600, deadlift1RmLb: 650, ...extra })
const tackle = () => clone('tackle', 'OL', 'OT', { weightLb: 315, fortyS: 5.2, tenSplitS: 1.8, shuttleS: 4.7, threeConeS: 7.8, bench1RmLb: 450, squat1RmLb: 650, deadlift1RmLb: 700 })
const passer = () => clone('qb', 'QB', 'QB', { weightLb: 220, fortyS: 4.8, throwVelocityMph: 58 })

const EXPECTED_ANGLE: Record<RouteId, number[]> = { slant: [45], out: [90], curl: [153.4], dig: [90], post: [45], go: [] }

describe('route tree', () => {
  it('starts every route at the alignment and uses route-tree depths', () => {
    expect([...ROUTE_IDS].sort()).toEqual(Object.keys(ROUTES).sort())
    for (const id of ROUTE_IDS) {
      const pts = ROUTES[id].points
      expect(pts[0]).toEqual([0, 0])
      expect(pts.length).toBeGreaterThanOrEqual(2)
      expect(pts[pts.length - 1]![1]).toBeGreaterThan(0)
      expect(ROUTES[id].label.length).toBeGreaterThan(0)
      expect(ROUTES[id].description.length).toBeGreaterThan(0)
    }
    expect(ROUTES.slant.points[1]).toEqual([0, 3])
    expect(ROUTES.out.points[1]).toEqual([0, 10])
    expect(ROUTES.curl.points[1]).toEqual([0, 12])
    expect(ROUTES.dig.points[1]).toEqual([0, 12])
    expect(ROUTES.post.points[1]).toEqual([0, 12])
    expect(ROUTES.go.points).toEqual([[0, 0], [0, 40]])
  })

  it('breaks the out toward the sideline and the in-breakers toward the middle', () => {
    const lastX = (id: RouteId) => ROUTES[id].points[ROUTES[id].points.length - 1]![0]
    expect(lastX('out')).toBeGreaterThan(0)
    for (const id of ['slant', 'dig', 'post', 'curl'] as RouteId[]) expect(lastX(id)).toBeLessThan(0)
    // The curl comes back toward the quarterback.
    expect(ROUTES.curl.points[2]![1]).toBeLessThan(ROUTES.curl.points[1]![1])
  })
})

describe('route race', () => {
  it('replays the same run for the same seed', () => {
    for (const id of ROUTE_IDS) {
      const a = routeRace(taylor, id, createRng(11))
      const b = routeRace(taylor, id, createRng(11))
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
    expect(routeRace(taylor, 'dig', createRng(1)).time).not.toBe(routeRace(taylor, 'dig', createRng(2)).time)
  })

  it('runs a go route faster with a faster 40', () => {
    const fast = clone('fast', 'WR', 'WR', { fortyS: 4.25 })
    const slow = clone('slow', 'WR', 'WR', { fortyS: 4.65 })
    for (let seed = 1; seed <= 10; seed++) {
      const f = routeRace(fast, 'go', createRng(seed))
      const s = routeRace(slow, 'go', createRng(seed))
      expect(f.time).toBeLessThan(s.time)
      expect(f.topSpeedMph).toBeGreaterThan(s.topSpeedMph)
      expect(f.breaks).toHaveLength(0)
    }
    // 40 yards from a standing release plus the snap reaction: close to the 4.39 s dash.
    const go = routeRace(taylor, 'go', createRng(5))
    expect(go.time).toBeGreaterThan(4.39)
    expect(go.time).toBeLessThan(4.7)
  })

  it('charges every break a positive loss and a speed cut', () => {
    for (const id of ROUTE_IDS) {
      for (let seed = 1; seed <= 25; seed++) {
        const run = routeRace(taylor, id, createRng(seed))
        expect(run.breaks).toHaveLength(ROUTES[id].points.length - 2)
        run.breaks.forEach((b, i) => {
          expect(b.lossS).toBeGreaterThan(0)
          expect(b.speedOutMs).toBeLessThan(b.speedInMs)
          expect(b.speedOutMs).toBeGreaterThanOrEqual(0)
          expect(b.angleDeg).toBeCloseTo(EXPECTED_ANGLE[id][i]!, 0)
          expect(b.atS).toBeGreaterThan(0)
          expect(b.atS).toBeLessThan(run.time)
        })
      }
    }
  })

  it('costs more at sharper breaks', () => {
    const loss = (id: RouteId) => {
      let sum = 0
      for (let seed = 1; seed <= 30; seed++) sum += routeRace(taylor, id, createRng(seed)).breaks[0]!.lossS
      return sum / 30
    }
    expect(loss('post')).toBeLessThan(loss('dig'))
    expect(loss('dig')).toBeLessThan(loss('curl'))
    expect(cutRetention(45, 0)).toBeGreaterThan(cutRetention(90, 0))
    expect(cutRetention(90, 0)).toBeGreaterThan(cutRetention(150, 0))
    expect(plantTime(150, 0)).toBeGreaterThan(plantTime(45, 0))
  })

  it('cuts better with quicker feet', () => {
    const quick = clone('quick', 'WR', 'WR', { shuttleS: 4.0, threeConeS: 6.7 })
    const heavy = clone('heavy-feet', 'WR', 'WR', { shuttleS: 4.6, threeConeS: 7.5 })
    expect(changeOfDirection(quick).shuttleS).toBeLessThan(changeOfDirection(heavy).shuttleS)
    for (let seed = 1; seed <= 10; seed++) {
      const q = routeRace(quick, 'out', createRng(seed))
      const h = routeRace(heavy, 'out', createRng(seed))
      expect(q.breaks[0]!.lossS).toBeLessThan(h.breaks[0]!.lossS)
      expect(q.time).toBeLessThan(h.time)
    }
  })

  it('samples the path at 30 Hz in metres and ends on the last waypoint', () => {
    for (const id of ROUTE_IDS) {
      const run = routeRace(taylor, id, createRng(3))
      const path = run.path
      expect(path[0]).toMatchObject({ t: 0, x: 0, z: 0, speed: 0 })
      for (let i = 1; i < path.length; i++) {
        const dt = path[i]!.t - path[i - 1]!.t
        expect(dt).toBeGreaterThan(0)
        expect(dt).toBeLessThanOrEqual(1 / PATH_HZ + 1e-9)
        expect(path[i]!.speed).toBeGreaterThanOrEqual(0)
      }
      const last = path[path.length - 1]!
      const [ex, ez] = ROUTES[id].points[ROUTES[id].points.length - 1]!
      expect(last.t).toBeCloseTo(run.time, 9)
      expect(last.x).toBeCloseTo(ex * YD_TO_M, 6)
      expect(last.z).toBeCloseTo(ez * YD_TO_M, 6)
      expect(path.length).toBeGreaterThanOrEqual(Math.floor(run.time * PATH_HZ))
      const fastest = Math.max(...path.map((p) => p.speed))
      expect(run.topSpeedMph).toBeGreaterThanOrEqual(fastest / MPH_TO_MS - 1e-9)
      expect(run.topSpeedMph).toBeGreaterThan(15)
      expect(run.topSpeedMph).toBeLessThan(25)
    }
  })

  it('labels the outcome SIMULATED and works for athletes from other leagues', () => {
    const run = routeRace(taylor, 'post', createRng(1))
    expect(run.quality).toBe('SIMULATED')
    expect(run.athleteId).toBe(taylor.id)
    expect(run.route).toBe('post')
    expect(run.basis.length).toBeGreaterThan(0)
    for (const a of [ohtani, mitchell]) {
      const r = routeRace(a, 'slant', createRng(1))
      expect(Number.isFinite(r.time)).toBe(true)
      expect(r.quality).toBe('SIMULATED')
    }
  })
})

describe('tackle breaking', () => {
  it('keeps probabilities in [0, 1] and outcomes consistent with the counts', () => {
    const res = tackleBreak(taylor, linebacker(), 500, createRng(4))
    expect(res.reps).toHaveLength(500)
    expect(res.broken + res.juked + res.tackled).toBe(500)
    expect(res.rate).toBeGreaterThanOrEqual(0)
    expect(res.rate).toBeLessThanOrEqual(1)
    expect(res.rate).toBeCloseTo((res.broken + res.juked) / 500, 12)
    expect(res.quality).toBe('SIMULATED')
    for (const r of res.reps) {
      expect(r.pBreak).toBeGreaterThanOrEqual(0)
      expect(r.pBreak).toBeLessThanOrEqual(1)
      expect(r.pJuke).toBeGreaterThanOrEqual(0)
      expect(r.pJuke).toBeLessThanOrEqual(1)
      expect(r.contactSpeedMs).toBeGreaterThan(0)
      expect(r.carrierMomentum).toBeGreaterThan(0)
      if (r.outcome === 'tackled') expect(r.yardsAfterContact).toBeLessThanOrEqual(4)
      else expect(r.yardsAfterContact).toBeGreaterThanOrEqual(1)
    }
    expect(res.broken).toBe(res.reps.filter((r) => r.outcome === 'broken').length)
    expect(res.juked).toBe(res.reps.filter((r) => r.outcome === 'juked').length)
  })

  it('replays the same reps for the same seed', () => {
    const run = () => tackleBreak(taylor, linebacker(), 50, createRng(9))
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })

  it('lets a heavier, stronger carrier break more tackles', () => {
    const big = clone('big', 'RB', 'RB', { weightLb: 256, bench1RmLb: 455, squat1RmLb: 680, deadlift1RmLb: 730 })
    const lb = linebacker()
    const base = tackleBreak(taylor, lb, 3000, createRng(21))
    const heavy = tackleBreak(big, lb, 3000, createRng(21))
    expect(heavy.broken).toBeGreaterThan(base.broken)
    const meanP = (r: typeof base) => r.reps.reduce((s, x) => s + x.pBreak, 0) / r.reps.length
    expect(meanP(heavy)).toBeGreaterThan(meanP(base))
    expect(heavy.reps[0]!.carrierMomentum).toBeGreaterThan(base.reps[0]!.carrierMomentum)
  })

  it('makes defenders surer tacklers than other positions', () => {
    const lb = linebacker()
    const receiver = { ...linebacker(), id: 'wr-body', positionGroup: 'WR', position: 'WR' }
    const vsLb = tackleBreak(taylor, lb, 1, createRng(2)).reps[0]!
    const vsWr = tackleBreak(taylor, receiver, 1, createRng(2)).reps[0]!
    expect(vsWr.pBreak).toBeGreaterThan(vsLb.pBreak)
    expect(vsWr.pJuke).toBeGreaterThan(vsLb.pJuke)
    const logit = (p: number) => Math.log(p / (1 - p))
    expect(logit(vsWr.pJuke) - logit(vsLb.pJuke)).toBeCloseTo(NON_DEFENDER_PENALTY, 9)
  })

  it('handles zero and fractional rep counts', () => {
    const none = tackleBreak(taylor, linebacker(), 0, createRng(1))
    expect(none).toMatchObject({ reps: [], broken: 0, juked: 0, tackled: 0, rate: 0, avgYardsAfterContact: 0 })
    expect(tackleBreak(taylor, linebacker(), -3, createRng(1)).reps).toHaveLength(0)
    expect(tackleBreak(taylor, linebacker(), 2.7, createRng(1)).reps).toHaveLength(2)
  })
})

describe('quarterback accuracy', () => {
  it('replays the same throws for the same seed', () => {
    const run = () => qbAccuracy(passer(), [10, 25], 5, createRng(8))
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })

  it('scores rings and loses points with depth on average', () => {
    const depths = [5, 15, 30, 45]
    const res = qbAccuracy(passer(), depths, 300, createRng(12))
    expect(res.throws).toHaveLength(1200)
    expect(res.byDepth.map((d) => d.depthYd)).toEqual(depths)
    expect(res.total).toBe(res.throws.reduce((s, t) => s + t.points, 0))
    expect(res.maxTotal).toBe(3600)
    for (const t of res.throws) {
      const r = Math.hypot(t.dx, t.dy)
      expect(t.points).toBe(r <= 0.5 ? 3 : r <= 1 ? 2 : r <= 1.5 ? 1 : 0)
    }
    for (let i = 1; i < res.byDepth.length; i++) {
      expect(res.byDepth[i]!.avgPoints).toBeLessThan(res.byDepth[i - 1]!.avgPoints)
      expect(res.byDepth[i]!.sdM).toBeGreaterThan(res.byDepth[i - 1]!.sdM)
      expect(res.byDepth[i]!.airTimeS).toBeGreaterThan(res.byDepth[i - 1]!.airTimeS)
      expect(res.byDepth[i]!.launchDeg).toBeGreaterThan(res.byDepth[i - 1]!.launchDeg)
    }
  })

  it('throws at the football velocity and labels the outputs', () => {
    const qb = passer()
    const res = qbAccuracy(qb, [20], 3, createRng(1))
    const v = throwVelocity(qb, 'football')
    for (const t of res.throws) expect(t.velocityMph).toBe(v.mph)
    expect(res.quality).toBe('SIMULATED')
    expect(res.velocityQuality).toBe(v.quality)
    expect(res.flightQuality).not.toBe('VERIFIED')
    expect(qbAccuracy(ohtani, [20], 1, createRng(1)).flightQuality).toBe('ESTIMATED')
  })

  it('makes a quarterback more accurate than a running back', () => {
    const qb = qbAccuracy(passer(), [10, 20, 30], 100, createRng(5))
    const rb = qbAccuracy(taylor, [10, 20, 30], 100, createRng(5))
    expect(qb.skillZ).toBeGreaterThan(rb.skillZ)
    expect(qb.total).toBeGreaterThan(rb.total)
    // Non-NFL athletes fall back to their own sport's grade with a wider spread.
    const guard = qbAccuracy(mitchell, [10], 1, createRng(1))
    expect(guard.byDepth[0]!.sdM).toBeGreaterThan(qbAccuracy(passer(), [10], 1, createRng(1)).byDepth[0]!.sdM)
  })

  it('scores nothing out of range and skips depths that are not positive', () => {
    const res = qbAccuracy(passer(), [0, -5, Number.NaN, 120], 4, createRng(2))
    expect(res.byDepth).toHaveLength(1)
    expect(res.byDepth[0]!.inRange).toBe(false)
    for (const t of res.throws) {
      expect(t.inRange).toBe(false)
      expect(t.points).toBe(0)
      expect(t.dy).toBeLessThan(0)
    }
    const none = qbAccuracy(passer(), [10], 0, createRng(2))
    expect(none.throws).toHaveLength(0)
    expect(none.byDepth[0]).toMatchObject({ throws: 0, points: 0, avgPoints: 0 })
  })
})

describe('arm strength', () => {
  it('uses the football velocity and never labels the distance VERIFIED', () => {
    for (const a of [passer(), taylor, ohtani, mitchell]) {
      const arm = armStrength(a)
      expect(arm.velocityMph).toBe(throwVelocity(a, 'football').mph)
      expect(arm.quality).not.toBe('VERIFIED')
      expect(arm.maxDistanceYd).toBeGreaterThan(35)
      expect(arm.maxDistanceYd).toBeLessThan(85)
      expect(arm.angleDeg).toBeGreaterThanOrEqual(20)
      expect(arm.angleDeg).toBeLessThanOrEqual(50)
    }
    const measured = clone('measured-arm', 'QB', 'QB')
    measured.metrics.throwVelocityMph = { value: 60, quality: 'VERIFIED', sourceId: 'test' }
    const arm = armStrength(measured)
    expect(arm.velocityQuality).toBe('VERIFIED')
    expect(arm.quality).toBe('ESTIMATED')
  })

  it('throws farther with a stronger arm', () => {
    const weak = armStrength(clone('weak', 'QB', 'QB', { throwVelocityMph: 50 }))
    const strong = armStrength(clone('strong', 'QB', 'QB', { throwVelocityMph: 60 }))
    expect(strong.maxDistanceYd).toBeGreaterThan(weak.maxDistanceYd)
  })
})

describe('pass rush', () => {
  it('keeps the win rate in [0, 1] and times inside the window', () => {
    const res = passRush(edge(), tackle(), 800, createRng(6))
    expect(res.reps).toHaveLength(800)
    expect(res.winRate).toBeGreaterThanOrEqual(0)
    expect(res.winRate).toBeLessThanOrEqual(1)
    expect(res.winRate).toBeCloseTo(res.reps.filter((r) => r.win).length / 800, 12)
    expect(res.quality).toBe('SIMULATED')
    for (const r of res.reps) {
      expect(r.pWin).toBeGreaterThanOrEqual(0)
      expect(r.pWin).toBeLessThanOrEqual(1)
      if (r.win) {
        expect(r.timeToWinS).not.toBeNull()
        expect(r.timeToWinS!).toBeGreaterThan(0)
        expect(r.timeToWinS!).toBeLessThanOrEqual(RUSH_WINDOW_S)
      } else {
        expect(r.timeToWinS).toBeNull()
      }
    }
    const moves = Object.values(res.byMove)
    expect(moves.reduce((s, m) => s + m.reps, 0)).toBe(800)
    expect(moves.reduce((s, m) => s + m.wins, 0)).toBe(res.reps.filter((r) => r.win).length)
    expect(res.avgTimeToWin).toBeGreaterThan(0)
    expect(res.avgTimeToWin!).toBeLessThanOrEqual(RUSH_WINDOW_S)
  })

  it('replays the same reps for the same seed', () => {
    const run = () => passRush(edge(), tackle(), 40, createRng(13))
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })

  it('wins more often with more size and strength', () => {
    const big = edge({ weightLb: 305, bench1RmLb: 500, squat1RmLb: 720, deadlift1RmLb: 760 })
    const base = passRush(edge(), tackle(), 3000, createRng(17))
    const heavy = passRush(big, tackle(), 3000, createRng(17))
    expect(heavy.winRate).toBeGreaterThan(base.winRate)
    expect(heavy.byMove.power.reps).toBeGreaterThan(base.byMove.power.reps)
  })

  it('wins more often and sooner with a quicker get-off', () => {
    const quick = edge({ tenSplitS: 1.58 })
    const slow = edge({ tenSplitS: 1.86 })
    expect(getOff(quick).tenSplitS).toBe(1.58)
    const q = passRush(quick, tackle(), 3000, createRng(19))
    const s = passRush(slow, tackle(), 3000, createRng(19))
    expect(q.winRate).toBeGreaterThan(s.winRate)
    expect(q.avgTimeToWin!).toBeLessThan(s.avgTimeToWin!)
  })

  it('derives the get-off from the 40 when there is no split', () => {
    const g = getOff(taylor)
    expect(g.tenSplitS).toBeGreaterThan(1.4)
    expect(g.tenSplitS).toBeLessThan(1.7)
    expect(g.quality).not.toBe('VERIFIED')
  })

  it('makes a lineman a better pass blocker than a receiver of the same build', () => {
    const ol = tackle()
    const wrBody = { ...tackle(), id: 'wr-body', positionGroup: 'WR', position: 'WR' }
    expect(passRush(edge(), wrBody, 2000, createRng(3)).winRate).toBeGreaterThan(passRush(edge(), ol, 2000, createRng(3)).winRate)
  })

  it('handles zero reps', () => {
    const res = passRush(edge(), tackle(), 0, createRng(1))
    expect(res).toMatchObject({ reps: [], winRate: 0, avgTimeToWin: null })
  })
})
