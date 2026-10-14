import type { Athlete, Measured, MetricKey, Quality } from '../data/types'
import { weakest } from '../data/types'
import { MPH_TO_MS } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { gradesFor } from '../grades/grades'
import { gaussian } from './rng'
import { runSprint, sprintProfile } from './sprint'
import { BALLS, flight, throwVelocity } from './throwing'

/**
 * MLB same-league versus events: home to first, a fungo fielding drill and an outfield throw home.
 * Home to first is a formula on measured inputs (at best ESTIMATED); the drills are decided by
 * random draws and are always SIMULATED. Each drill draws the same numbers in the same order for
 * every athlete, so two athletes run with the same seed field identical batted balls.
 */

/** 90 ft, home plate to first base. */
export const HOME_TO_FIRST_M = 27.43
/** Time to finish the swing and break: lefties stand a step closer and already move toward first. */
export const SWING_FINISH_S = { left: 0.25, right: 0.35 } as const
/** Grounder throws race a runner who reaches first this long after contact. */
export const RUNNER_TO_FIRST_S = 4.3
export const THROW_TO_FIRST_M = 30
/** A runner tagging from third scores this long after the catch. */
export const TAG_UP_S = 3.6
/** A crow hop gives up a little velocity against a mound throw for a running start. */
export const CROW_HOP = 0.97
/** Infield throws are quick releases, not max effort. */
export const INFIELD_EFFORT = 0.9
export const FEET_TO_M = 0.3048

const BASEBALL_DRAG = BALLS.baseball.drag
/** Share of horizontal speed a throw keeps through its hop on grass. */
const BOUNCE_KEEP = 0.7
/** Extra drag per metre after the hop: the ball skips and rolls rather than flying clean. */
const HOP_DRAG = 0.012
/** Fielders outside MLB have never worn a glove in a game. */
const NON_MLB_FIELDING_Z = -1.5
/** A ball dropped with this much time to spare would have been an ordinary-effort play. */
const ERROR_MARGIN_S = 0.25
/** Getting up after a diving stop before the throw. */
const DIVE_RECOVERY_S = 0.45
/** Catch log-odds per second to spare, and per unit of fielding z. */
const CATCH_SLOPE = 8
const CATCH_SKILL = 0.35

/**
 * Metrics this module reads that the shared catalogue may not list yet. Looked up by name so a
 * profile that carries one (a Statcast home-to-first time, an outfield arm strength) is used.
 */
export type MlbEventMetric = 'homeToFirstS' | 'armStrengthMph'

function eventMetric(a: Athlete, key: MlbEventMetric): Measured | undefined {
  return resolveMetric(a, key as string as MetricKey)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

function count(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

/** Agility and fielding z. Outside MLB there is no fielding grade, so a fixed novice value stands in. */
function skillZ(a: Athlete): { agility: number; fielding: number } {
  const grades = gradesFor(a)
  const z = (id: string) => grades.find((g) => g.id === id)?.z
  return { agility: z('agility') ?? 0, fielding: a.league === 'MLB' ? (z('fielding') ?? 0) : NON_MLB_FIELDING_Z }
}

/** Time to cover `distance` metres on a flat flight with quadratic drag: v(x) = v0·e^(−kx). */
export function flatTime(distanceM: number, speedMs: number, drag: number): number {
  if (distanceM <= 0) return 0
  if (speedMs <= 0) return Infinity
  return (Math.exp(drag * distanceM) - 1) / (drag * speedMs)
}

// ---------------------------------------------------------------------------------------------
// Home to first

export interface HomeToFirst {
  time: number
  quality: Quality
  basis: string
  batsLeft: boolean
  sourceId?: string
}

/** Switch hitters are timed from the left side, the shorter trip. */
function batsLeft(a: Athlete): boolean {
  if (a.bats) return a.bats !== 'R'
  return a.movement.swing.batsLeft
}

export function homeToFirst(a: Athlete): HomeToFirst {
  const left = batsLeft(a)
  const measured = eventMetric(a, 'homeToFirstS')
  if (measured) {
    return {
      time: measured.value,
      quality: measured.quality,
      basis: measured.note ?? 'Measured home-to-first time from the profile.',
      batsLeft: left,
      ...(measured.sourceId ? { sourceId: measured.sourceId } : {}),
    }
  }
  const profile = sprintProfile(a)
  const run = runSprint(profile, HOME_TO_FIRST_M).time
  const swing = left ? SWING_FINISH_S.left : SWING_FINISH_S.right
  return {
    time: run + swing,
    quality: weakest(profile.quality, 'ESTIMATED'),
    basis: `${profile.basis} 90 ft from a standstill takes ${run.toFixed(2)} s, plus ${swing.toFixed(2)} s to finish the swing from the ${left ? 'left' : 'right'} side.`,
    batsLeft: left,
  }
}

// ---------------------------------------------------------------------------------------------
// Fielding drill

export type ChanceType = 'grounder' | 'liner' | 'fly'
export type ChanceOutcome = 'out' | 'hit' | 'error'

export interface FieldingChance {
  type: ChanceType
  /**
   * Where the fielder must get to, in metres from his start: +x toward the third-base side, +z
   * in toward home plate (negative z is going back).
   */
  ball: { x: number; z: number }
  /** Seconds after contact the ball reaches that spot (for a grounder, when it gets to him). */
  hangTimeS: number
  reactionS: number
  /** Seconds after contact the fielder gets there: reaction plus the run. */
  arrivalS: number
  outcome: ChanceOutcome
  /**
   * Time to spare on the race that decided the play, positive in the fielder's favour: the throw
   * against the runner for a grounder fielded cleanly, otherwise the hang time minus arrival.
   */
  marginS: number
  /** Grounders fielded cleanly: when the throw reaches first, seconds after contact. */
  throwArrivalS?: number
}

export interface FieldingDrill {
  chances: FieldingChance[]
  outs: number
  quality: 'SIMULATED'
  basis: string
}

interface ChanceDraw {
  type: ChanceType
  x: number
  z: number
  hang: number
}

/** Batted ball for one chance. Always four draws, so every athlete sees the same ball. */
function drawChance(rng: () => number): ChanceDraw {
  const uType = rng()
  const u1 = rng()
  const u2 = rng()
  const u3 = rng()
  if (uType < 0.4) {
    // u3 runs from a scorcher (0) to a slow roller (1) that the fielder must charge.
    return { type: 'grounder', x: (2 * u1 - 1) * 7, z: u3 * (2 + 8 * u2), hang: 0.9 + 1.6 * u3 }
  }
  if (uType < 0.6) return { type: 'liner', x: (2 * u1 - 1) * 5, z: (2 * u2 - 1) * 2.5, hang: 0.45 + 0.6 * u3 }
  return { type: 'fly', x: (2 * u1 - 1) * 32, z: -24 + 38 * u2, hang: 3 + 2.6 * u3 }
}

/**
 * Fielding-throw speed. A measured arm strength (Statcast measures it on fielding throws) is used
 * as is; otherwise the mound or native-ball velocity converted to a baseball, times `effort`.
 */
export function armSpeed(a: Athlete, effort: number): { mph: number; quality: Quality; basis: string } {
  const arm = eventMetric(a, 'armStrengthMph')
  if (arm) return { mph: arm.value, quality: arm.quality, basis: `arm strength ${arm.value.toFixed(1)} mph (${arm.quality.toLowerCase()})` }
  const v = throwVelocity(a, 'baseball')
  return { mph: v.mph * effort, quality: v.quality, basis: `${effort} × ${v.mph.toFixed(1)} mph baseball velocity (${v.quality.toLowerCase()})` }
}

/**
 * A fungo session of `chances` batted balls (40% grounders, 20% liners, 40% flies). Reaction time
 * (0.25-0.4 s) follows the agility grade, routes are 90-97% efficient, the run uses the sprint
 * model, and the catch is a logistic in time to spare shifted by the fielding grade. A cleanly
 * fielded grounder then needs a 30 m throw to beat a 4.3 s runner.
 */
export function fieldingDrill(a: Athlete, chances: number, rng: () => number): FieldingDrill {
  const n = count(chances)
  const profile = sprintProfile(a)
  const { agility, fielding: field } = skillZ(a)
  const arm = armSpeed(a, INFIELD_EFFORT)
  const throwS = flatTime(THROW_TO_FIRST_M, arm.mph * MPH_TO_MS, BASEBALL_DRAG)
  // Even sure hands drop about one routine ball in seventy.
  const sureHands = clamp(0.985 + 0.006 * field, 0.95, 0.995)
  const list: FieldingChance[] = []
  for (let i = 0; i < n; i++) {
    const ball = drawChance(rng)
    const uReact = rng()
    const uRoute = rng()
    const uCatch = rng()
    const uTransfer = rng()
    const reactionS = clamp(0.325 - 0.05 * agility + 0.04 * (uReact - 0.5), 0.25, 0.4)
    const efficiency = clamp(0.935 + 0.01 * field + 0.035 * (2 * uRoute - 1), 0.9, 0.97)
    const path = Math.hypot(ball.x, ball.z) / efficiency
    const arrivalS = reactionS + runSprint(profile, path).time
    const catchMargin = ball.hang - arrivalS
    const p = sureHands / (1 + Math.exp(-(CATCH_SLOPE * catchMargin + CATCH_SKILL * field)))
    const chance: FieldingChance = {
      type: ball.type,
      ball: { x: ball.x, z: ball.z },
      hangTimeS: ball.hang,
      reactionS,
      arrivalS,
      outcome: 'out',
      marginS: catchMargin,
    }
    if (uCatch >= p) {
      chance.outcome = catchMargin >= ERROR_MARGIN_S ? 'error' : 'hit'
    } else if (ball.type === 'grounder') {
      const fieldedS = ball.hang + (catchMargin < 0 ? DIVE_RECOVERY_S : 0)
      const transferS = clamp(0.7 - 0.05 * agility + 0.1 * (uTransfer - 0.5), 0.5, 0.9)
      const throwArrivalS = fieldedS + transferS + throwS
      chance.throwArrivalS = throwArrivalS
      chance.marginS = RUNNER_TO_FIRST_S - throwArrivalS
      chance.outcome = chance.marginS > 0 ? 'out' : 'hit'
    }
    list.push(chance)
  }
  return {
    chances: list,
    outs: list.filter((c) => c.outcome === 'out').length,
    quality: 'SIMULATED',
    basis:
      `Random batted balls. Reaction about ${clamp(0.325 - 0.05 * agility, 0.25, 0.4).toFixed(2)} s from the agility grade; routes 90-97% efficient; runs from the sprint model (${profile.basis}) ` +
      `Catch odds are logistic in time to spare with fielding z ${field >= 0 ? '+' : ''}${field.toFixed(1)}${a.league === 'MLB' ? '' : ' (no glove experience)'}. ` +
      `Grounders need a ${THROW_TO_FIRST_M} m throw at ${arm.mph.toFixed(1)} mph, ${arm.basis}, to beat a ${RUNNER_TO_FIRST_S} s runner.`,
  }
}

// ---------------------------------------------------------------------------------------------
// Outfield throw home

export interface OutfieldThrowResult {
  velocityMph: number
  /** From the catch, crow hop included, to the ball reaching the plate. */
  timeToPlateS: number
  /** Catch to release. */
  releaseS: number
  /** Launch angle chosen as the fastest way home, for drawing the path with flight(). */
  angleDeg: number
  bounces: boolean
  /** Metres off the plate line where the catcher takes it, + toward the third-base side. */
  dx: number
  /** TAG_UP_S minus (time to plate plus the catcher's tag); positive means the runner is out. */
  marginS: number
  runnerOut: boolean
}

export interface OutfieldThrow {
  throws: OutfieldThrowResult[]
  outs: number
  distanceFt: number
  quality: 'SIMULATED'
  basis: string
}

/**
 * The fastest way home at a given release speed: the flattest throw that carries to the plate on
 * the fly, or a lower one that lands short and hops in, whichever arrives first.
 */
export function fastestThrowHome(speedMs: number, distanceM: number): { angleDeg: number; flightS: number; bounces: boolean } {
  let best = { angleDeg: 0, flightS: Infinity, bounces: true }
  let lastShort = -1
  for (let angle = 0; angle <= 40; angle += 1) {
    const f = flight(speedMs, angle, BASEBALL_DRAG)
    if (f.distance >= distanceM) {
      const fly = carryTo(speedMs, distanceM, lastShort, angle)
      if (fly.flightS < best.flightS) best = { angleDeg: fly.angleDeg, flightS: fly.flightS, bounces: false }
      return best
    }
    lastShort = angle
    const vxLand = speedMs * Math.cos((angle * Math.PI) / 180) * Math.exp(-BASEBALL_DRAG * f.distance)
    const total = f.time + flatTime(distanceM - f.distance, BOUNCE_KEEP * vxLand, BASEBALL_DRAG + HOP_DRAG)
    if (total < best.flightS) best = { angleDeg: angle, flightS: total, bounces: true }
  }
  return best
}

/** Bisect the launch angle that lands the ball on the plate. */
function carryTo(speedMs: number, distanceM: number, shortDeg: number, longDeg: number): { angleDeg: number; flightS: number } {
  // When even a level throw carries, aim down at the plate.
  let lo = shortDeg < 0 ? -30 : shortDeg
  let hi = longDeg
  let f = flight(speedMs, hi, BASEBALL_DRAG)
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2
    const g = flight(speedMs, mid, BASEBALL_DRAG)
    if (g.distance >= distanceM) {
      hi = mid
      f = g
    } else lo = mid
  }
  return { angleDeg: hi, flightS: f.time }
}

/**
 * Outfielder catches a fly `distanceFt` from home (clamped to 30-400 ft) and throws to the plate
 * with a crow hop, at throwVelocity(baseball) × 0.97 (or a measured arm strength) give or take 2%.
 * The runner tags from third and scores in 3.6 s; the catcher's tag takes longer the farther off
 * line the throw arrives.
 */
export function outfieldThrow(a: Athlete, distanceFt: number, throws: number, rng: () => number): OutfieldThrow {
  const n = count(throws)
  const feet = clamp(Number.isFinite(distanceFt) ? distanceFt : 250, 30, 400)
  const distanceM = feet * FEET_TO_M
  const arm = armSpeed(a, CROW_HOP)
  const { agility, fielding: field } = skillZ(a)
  const sdM = (0.3 + 0.012 * distanceM) * clamp(1 - 0.1 * field, 0.7, 1.4) * (a.league === 'MLB' ? 1 : 1.3)
  const list: OutfieldThrowResult[] = []
  for (let i = 0; i < n; i++) {
    const uVel = rng() + rng() - 1
    const uRelease = rng()
    const miss = gaussian(rng)
    const velocityMph = arm.mph * (1 + 0.02 * uVel)
    const releaseS = clamp(0.85 - 0.04 * agility + 0.1 * (uRelease - 0.5), 0.7, 1)
    const path = fastestThrowHome(velocityMph * MPH_TO_MS, distanceM)
    // A hop skids unpredictably, so it spreads a little wider.
    const dx = miss * sdM * (path.bounces ? 1.15 : 1)
    const timeToPlateS = releaseS + path.flightS
    const tagS = 0.12 + 0.3 * Math.max(0, Math.abs(dx) - 0.6)
    const marginS = TAG_UP_S - (timeToPlateS + tagS)
    list.push({ velocityMph, timeToPlateS, releaseS, angleDeg: path.angleDeg, bounces: path.bounces, dx, marginS, runnerOut: marginS > 0 })
  }
  return {
    throws: list,
    outs: list.filter((t) => t.runnerOut).length,
    distanceFt: feet,
    quality: 'SIMULATED',
    basis:
      `Random throws from ${feet.toFixed(0)} ft at ${arm.mph.toFixed(1)} mph ±2%: ${arm.basis}, with a crow hop. ` +
      `Flight with baseball drag on the fastest line home, one hop when that beats carrying it. The runner tags from third and needs ${TAG_UP_S} s.`,
  }
}
