import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { LB_TO_KG, MPH_TO_MS, YD_TO_M } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { POSITIONS, positionGroupFor } from '../data/positions'
import { gradesFor, type Grade } from '../grades/grades'
import { groupFor, normFor, type Norm } from '../grades/norms'
import { gaussian } from './rng'
import { massKg } from './normalize'
import { FATIGUE_ONSET_S, runSprint, sprintProfile, type SprintProfile } from './sprint'
import { BALLS, flight, maxDistance, throwVelocity } from './throwing'

/**
 * NFL same-league versus events: route races, tackle breaking, quarterback accuracy and arm
 * strength, and one-on-one pass rush. Physics on profile figures is at best ESTIMATED; anything
 * a random draw decides is SIMULATED. Pure and deterministic for a given rng.
 */

// ---------------------------------------------------------------------------------------------
// Shared inputs

/** Grade z for a sport skill the athlete's league does not grade (a guard breaking tackles). */
export const CROSS_SPORT_Z = -1

const NFL_GROUPS = new Set(POSITIONS.NFL.map((p) => p.group))

/** The athlete's NFL position group, or undefined for other leagues. */
function nflGroup(a: Athlete): string | undefined {
  if (a.league !== 'NFL') return undefined
  return NFL_GROUPS.has(a.positionGroup) ? a.positionGroup : positionGroupFor('NFL', a.position)
}

function gradeZ(grades: Grade[], id: string, fallback: number): { z: number; quality: Quality } {
  const g = grades.find((x) => x.id === id)
  return g ? { z: g.z, quality: g.quality } : { z: fallback, quality: 'SIMULATED' }
}

export interface ChangeOfDirection {
  /** 5-10-5 shuttle time the athlete's change of direction is equivalent to, seconds. */
  shuttleS: number
  quality: Quality
  basis: string
}

/** Shared pro spreads (as in norms.ts), used to put a 3-cone time on the shuttle scale. */
const SHUTTLE_SCALE = { mean: 4.35, sd: 0.15 }
const CONE_SCALE = { mean: 7.15, sd: 0.2 }

/**
 * Change of direction as an equivalent 5-10-5 time, so it can be judged on an absolute scale: a
 * lineman's good-for-a-lineman shuttle still reads as slow next to a receiver's. Uses the shuttle
 * and 3-cone (the cone mapped onto the shuttle scale), else the position-relative agility grade
 * turned back into a time through the position's shuttle norm.
 */
export function changeOfDirection(a: Athlete, grades: Grade[] = gradesFor(a)): ChangeOfDirection {
  const shuttle = resolveMetric(a, 'shuttleS')
  const cone = resolveMetric(a, 'threeConeS')
  const fromCone = cone ? SHUTTLE_SCALE.mean + ((cone.value - CONE_SCALE.mean) * SHUTTLE_SCALE.sd) / CONE_SCALE.sd : undefined
  if (shuttle && fromCone !== undefined && cone) {
    return {
      shuttleS: 0.55 * shuttle.value + 0.45 * fromCone,
      quality: weakest(shuttle.quality, cone.quality, 'ESTIMATED'),
      basis: `${shuttle.value.toFixed(2)} s shuttle and ${cone.value.toFixed(2)} s 3-cone`,
    }
  }
  if (shuttle) return { shuttleS: shuttle.value, quality: shuttle.quality, basis: `${shuttle.value.toFixed(2)} s shuttle` }
  if (fromCone !== undefined && cone) return { shuttleS: fromCone, quality: weakest(cone.quality, 'ESTIMATED'), basis: `${cone.value.toFixed(2)} s 3-cone, mapped to a shuttle time` }
  const agility = gradeZ(grades, 'agility', 0)
  const sn = normFor(groupFor(a.positionGroup, a.league), a.league, 'shuttleS') ?? SHUTTLE_SCALE
  return {
    shuttleS: sn.mean - agility.z * sn.sd,
    quality: weakest(agility.quality, 'ESTIMATED'),
    basis: `no shuttle or 3-cone, so the agility grade (z ${agility.z.toFixed(2)}) against the position norm`,
  }
}

/** z of an equivalent shuttle against a reference (positive = quicker). */
function codZ(cod: ChangeOfDirection, ref: Pick<Norm, 'mean' | 'sd'>): number {
  return clamp((ref.mean - cod.shuttleS) / ref.sd, -3, 3)
}

// ---------------------------------------------------------------------------------------------
// Routes

export type RouteId = 'slant' | 'out' | 'go' | 'post' | 'curl' | 'dig'

export interface RouteDef {
  label: string
  /** Waypoints in yards from the alignment: +z downfield, +x toward the receiver's sideline. */
  points: [number, number][]
  description: string
}

/** Route-tree stems and breaks for a receiver split wide. Mirror x for the other side of the field. */
export const ROUTES: Record<RouteId, RouteDef> = {
  slant: {
    label: 'Slant',
    points: [[0, 0], [0, 3], [-6, 9]],
    description: 'Three hard steps, then a 45-degree cut inside, away from the sideline.',
  },
  out: {
    label: 'Out',
    points: [[0, 0], [0, 10], [7, 10]],
    description: '10-yard stem, then a square cut toward the sideline.',
  },
  curl: {
    label: 'Curl',
    points: [[0, 0], [0, 12], [-1, 10]],
    description: '12-yard stem, then stop and come back two yards toward the quarterback, settling inside.',
  },
  dig: {
    label: 'Dig',
    points: [[0, 0], [0, 12], [-12, 12]],
    description: '12-yard stem, then a square cut across the middle.',
  },
  post: {
    label: 'Post',
    points: [[0, 0], [0, 12], [-10, 22]],
    description: '12-yard stem, then a 45-degree cut toward the goalposts.',
  },
  go: {
    label: 'Go',
    points: [[0, 0], [0, 40]],
    description: 'Straight vertical release: 40 yards flat out with no break.',
  },
}

/** Display order, short to deep. */
export const ROUTE_IDS: RouteId[] = ['slant', 'out', 'curl', 'dig', 'post', 'go']

export interface RoutePoint {
  t: number
  /** Metres toward the sideline. */
  x: number
  /** Metres downfield. */
  z: number
  /** m/s. */
  speed: number
}

export interface RouteBreak {
  /** Time the receiver reaches the break point, seconds from the snap. */
  atS: number
  /** Time the break costs against carrying full speed through it: plant plus re-acceleration. */
  lossS: number
  angleDeg: number
  speedInMs: number
  speedOutMs: number
}

export interface RouteRun {
  athleteId: string
  route: RouteId
  /** Seconds from the snap to the end of the route. */
  time: number
  /** Position and speed sampled at PATH_HZ, in metres, for animation. */
  path: RoutePoint[]
  breaks: RouteBreak[]
  topSpeedMph: number
  quality: Quality
  /** Quality of the sprint and change-of-direction inputs the run is built on. */
  inputQuality: Quality
  basis: string
}

export const PATH_HZ = 30
/** Time from the snap to the first step. */
export const SNAP_REACTION_S = 0.1
export const JITTER_SD_S = 0.02
/** Change of direction of a typical pro receiver or back; route cuts are judged against it. */
export const SKILL_SHUTTLE = { mean: 4.3, sd: 0.15 }

/** Share of the incoming speed kept through a cut: (1 + cos θ) / 2, nudged by change of direction. */
export function cutRetention(angleDeg: number, z: number): number {
  const geometric = (1 + Math.cos((angleDeg * Math.PI) / 180)) / 2
  return clamp(geometric * (1 + 0.06 * clamp(z, -3, 3)), 0, 0.95)
}

/** Plant time before jitter: sharper cuts take longer, quick feet plant faster. */
export function plantTime(angleDeg: number, z: number): number {
  return Math.max(0.03, (0.05 + (0.25 * angleDeg) / 180) * (1 - 0.1 * clamp(z, -3, 3)))
}

/**
 * One receiver running a route alone. Each straight leg runs the sprint model from the speed
 * carried out of the previous cut; each cut keeps a share of the speed and costs a plant.
 */
export function routeRace(a: Athlete, route: RouteId, rng: () => number): RouteRun {
  const def = ROUTES[route]
  const profile = sprintProfile(a)
  const cod = changeOfDirection(a)
  const z = codZ(cod, SKILL_SHUTTLE)
  const pts = def.points.map(([x, zz]) => [x * YD_TO_M, zz * YD_TO_M] as const)
  const start = pts[0]!
  const reaction = clamp(SNAP_REACTION_S + JITTER_SD_S * gaussian(rng), 0.04, 0.2)
  const dense: RoutePoint[] = [
    { t: 0, x: start[0], z: start[1], speed: 0 },
    { t: reaction, x: start[0], z: start[1], speed: 0 },
  ]
  const breaks: RouteBreak[] = []
  let t = reaction
  let v = 0
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!
    const [bx, bz] = pts[i + 1]!
    const length = Math.hypot(bx - ax, bz - az)
    if (length === 0) continue
    let plant = 0
    let vOut = v
    let angle = 0
    if (i > 0) {
      const [px, pz] = pts[i - 1]!
      angle = turnAngle(ax - px, az - pz, bx - ax, bz - az)
      vOut = v * cutRetention(angle, z)
      plant = Math.max(0.02, plantTime(angle, z) + JITTER_SD_S * gaussian(rng))
    }
    const leg = runLeg(profile, vOut, length, t + plant)
    if (i > 0) {
      const carried = runLeg(profile, v, length, t).time
      breaks.push({ atS: t, lossS: plant + leg.time - carried, angleDeg: angle, speedInMs: v, speedOutMs: vOut })
      t += plant
      dense.push({ t, x: ax, z: az, speed: vOut })
    }
    const ux = (bx - ax) / length
    const uz = (bz - az) / length
    for (let k = 1; k < leg.steps.length; k++) {
      const s = leg.steps[k]!
      dense.push({ t: t + s.t, x: ax + ux * s.d, z: az + uz * s.d, speed: s.v })
    }
    t += leg.time
    v = leg.endSpeed
  }
  const top = dense.reduce((m, p) => Math.max(m, p.speed), 0)
  return {
    athleteId: a.id,
    route,
    time: t,
    path: resample(dense, t, PATH_HZ),
    breaks,
    topSpeedMph: top / MPH_TO_MS,
    quality: 'SIMULATED',
    inputQuality: weakest(profile.quality, cod.quality),
    basis: `${profile.basis} Cuts keep (1 + cos θ)/2 of the speed and cost a plant, scaled by change of direction (${cod.basis}). Snap reaction and plant times carry random jitter.`,
  }
}

/** Angle between two headings, 0 (straight on) to 180 (reversal), degrees. */
function turnAngle(ux: number, uz: number, wx: number, wz: number): number {
  const cos = (ux * wx + uz * wz) / (Math.hypot(ux, uz) * Math.hypot(wx, wz) || 1)
  return (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI
}

interface LegStep {
  t: number
  d: number
  v: number
}

function fatigueFactor(p: SprintProfile, elapsed: number): number {
  return Math.max(0.5, 1 - Math.max(0, elapsed - FATIGUE_ONSET_S) * p.fatigue)
}

/**
 * Run `length` metres on the sprint curve entering at speed v0, as if joining the acceleration
 * curve at the moment it reaches v0. Fatigue follows time since the snap.
 */
function runLeg(p: SprintProfile, v0: number, length: number, elapsed: number, dt = 1 / 240): { time: number; endSpeed: number; steps: LegStep[] } {
  const ratio = clamp(v0 / (p.vmax * fatigueFactor(p, elapsed)), 0, 0.999)
  const te0 = -p.tau * Math.log(1 - ratio)
  const speed = (t: number): number => p.vmax * (1 - Math.exp(-(te0 + t) / p.tau)) * fatigueFactor(p, elapsed + t)
  const steps: LegStep[] = [{ t: 0, d: 0, v: v0 }]
  let t = 0
  let d = 0
  let v = v0
  while (d < length && t < 60) {
    const v1 = speed(t + dt)
    const step = ((v + v1) / 2) * dt
    if (d + step >= length) {
      const frac = (length - d) / step
      t += dt * frac
      v += (v1 - v) * frac
      d = length
      steps.push({ t, d, v })
      break
    }
    t += dt
    d += step
    v = v1
    steps.push({ t, d, v })
  }
  return { time: t, endSpeed: v, steps }
}

/** Linear resampling of a time-ordered track at `hz`, always ending on the final state. */
function resample(dense: RoutePoint[], end: number, hz: number): RoutePoint[] {
  const out: RoutePoint[] = []
  const frames = Math.floor(end * hz + 1e-9)
  let j = 0
  for (let k = 0; k <= frames; k++) {
    const t = k / hz
    while (j < dense.length - 2 && dense[j + 1]!.t <= t) j++
    const a = dense[j]!
    const b = dense[j + 1] ?? a
    const f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1
    out.push({ t, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, speed: a.speed + (b.speed - a.speed) * f })
  }
  const last = dense[dense.length - 1]!
  if (out[out.length - 1]!.t < end - 1e-9) out.push({ ...last, t: end })
  return out
}

// ---------------------------------------------------------------------------------------------
// Tackle breaking

export type TackleOutcome = 'broken' | 'juked' | 'tackled'

export interface TackleRep {
  outcome: TackleOutcome
  /** Chance the carrier breaks the tackle once contact is made. */
  pBreak: number
  /** Chance the carrier makes the tackler miss before contact. */
  pJuke: number
  /** Carrier speed at the meeting point, m/s. */
  contactSpeedMs: number
  /** Carrier mass × contact speed, kg·m/s. */
  carrierMomentum: number
  tacklerMomentum: number
  yardsAfterContact: number
}

export interface TackleBreakResult {
  reps: TackleRep[]
  broken: number
  juked: number
  tackled: number
  /** Share of reps the carrier got away, by breaking the tackle or making the tackler miss. */
  rate: number
  avgYardsAfterContact: number
  quality: 'SIMULATED'
  basis: string
}

/** Position groups that tackle for a living. */
const TACKLERS = new Set(['DB', 'LB', 'DL'])
/** Added to the carrier's break and juke logits when the tackler is not a defender. */
export const NON_DEFENDER_PENALTY = 0.6
/** Pursuit-speed reference for tacklers (top speed, m/s). */
const TACKLER_VMAX = { mean: 9.4, sd: 0.5 }

/**
 * A carrier meets a tackler in space, `reps` times. The carrier first tries to make him miss
 * (pJuke); otherwise contact is made and a logistic model on the momentum ratio, the carrier's
 * tackle-breaking and strength grades and the tackler's strength decides whether it holds.
 */
export function tackleBreak(carrier: Athlete, tackler: Athlete, reps: number, rng: () => number): TackleBreakResult {
  const cg = gradesFor(carrier)
  const tg = gradesFor(tackler)
  const cp = sprintProfile(carrier)
  const tp = sprintProfile(tackler)
  const cMass = massKg(carrier)
  const tMass = massKg(tackler)
  const breaking = gradeZ(cg, 'tackleBreaking', CROSS_SPORT_Z).z
  const elusive = gradeZ(cg, 'elusiveness', CROSS_SPORT_Z).z
  const cStrength = gradeZ(cg, 'strength', 0).z
  const tStrength = gradeZ(tg, 'strength', 0).z
  const tSpeed = clamp((tp.vmax - TACKLER_VMAX.mean) / TACKLER_VMAX.sd, -3, 3)
  const tCod = codZ(changeOfDirection(tackler, tg), SKILL_SHUTTLE)
  const defender = TACKLERS.has(nflGroup(tackler) ?? '')
  const penalty = defender ? 0 : NON_DEFENDER_PENALTY
  const pJuke = logistic(-2.2 + 0.5 * elusive - 0.35 * tSpeed - 0.25 * tCod + penalty)

  const list: TackleRep[] = []
  const n = Math.max(0, Math.floor(reps))
  for (let i = 0; i < n; i++) {
    const contactSpeedMs = cp.vmax * clamp(0.62 + 0.12 * gaussian(rng), 0.3, 0.95)
    const closing = tp.vmax * clamp(0.55 + 0.12 * gaussian(rng), 0.3, 0.95)
    const carrierMomentum = cMass * contactSpeedMs
    const tacklerMomentum = tMass * closing
    const ratio = Math.log(Math.max(1e-6, carrierMomentum) / Math.max(1e-6, tacklerMomentum))
    const pBreak = logistic(-2 + 2.2 * ratio + 0.35 * breaking + 0.2 * cStrength - 0.3 * tStrength + penalty)
    const u = rng()
    const outcome: TackleOutcome = u < pJuke ? 'juked' : u < pJuke + (1 - pJuke) * pBreak ? 'broken' : 'tackled'
    const g = gaussian(rng)
    const yac =
      outcome === 'juked' ? clamp(4 + 3 * Math.abs(g), 2, 20) : outcome === 'broken' ? clamp(3 + 2.5 * Math.abs(g) + 1.5 * ratio, 1, 15) : clamp(0.8 + 2 * ratio + 0.7 * g, -2, 4)
    list.push({ outcome, pBreak, pJuke, contactSpeedMs, carrierMomentum, tacklerMomentum, yardsAfterContact: Math.round(yac * 10) / 10 })
  }
  const broken = list.filter((r) => r.outcome === 'broken').length
  const juked = list.filter((r) => r.outcome === 'juked').length
  return {
    reps: list,
    broken,
    juked,
    tackled: n - broken - juked,
    rate: n ? (broken + juked) / n : 0,
    avgYardsAfterContact: n ? list.reduce((s, r) => s + r.yardsAfterContact, 0) / n : 0,
    quality: 'SIMULATED',
    basis: `Logistic model: carrier momentum (${cMass.toFixed(0)} kg × contact speed) against the tackler's (${tMass.toFixed(0)} kg × closing speed), the carrier's tackle-breaking, elusiveness and strength grades, and the tackler's strength, pursuit speed and change of direction${defender ? '' : `; ${tackler.name} is not a defensive player, so the carrier gets +${NON_DEFENDER_PENALTY} on both logits`}. Speeds at contact are random draws.`,
  }
}

// ---------------------------------------------------------------------------------------------
// Quarterback accuracy and arm strength

export interface QbThrow {
  depthYd: number
  /** Metres off target across (positive = right) and up (positive = high). */
  dx: number
  dy: number
  /** Rings at 0.5, 1 and 1.5 m score 3, 2 and 1. */
  points: number
  velocityMph: number
  airTimeS: number
  /** False when the target is beyond the athlete's longest throw; the ball lands short by -dy. */
  inRange: boolean
}

export interface QbDepthSummary {
  depthYd: number
  throws: number
  points: number
  avgPoints: number
  /** Spread of the throws across (sd, metres); vertical spread is 0.8 of it. */
  sdM: number
  airTimeS: number
  launchDeg: number
  inRange: boolean
}

export interface QbAccuracyResult {
  throws: QbThrow[]
  total: number
  maxTotal: number
  byDepth: QbDepthSummary[]
  /** Quality of the scores and misses: random draws. */
  quality: Quality
  velocityQuality: Quality
  /** Quality of the air times and launch angles: physics on the velocity. */
  flightQuality: Quality
  skillZ: number
  skillQuality: Quality
  basis: string
}

/** Accuracy z for a non-quarterback whose grade is only a position baseline (the RB baseline). */
export const NON_PASSER_Z = -2
/** Release at 2.0 m, catch at 1.3 m: the flight integrator's ground becomes the catch height. */
const RELEASE_ABOVE_CATCH_M = 0.7

function passingSkill(a: Athlete, grades: Grade[]): { z: number; quality: Quality; basis: string; nativeBall: boolean } {
  if (a.league === 'NFL') {
    const g = grades.find((x) => x.id === 'throwAccuracy')
    let z = g?.z ?? 0
    // Only RBs carry a baseline in the grade; any other non-quarterback without inputs is treated
    // as a non-passer rather than an average one.
    if (nflGroup(a) !== 'QB' && (!g || g.terms.length === 0)) z = Math.min(z, NON_PASSER_Z)
    return { z, quality: g?.quality ?? 'SIMULATED', basis: `throw accuracy grade (z ${z.toFixed(2)})`, nativeBall: true }
  }
  const id = a.league === 'MLB' ? 'command' : 'passing'
  const g = grades.find((x) => x.id === id)
  const z = g?.z ?? CROSS_SPORT_Z
  return { z, quality: g?.quality ?? 'SIMULATED', basis: `${g?.label.toLowerCase() ?? id} grade (z ${z.toFixed(2)}) with 1.5× spread for an unfamiliar ball`, nativeBall: false }
}

/** Lowest launch angle that carries `distanceM` to catch height, or the longest throw if it cannot. */
function solveLaunch(speedMs: number, distanceM: number): { angleDeg: number; airTimeS: number; reachM: number; inRange: boolean } {
  const drag = BALLS.football.drag
  const best = maxDistance(speedMs, drag)
  const top = flight(speedMs, best.angle, drag, RELEASE_ABOVE_CATCH_M)
  if (top.distance < distanceM) return { angleDeg: best.angle, airTimeS: top.time, reachM: top.distance, inRange: false }
  let lo = -10
  let hi = best.angle
  const low = flight(speedMs, lo, drag, RELEASE_ABOVE_CATCH_M)
  if (low.distance >= distanceM) return { angleDeg: lo, airTimeS: low.time, reachM: low.distance, inRange: true }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (flight(speedMs, mid, drag, RELEASE_ABOVE_CATCH_M).distance < distanceM) lo = mid
    else hi = mid
  }
  const f = flight(speedMs, hi, drag, RELEASE_ABOVE_CATCH_M)
  return { angleDeg: hi, airTimeS: f.time, reachM: f.distance, inRange: true }
}

/**
 * Throws at a target at each depth (passer-to-target distance, yards). The miss spreads with
 * depth and tightens with the accuracy grade; air time is the flight of the athlete's football
 * velocity on the flattest arc that gets there. Depths that are not positive are skipped.
 */
export function qbAccuracy(a: Athlete, depthsYd: number[], throwsPerDepth: number, rng: () => number): QbAccuracyResult {
  const skill = passingSkill(a, gradesFor(a))
  const v = throwVelocity(a, 'football')
  const speedMs = v.mph * MPH_TO_MS
  const per = Math.max(0, Math.floor(throwsPerDepth))
  const z = clamp(skill.z, -3, 3)
  const throws: QbThrow[] = []
  const byDepth: QbDepthSummary[] = []
  for (const depthYd of depthsYd) {
    if (!Number.isFinite(depthYd) || depthYd <= 0) continue
    const dM = depthYd * YD_TO_M
    const sdM = Math.max(0.12, (0.3 + dM / 45) * (1 - 0.12 * z) * (skill.nativeBall ? 1 : 1.5))
    const launch = solveLaunch(speedMs, dM)
    let points = 0
    for (let i = 0; i < per; i++) {
      const dx = gaussian(rng) * sdM
      const scatterY = gaussian(rng) * sdM * 0.8
      const dy = launch.inRange ? scatterY : -(dM - launch.reachM)
      const r = Math.hypot(dx, dy)
      const p = !launch.inRange ? 0 : r <= 0.5 ? 3 : r <= 1 ? 2 : r <= 1.5 ? 1 : 0
      points += p
      throws.push({ depthYd, dx, dy, points: p, velocityMph: v.mph, airTimeS: launch.airTimeS, inRange: launch.inRange })
    }
    byDepth.push({ depthYd, throws: per, points, avgPoints: per ? points / per : 0, sdM, airTimeS: launch.airTimeS, launchDeg: launch.angleDeg, inRange: launch.inRange })
  }
  return {
    throws,
    total: throws.reduce((s, x) => s + x.points, 0),
    maxTotal: 3 * throws.length,
    byDepth,
    quality: 'SIMULATED',
    velocityQuality: v.quality,
    flightQuality: weakest(v.quality, 'ESTIMATED'),
    skillZ: skill.z,
    skillQuality: skill.quality,
    basis: `Miss spread (0.30 m + distance ÷ 45) × (1 − 0.12 z) from the ${skill.basis}; velocity ${v.mph.toFixed(1)} mph: ${v.basis}`,
  }
}

export interface ArmStrengthResult {
  velocityMph: number
  velocityQuality: Quality
  /** Longest carry with spiral drag from a 2 m release. */
  maxDistanceYd: number
  angleDeg: number
  /** Quality of the distance and angle: physics on the velocity, so at best ESTIMATED. */
  quality: Quality
  basis: string
}

export function armStrength(a: Athlete): ArmStrengthResult {
  const v = throwVelocity(a, 'football')
  const best = maxDistance(v.mph * MPH_TO_MS, BALLS.football.drag)
  return {
    velocityMph: v.mph,
    velocityQuality: v.quality,
    maxDistanceYd: best.distance / YD_TO_M,
    angleDeg: best.angle,
    quality: weakest(v.quality, 'ESTIMATED'),
    basis: `${v.basis} Longest carry of a spiral at ${v.mph.toFixed(1)} mph from a 2 m release, searched over launch angles.`,
  }
}

// ---------------------------------------------------------------------------------------------
// Pass rush

export type PassRushMove = 'speed' | 'power' | 'counter'

export interface PassRushRep {
  win: boolean
  /** Seconds from the snap to the win, or null when the blocker held for the whole window. */
  timeToWinS: number | null
  move: PassRushMove
  /** Chance this move wins inside the window. */
  pWin: number
}

export interface PassRushResult {
  reps: PassRushRep[]
  winRate: number
  /** Mean time of the wins, or null when there were none. */
  avgTimeToWin: number | null
  byMove: Record<PassRushMove, { reps: number; wins: number }>
  quality: 'SIMULATED'
  basis: string
}

/** A rep the rusher has not won by this time counts as a loss. */
export const RUSH_WINDOW_S = 3.0
/** Get-off and footwork references centred on a typical defensive lineman versus a tackle. */
const RUSH_TEN = { mean: 1.72, sd: 0.07 }
const RUSHER_SHUTTLE = { mean: 4.55, sd: 0.15 }
const BLOCKER_SHUTTLE = { mean: 4.7, sd: 0.15 }
/** Technique penalties by position group: the rusher's subtracts, the blocker's adds. */
const RUSH_PENALTY: Record<string, number> = { DL: 0, LB: 0.3, DB: 0.8 }
const BLOCK_PENALTY: Record<string, number> = { OL: 0, TE: 0.4, RB: 0.6 }
const OFF_POSITION_PENALTY = 1.5
const MOVES: PassRushMove[] = ['speed', 'power', 'counter']

export interface GetOff {
  tenSplitS: number
  quality: Quality
  basis: string
}

/** Get-off off the line: the measured 10-yard split, else the sprint model's split from the 40. */
export function getOff(a: Athlete): GetOff {
  const ten = resolveMetric(a, 'tenSplitS')
  if (ten) return { tenSplitS: ten.value, quality: ten.quality, basis: `${ten.value.toFixed(2)} s 10-yard split` }
  const p = sprintProfile(a)
  const time = runSprint(p, 10 * YD_TO_M).time
  return { tenSplitS: time, quality: weakest(p.quality, 'ESTIMATED'), basis: `${time.toFixed(2)} s 10-yard split from the sprint model` }
}

/**
 * One-on-one pass rush. Each move has a score from the matchup; the rusher picks moves in
 * proportion to exp(1.2 × score) and wins inside the window with logistic(−0.9 + score). The
 * time of a win follows a constant hazard after engagement, so faster wins come with bigger edges.
 */
export function passRush(rusher: Athlete, blocker: Athlete, reps: number, rng: () => number): PassRushResult {
  const rg = gradesFor(rusher)
  const bg = gradesFor(blocker)
  const off = getOff(rusher)
  const g = clamp((RUSH_TEN.mean - off.tenSplitS) / RUSH_TEN.sd, -2.5, 2.5)
  const rFeet = codZ(changeOfDirection(rusher, rg), RUSHER_SHUTTLE)
  const bFeet = codZ(changeOfDirection(blocker, bg), BLOCKER_SHUTTLE)
  const rLb = massKg(rusher) / LB_TO_KG
  const bLb = massKg(blocker) / LB_TO_KG
  const size = clamp((rLb - bLb) / 30, -4, 4)
  const strength = gradeZ(rg, 'strength', 0).z - gradeZ(bg, 'strength', 0).z
  const rushGrade = gradeZ(rg, 'passRush', CROSS_SPORT_Z).z
  const blockGrade = gradeZ(bg, 'blocking', CROSS_SPORT_Z).z
  const rushPenalty = RUSH_PENALTY[nflGroup(rusher) ?? ''] ?? OFF_POSITION_PENALTY
  const blockPenalty = BLOCK_PENALTY[nflGroup(blocker) ?? ''] ?? OFF_POSITION_PENALTY
  const skill = 0.4 * rushGrade - 0.4 * blockGrade - rushPenalty + blockPenalty
  const score: Record<PassRushMove, number> = {
    speed: 0.5 * g - 0.6 * bFeet + skill,
    power: 0.6 * strength + 0.6 * size + skill,
    counter: 0.35 * g + 0.4 * rFeet - 0.4 * bFeet + skill,
  }
  const weights = MOVES.map((m) => Math.exp(1.2 * clamp(score[m], -10, 10)))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  // Engagement: a quicker get-off reaches the blocker sooner.
  const engage = clamp(0.55 - 0.05 * g, 0.35, 0.8)

  const list: PassRushRep[] = []
  const byMove: Record<PassRushMove, { reps: number; wins: number }> = { speed: { reps: 0, wins: 0 }, power: { reps: 0, wins: 0 }, counter: { reps: 0, wins: 0 } }
  const n = Math.max(0, Math.floor(reps))
  for (let i = 0; i < n; i++) {
    let pick = rng() * totalWeight
    let move: PassRushMove = 'counter'
    for (let k = 0; k < MOVES.length; k++) {
      pick -= weights[k]!
      if (pick < 0) {
        move = MOVES[k]!
        break
      }
    }
    const pWin = logistic(-0.9 + clamp(score[move], -10, 10))
    const u = rng()
    const win = u < pWin
    const hazard = -Math.log(1 - pWin) / (RUSH_WINDOW_S - engage)
    const timeToWinS = win ? Math.min(RUSH_WINDOW_S, engage - Math.log(1 - u) / hazard) : null
    byMove[move].reps++
    if (win) byMove[move].wins++
    list.push({ win, timeToWinS, move, pWin })
  }
  const wins = list.filter((r) => r.win)
  return {
    reps: list,
    winRate: n ? wins.length / n : 0,
    avgTimeToWin: wins.length ? wins.reduce((s, r) => s + r.timeToWinS!, 0) / wins.length : null,
    byMove,
    quality: 'SIMULATED',
    basis: `Rusher get-off ${off.basis}, ${rLb.toFixed(0)} lb, strength and pass-rush grades against the blocker's strength, blocking grade, ${bLb.toFixed(0)} lb and footwork. A rep is lost if the rusher has not won by ${RUSH_WINDOW_S.toFixed(1)} s. Moves and outcomes are random draws.`,
  }
}

// ---------------------------------------------------------------------------------------------

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
