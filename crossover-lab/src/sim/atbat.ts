import type { Athlete, Pitch, Quality } from '../data/types'
import { weakest } from '../data/types'
import { MPH_TO_MS } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { gradesFor, pitchGrades } from '../grades/grades'
import { heightM } from './normalize'
import { gaussian } from './rng'
import { throwVelocity } from './throwing'

/**
 * Batter vs pitcher. Coordinates in metres: home plate at the origin, the mound toward +z, y up,
 * +x toward third base (a right-handed pitcher's arm side). Pitches fly with constant
 * acceleration from their movement; batted balls use exit velocity, launch angle and a
 * drag-plus-lift carry model. Everything here is SIMULATED.
 */
export const MOUND_Z = 18.44
export const RELEASE_Z = 16.6
export const PLATE_HALF_WIDTH = 0.216 + 0.037
/** Where bat meets ball, just in front of the plate. */
export const CONTACT_PLANE = 0.4
export const G = 9.81

export interface ArsenalPitch {
  type: Pitch['type']
  usage: number
  mph: number
  ivbIn: number
  hbIn: number
  stuffZ: number
  quality: Quality
}

export interface Pitcher {
  athlete: Athlete
  arsenal: ArsenalPitch[]
  commandZ: number
  throwsRight: boolean
  release: { x: number; y: number; z: number }
  quality: Quality
  basis: string
}

export interface Batter {
  athlete: Athlete
  batSpeedMph: number
  contactZ: number
  disciplineZ: number
  launchAngleDeg: number
  batsLeft: boolean
  /** Speed grade z, for infield hits and triples. */
  speedZ: number
  zone: { bottom: number; top: number }
  quality: Quality
  basis: string
}

export function makePitcher(a: Athlete): Pitcher {
  const grades = gradesFor(a)
  const command = grades.find((g) => g.id === 'command')
  const throwsRight = a.throws !== 'L'
  const h = heightM(a)
  const slot = (a.movement.throw.armSlotDeg * Math.PI) / 180
  const release = { x: (throwsRight ? 1 : -1) * (0.35 + 0.35 * Math.cos(slot)), y: h * (0.62 + 0.32 * Math.sin(slot)), z: RELEASE_Z }
  if (a.pitches?.length) {
    const pg = pitchGrades(a)
    return {
      athlete: a,
      arsenal: a.pitches.map((p, i) => ({
        type: p.type,
        usage: p.usagePct.value,
        mph: p.velocityMph.value,
        ivbIn: p.verticalBreakIn.value,
        hbIn: p.horizontalBreakIn.value,
        stuffZ: pg[i]!.z,
        quality: weakest(p.velocityMph.quality, p.verticalBreakIn.quality, p.horizontalBreakIn.quality),
      })),
      commandZ: command?.z ?? 0,
      throwsRight,
      release,
      quality: 'SIMULATED',
      basis: 'Arsenal from the profile; pitch locations and outcomes are simulated.',
    }
  }
  // Non-pitchers throw what they can: a straight fastball at 90% of their converted arm speed
  // and a slower show-me pitch, with wide command.
  const v = throwVelocity(a, 'baseball')
  const fb = v.mph * 0.9
  return {
    athlete: a,
    arsenal: [
      { type: 'four-seam', usage: 75, mph: fb, ivbIn: 10, hbIn: 6, stuffZ: (fb - 94) / 2, quality: 'ESTIMATED' },
      { type: 'changeup', usage: 25, mph: fb * 0.86, ivbIn: 8, hbIn: 9, stuffZ: (fb - 94) / 2 - 0.5, quality: 'SIMULATED' },
    ],
    commandZ: -2,
    throwsRight,
    release,
    quality: 'ESTIMATED',
    basis: `Not a pitcher: fastball at 90% of an estimated ${v.mph.toFixed(0)} mph baseball throw, wide command.`,
  }
}

export function makeBatter(a: Athlete): Batter {
  const grades = gradesFor(a)
  const get = (id: string) => grades.find((g) => g.id === id)
  const h = heightM(a)
  const zone = { bottom: h * 0.255, top: h * 0.56 }
  const batsLeft = a.bats === 'L' || (a.bats === undefined && a.movement.swing.batsLeft)
  if (a.league === 'MLB') {
    const bat = resolveMetric(a, 'batSpeedMph')
    const la = resolveMetric(a, 'avgLaunchAngleDeg')
    return {
      athlete: a,
      batSpeedMph: bat?.value ?? 71,
      contactZ: get('contact')?.z ?? 0,
      disciplineZ: get('plateDiscipline')?.z ?? 0,
      launchAngleDeg: la?.value ?? 12,
      batsLeft,
      speedZ: get('speed')?.z ?? 0,
      zone,
      quality: weakest(bat?.quality ?? 'SIMULATED', 'SIMULATED'),
      basis: 'Bat speed, contact and discipline from the profile and grades.',
    }
  }
  const athleticism = get('athleticism')?.z ?? 0
  const strength = get('strength')?.z ?? 0
  return {
    athlete: a,
    batSpeedMph: 60 + 3 * athleticism + 2 * strength,
    contactZ: -2.2,
    disciplineZ: -1.5,
    launchAngleDeg: 8,
    batsLeft,
    speedZ: get('speed')?.z ?? 0,
    zone,
    quality: 'SIMULATED',
    basis: 'Not a hitter: bat speed estimated from athleticism and strength; contact and discipline well below MLB level.',
  }
}

export interface PitchFlight {
  p0: [number, number, number]
  v0: [number, number, number]
  a: [number, number, number]
  time: number
  plate: { x: number; y: number }
}

export function pitchFlight(p: Pitcher, pitch: ArsenalPitch, target: { x: number; y: number }): PitchFlight {
  const v = pitch.mph * MPH_TO_MS
  const z0 = p.release.z
  const T = z0 / (0.955 * v)
  const hand = p.throwsRight ? 1 : -1
  const ax = (2 * hand * pitch.hbIn * 0.0254) / (T * T)
  const ay = -G + (2 * pitch.ivbIn * 0.0254) / (T * T)
  const az = (2 * z0 * (1 / 0.955 - 1)) / (T * T)
  const vx = (target.x - p.release.x - 0.5 * ax * T * T) / T
  const vy = (target.y - p.release.y - 0.5 * ay * T * T) / T
  return { p0: [p.release.x, p.release.y, z0], v0: [vx, vy, -v], a: [ax, ay, az], time: T, plate: target }
}

export function pitchPosition(f: PitchFlight, t: number): [number, number, number] {
  return [f.p0[0] + f.v0[0] * t + 0.5 * f.a[0] * t * t, f.p0[1] + f.v0[1] * t + 0.5 * f.a[1] * t * t, f.p0[2] + f.v0[2] * t + 0.5 * f.a[2] * t * t]
}

export type Outcome = 'out' | 'single' | 'double' | 'triple' | 'homeRun'

export interface BattedBall {
  exitVelocityMph: number
  launchAngleDeg: number
  sprayDeg: number
  distanceM: number
  outcome: Outcome
  hangTime: number
}

export interface PitchEvent {
  pitch: ArsenalPitch
  flight: PitchFlight
  inZone: boolean
  swung: boolean
  result: 'ball' | 'calledStrike' | 'whiff' | 'foul' | 'inPlay'
  balls: number
  strikes: number
  batted?: BattedBall
  probabilities: SwingProbabilities
}

export interface PlateAppearance {
  pitches: PitchEvent[]
  result: 'strikeout' | 'walk' | Outcome
}

export interface SwingProbabilities {
  swing: number
  whiff: number
  foul: number
  inPlay: number
  /** Outcome shares given the ball is put in play (only when asked for: it is the slow part). */
  outcomes?: Record<Outcome, number>
}

/** Carry distance of a batted ball with drag and backspin lift, calibrated so 105 mph at 28° lands near 400 ft. */
export function carry(evMph: number, laDeg: number): { distance: number; hangTime: number } {
  const dt = 0.01
  let x = 0
  let y = 0.9
  let vx = evMph * MPH_TO_MS * Math.cos((laDeg * Math.PI) / 180)
  let vy = evMph * MPH_TO_MS * Math.sin((laDeg * Math.PI) / 180)
  let t = 0
  const drag = 0.0058
  const lift = 0.0016
  while (y > 0 && t < 12) {
    const v = Math.hypot(vx, vy)
    const ax = -drag * v * vx - lift * v * vy
    const ay = -G - drag * v * vy + lift * v * vx
    vx += ax * dt
    vy += ay * dt
    x += vx * dt
    y += vy * dt
    t += dt
  }
  return { distance: Math.max(0, x), hangTime: t }
}

/** Samples of a batted ball's flight: [time, horizontal distance, height]. */
export function carryPath(evMph: number, laDeg: number, maxT = 6): [number, number, number][] {
  const dt = 0.02
  let x = 0
  let y = 0.9
  let vx = evMph * MPH_TO_MS * Math.cos((laDeg * Math.PI) / 180)
  let vy = evMph * MPH_TO_MS * Math.sin((laDeg * Math.PI) / 180)
  let t = 0
  const out: [number, number, number][] = [[0, 0, y]]
  let bounced = false
  while (t < maxT) {
    const v = Math.hypot(vx, vy)
    vx += (-0.0058 * v * vx - 0.0016 * v * vy) * dt
    vy += (-G - 0.0058 * v * vy + 0.0016 * v * vx) * dt
    x += vx * dt
    y += vy * dt
    t += dt
    if (y <= 0) {
      if (bounced || Math.abs(vy) < 2) {
        out.push([t, x, 0])
        break
      }
      // One bounce, then it rolls out of the picture.
      y = 0
      vy = -vy * 0.35
      vx *= 0.6
      bounced = true
    }
    out.push([t, x, y])
  }
  return out
}

export function fenceDistance(sprayDeg: number): number {
  const lines = 100.6
  const center = 121.9
  return lines + (center - lines) * Math.max(0, 1 - Math.abs(sprayDeg) / 45)
}

export function battedOutcome(evMph: number, laDeg: number, sprayDeg: number, speedZ: number, rng: () => number): BattedBall {
  const { distance, hangTime } = carry(evMph, laDeg)
  let outcome: Outcome = 'out'
  if (laDeg < 10) {
    const hit = Math.min(0.5, Math.max(0.08, 0.08 + (evMph - 70) * 0.01 + 0.02 * speedZ))
    if (rng() < hit) outcome = evMph > 105 && rng() < 0.12 ? 'double' : 'single'
  } else if (laDeg < 25) {
    const hit = Math.min(0.8, Math.max(0.25, 0.4 + (evMph - 80) * 0.01))
    if (rng() < hit) {
      const r = rng()
      outcome = evMph > 100 && r < 0.32 ? 'double' : r > 0.97 - 0.01 * speedZ ? 'triple' : 'single'
    }
  } else if (laDeg <= 50) {
    const fence = fenceDistance(sprayDeg)
    if (distance >= fence) outcome = 'homeRun'
    else if (distance > fence - 9) outcome = rng() < 0.45 ? (rng() < 0.08 + 0.03 * speedZ ? 'triple' : 'double') : 'out'
    else if (rng() < 0.08) outcome = 'single'
  } else if (rng() < 0.03) outcome = 'single'
  return { exitVelocityMph: evMph, launchAngleDeg: laDeg, sprayDeg, distanceM: distance, outcome, hangTime }
}

function inZone(b: Batter, x: number, y: number): boolean {
  return Math.abs(x) <= PLATE_HALF_WIDTH && y >= b.zone.bottom - 0.037 && y <= b.zone.top + 0.037
}

function choosePitch(p: Pitcher, rng: () => number): ArsenalPitch {
  const total = p.arsenal.reduce((s, x) => s + x.usage, 0)
  let r = rng() * total
  for (const pitch of p.arsenal) {
    r -= pitch.usage
    if (r <= 0) return pitch
  }
  return p.arsenal[0]!
}

function chooseTarget(p: Pitcher, b: Batter, balls: number, strikes: number, rng: () => number): { x: number; y: number } {
  const mid = (b.zone.bottom + b.zone.top) / 2
  const half = (b.zone.top - b.zone.bottom) / 2
  // Ahead in the count, pitchers expand; behind, they come into the zone.
  const attack = balls >= 3 ? 0.75 : strikes === 2 && balls < 2 ? 0.38 : 0.52
  const inside = rng() < attack
  const ix = inside ? (rng() * 2 - 1) * PLATE_HALF_WIDTH * 0.8 : (rng() < 0.5 ? -1 : 1) * (PLATE_HALF_WIDTH + 0.06 + rng() * 0.12)
  const iy = inside ? mid + (rng() * 2 - 1) * half * 0.8 : rng() < 0.6 ? b.zone.bottom - 0.08 - rng() * 0.15 : b.zone.top + 0.05 + rng() * 0.12
  const sd = Math.max(0.06, 0.15 * (1 - 0.15 * p.commandZ))
  return { x: ix + gaussian(rng) * sd, y: iy + gaussian(rng) * sd }
}

export function swingProbabilities(b: Batter, pitch: ArsenalPitch, plate: { x: number; y: number }, balls: number, strikes: number, withOutcomes = false): SwingProbabilities {
  const zoneIn = inZone(b, plate.x, plate.y)
  let swing = zoneIn ? 0.66 + 0.05 * b.contactZ : 0.28 - 0.05 * b.disciplineZ
  if (strikes === 2) swing += 0.12
  if (balls === 3 && strikes === 0) swing -= 0.3
  swing = clamp(swing, 0.03, 0.97)
  let contact = (zoneIn ? 0.82 : 0.6) + 0.04 * b.contactZ - 0.03 * pitch.stuffZ - 0.012 * (pitch.mph - 93)
  if (b.athlete.league !== 'MLB') contact *= 0.75
  contact = clamp(contact, 0.12, 0.95)
  const foulShare = zoneIn ? 0.38 : 0.55
  const whiff = swing * (1 - contact)
  const foul = swing * contact * foulShare
  const inPlay = swing * contact * (1 - foulShare)
  return { swing, whiff, foul, inPlay, ...(withOutcomes ? { outcomes: outcomeShares(b, pitch) } : {}) }
}

/** Outcome shares once the ball is in play, from a fixed-seed sample so the panel does not flicker. */
export function outcomeShares(b: Batter, pitch: ArsenalPitch, n = 300): Record<Outcome, number> {
  const outcomes: Record<Outcome, number> = { out: 0, single: 0, double: 0, triple: 0, homeRun: 0 }
  const rng = seededGrid()
  for (let i = 0; i < n; i++) outcomes[battedBall(b, pitch, rng).outcome] += 1 / n
  return outcomes
}

function seededGrid(): () => number {
  let s = 12345
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function battedBall(b: Batter, pitch: ArsenalPitch, rng: () => number): BattedBall {
  const plateMph = pitch.mph * 0.91
  const square = clamp(0.84 + 0.02 * b.contactZ + 0.1 * gaussian(rng), 0.45, 1)
  const ev = square * (0.2 * plateMph + 1.2 * b.batSpeedMph)
  const sinkerish = pitch.type === 'sinker' || pitch.type === 'splitter' ? -5 : 0
  const la = b.launchAngleDeg + sinkerish + 17 * gaussian(rng)
  const spray = clamp(20 * gaussian(rng) + (b.batsLeft ? -6 : 6), -44, 44)
  return battedOutcome(ev, la, spray, b.speedZ, rng)
}

export function simulatePlateAppearance(p: Pitcher, b: Batter, rng: () => number): PlateAppearance {
  let balls = 0
  let strikes = 0
  const pitches: PitchEvent[] = []
  for (let i = 0; i < 14; i++) {
    const pitch = choosePitch(p, rng)
    const target = chooseTarget(p, b, balls, strikes, rng)
    const flight = pitchFlight(p, pitch, target)
    const zoneIn = inZone(b, target.x, target.y)
    const probs = swingProbabilities(b, pitch, target, balls, strikes)
    const swung = rng() < probs.swing
    let result: PitchEvent['result']
    let batted: BattedBall | undefined
    if (!swung) result = zoneIn ? 'calledStrike' : 'ball'
    else {
      const r = rng() * probs.swing
      if (r < probs.whiff) result = 'whiff'
      else if (r < probs.whiff + probs.foul) result = 'foul'
      else {
        result = 'inPlay'
        batted = battedBall(b, pitch, rng)
      }
    }
    pitches.push({ pitch, flight, inZone: zoneIn, swung, result, balls, strikes, ...(batted ? { batted } : {}), probabilities: probs })
    if (result === 'ball') balls++
    else if (result === 'calledStrike' || result === 'whiff') strikes++
    else if (result === 'foul' && strikes < 2) strikes++
    if (result === 'inPlay') return { pitches, result: batted!.outcome }
    if (balls === 4) return { pitches, result: 'walk' }
    if (strikes === 3) return { pitches, result: 'strikeout' }
  }
  return { pitches, result: 'out' }
}

export interface DuelSummary {
  appearances: PlateAppearance[]
  line: { pa: number; h: number; hr: number; bb: number; k: number; avg: number; slg: number }
}

export function simulateDuel(p: Pitcher, b: Batter, rng: () => number, appearances = 5): DuelSummary {
  const list = Array.from({ length: appearances }, () => simulatePlateAppearance(p, b, rng))
  return { appearances: list, line: summarize(list) }
}

export function summarize(list: PlateAppearance[]): DuelSummary['line'] {
  const bases: Record<string, number> = { single: 1, double: 2, triple: 3, homeRun: 4 }
  const bb = list.filter((x) => x.result === 'walk').length
  const k = list.filter((x) => x.result === 'strikeout').length
  const hits = list.filter((x) => x.result in bases)
  const ab = list.length - bb
  const tb = hits.reduce((s, x) => s + (bases[x.result] ?? 0), 0)
  return { pa: list.length, h: hits.length, hr: list.filter((x) => x.result === 'homeRun').length, bb, k, avg: ab ? hits.length / ab : 0, slg: ab ? tb / ab : 0 }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
