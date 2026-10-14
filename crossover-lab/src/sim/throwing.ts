import type { Athlete, League, Quality } from '../data/types'
import { weakest } from '../data/types'
import { MPH_TO_MS } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { gradesFor } from '../grades/grades'
import { gaussian } from './rng'

export type Ball = 'football' | 'baseball' | 'basketball'

/** Mass (kg) and drag constant k = ½ρC_dA/m (1/m) for each ball in flight. */
export const BALLS: Record<Ball, { label: string; massKg: number; drag: number; radius: number }> = {
  baseball: { label: 'Baseball', massKg: 0.145, drag: 0.0061, radius: 0.0366 },
  football: { label: 'Football (spiral)', massKg: 0.41, drag: 0.0033, radius: 0.085 },
  basketball: { label: 'Basketball (outlet pass)', massKg: 0.62, drag: 0.0206, radius: 0.12 },
}

export const NATIVE_BALL: Record<League, Ball> = { NFL: 'football', MLB: 'baseball', NBA: 'basketball' }

/**
 * Release speed drops with implement mass: v ∝ m^-0.46, which reproduces the usual gap
 * between a thrower's baseball and football velocity (about 0.62x).
 */
export const MASS_EXPONENT = 0.46

export interface ThrowResult {
  ball: Ball
  velocityMph: number
  distanceYd: number
  quality: Quality
  basis: string
}

export function throwVelocity(a: Athlete, ball: Ball): { mph: number; quality: Quality; basis: string } {
  const own = resolveMetric(a, 'throwVelocityMph')
  const native = NATIVE_BALL[a.league]
  const base = own?.value ?? 55
  const baseQuality = own?.quality ?? 'SIMULATED'
  if (ball === native) return { mph: base, quality: baseQuality, basis: own?.note ?? 'Profile throw velocity.' }
  const ratio = Math.pow(BALLS[native].massKg / BALLS[ball].massKg, MASS_EXPONENT)
  // Unfamiliar implements cost technique as well as mass.
  const technique = 0.92
  return {
    mph: base * ratio * technique,
    quality: weakest(baseQuality, 'ESTIMATED'),
    basis: `Converted from his ${BALLS[native].label.toLowerCase()} velocity: × (mass ratio)^${MASS_EXPONENT} × ${technique} for unfamiliar technique.`,
  }
}

/** Flight with quadratic drag from a 2 m release; returns carry distance and the path. */
export function flight(speedMs: number, angleDeg: number, drag: number, releaseHeight = 2, dt = 0.004): { distance: number; path: [number, number][]; time: number } {
  let x = 0
  let y = releaseHeight
  let vx = speedMs * Math.cos((angleDeg * Math.PI) / 180)
  let vy = speedMs * Math.sin((angleDeg * Math.PI) / 180)
  const path: [number, number][] = [[x, y]]
  let t = 0
  while (y > 0 && t < 30) {
    const v = Math.hypot(vx, vy)
    vx += -drag * v * vx * dt
    vy += (-9.81 - drag * v * vy) * dt
    x += vx * dt
    y += vy * dt
    t += dt
    if (path.length < 400 && Math.round(t / dt) % 5 === 0) path.push([x, Math.max(0, y)])
  }
  path.push([x, 0])
  return { distance: x, path, time: t }
}

export function maxDistance(speedMs: number, drag: number): { distance: number; angle: number } {
  let best = { distance: 0, angle: 45 }
  for (let angle = 20; angle <= 50; angle += 1) {
    const d = flight(speedMs, angle, drag, 2, 0.01).distance
    if (d > best.distance) best = { distance: d, angle }
  }
  return best
}

export function throwContest(a: Athlete, ball: Ball): ThrowResult {
  const v = throwVelocity(a, ball)
  // Max-distance throws run up with a crow hop; pitchers throw longest at about 95% of mound velocity.
  const best = maxDistance(v.mph * MPH_TO_MS * 0.95, BALLS[ball].drag)
  return { ball, velocityMph: v.mph, distanceYd: best.distance / 0.9144, quality: v.quality, basis: v.basis }
}

export interface AccuracyThrow {
  dx: number
  dy: number
  points: number
}

/** Ten throws at a target: rings at 0.5, 1 and 1.5 m score 3, 2 and 1. */
export function accuracyContest(a: Athlete, ball: Ball, distanceM: number, rng: () => number, throws = 10): { throws: AccuracyThrow[]; total: number; quality: Quality; sdM: number } {
  const grades = gradesFor(a)
  const skill = a.league === 'NFL' ? grades.find((g) => g.id === 'throwAccuracy') : a.league === 'MLB' ? grades.find((g) => g.id === 'command') : grades.find((g) => g.id === 'threePoint')
  const skillZ = skill?.z ?? 0
  const native = NATIVE_BALL[a.league] === ball
  const sdM = Math.max(0.15, (0.35 + distanceM / 45) * (1 - 0.12 * skillZ) * (native ? 1 : 1.5))
  const list: AccuracyThrow[] = []
  for (let i = 0; i < throws; i++) {
    const dx = gaussian(rng) * sdM
    const dy = gaussian(rng) * sdM * 0.8
    const r = Math.hypot(dx, dy)
    list.push({ dx, dy, points: r <= 0.5 ? 3 : r <= 1 ? 2 : r <= 1.5 ? 1 : 0 })
  }
  return { throws: list, total: list.reduce((s, x) => s + x.points, 0), quality: weakest(skill?.quality ?? 'SIMULATED', 'SIMULATED'), sdM }
}
