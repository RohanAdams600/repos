import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { resolveMetric } from '../data/resolve'
import { gradesFor, type Grade } from '../grades/grades'
import { agilityValue, jumpValue } from './events'
import { gaussian } from './rng'
import { makeProbability, ZONES, type Zone } from './shooting'

/**
 * NBA same-league versus events: a dunk check, a dunk contest, isolation possessions and a
 * one-on-one shootout. The dunk check is a formula on profile figures, so it is at best
 * ESTIMATED; everything decided by random draws is SIMULATED. Rates and thresholds below are
 * model settings chosen for the demo, not league statistics.
 */

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
const round1 = (x: number): number => Math.round(x * 10) / 10

/**
 * Result keys for a list of athletes: the athlete id, with -2, -3 ... added when the same
 * athlete is entered twice, so a mirror match still gets two score lines.
 */
function uniqueKeys(athletes: readonly Athlete[]): string[] {
  const used = new Set<string>()
  return athletes.map((a) => {
    let key = a.id
    for (let n = 2; used.has(key); n++) key = `${a.id}-${n}`
    used.add(key)
    return key
  })
}

// Dunk check

/** Regulation rim height. */
export const RIM_HEIGHT_IN = 120
/** The hand and ball must get over the rim, not just to it. */
export const BALL_AND_HAND_IN = 6
/** Rule-of-thumb standing reach per inch of height, used when the profile has no reach. */
export const REACH_PER_HEIGHT = 1.33

export interface DunkCheck {
  standingReachIn: number
  /** Max (running) vertical used for the jump. */
  verticalIn: number
  maxReachIn: number
  /** How far the hand and ball clear the rim at the top of the jump; negative means short. */
  clearanceIn: number
  canDunk: boolean
  quality: Quality
  basis: string
}

/** Whether an athlete can dunk: standing reach plus max vertical against a 10 ft rim. */
export function canDunk(a: Athlete): DunkCheck {
  const reach = resolveMetric(a, 'standingReachIn')
  const height = resolveMetric(a, 'heightIn')
  let standingReachIn: number
  let reachQuality: Quality
  let reachBasis: string
  if (reach) {
    standingReachIn = reach.value
    reachQuality = reach.quality
    reachBasis = `Standing reach ${reach.value.toFixed(1)} in from the profile.`
  } else if (height) {
    standingReachIn = REACH_PER_HEIGHT * height.value
    reachQuality = weakest(height.quality, 'ESTIMATED')
    reachBasis = `No standing reach on the profile; estimated as ${REACH_PER_HEIGHT} × height (${height.value.toFixed(1)} in).`
  } else {
    standingReachIn = REACH_PER_HEIGHT * 74
    reachQuality = 'SIMULATED'
    reachBasis = `No reach or height on the profile; assumes a 74 in athlete (${REACH_PER_HEIGHT} × height).`
  }
  // Running vertical: dunks come off an approach. jumpValue falls back to labeled estimates.
  const vertical = jumpValue(a, 'maxVertical')
  const maxReachIn = standingReachIn + vertical.value
  const clearanceIn = maxReachIn - RIM_HEIGHT_IN - BALL_AND_HAND_IN
  return {
    standingReachIn,
    verticalIn: vertical.value,
    maxReachIn,
    clearanceIn,
    canDunk: clearanceIn >= 0,
    quality: weakest(reachQuality, vertical.quality, 'ESTIMATED'),
    basis: `${reachBasis} Max vertical ${vertical.value.toFixed(1)} in (${vertical.basis}) Clearance = reach + vertical − ${RIM_HEIGHT_IN} in rim − ${BALL_AND_HAND_IN} in for ball and hand.`,
  }
}

// Dunk contest

export type DunkId = 'one-hand' | 'two-hand' | 'reverse' | 'tomahawk' | 'windmill' | '360' | 'between-the-legs' | 'free-throw-line'

export interface Dunk {
  id: DunkId
  label: string
  /** Clearance over the rim the dunk needs, inches (model setting). */
  requiredClearanceIn: number
  /** 1 (easiest) to 10. */
  difficulty: number
}

/** Dunk catalogue, easiest first. Clearances are model settings: harder dunks need hang time. */
export const DUNKS: readonly Dunk[] = [
  { id: 'one-hand', label: 'One-hand', requiredClearanceIn: 0, difficulty: 1 },
  { id: 'two-hand', label: 'Two-hand', requiredClearanceIn: 2, difficulty: 2 },
  { id: 'reverse', label: 'Reverse', requiredClearanceIn: 4, difficulty: 4 },
  { id: 'tomahawk', label: 'Tomahawk', requiredClearanceIn: 5, difficulty: 5 },
  { id: 'windmill', label: 'Windmill', requiredClearanceIn: 8, difficulty: 7 },
  { id: '360', label: '360', requiredClearanceIn: 10, difficulty: 8 },
  { id: 'between-the-legs', label: 'Between the legs', requiredClearanceIn: 14, difficulty: 9 },
  { id: 'free-throw-line', label: 'Free-throw-line takeoff', requiredClearanceIn: 16, difficulty: 10 },
]

/** Spare clearance an athlete wants before he picks a dunk. */
export const COMFORT_MARGIN_IN = 2
export const MAX_ATTEMPTS = 3
export const JUDGES = 5
export const JUDGE_MIN = 6
export const JUDGE_MAX = 10

/** Chance to finish one attempt: falls as the spare clearance shrinks and as difficulty rises. */
export function dunkMakeProbability(marginIn: number, difficulty: number): number {
  if (marginIn < 0) return 0
  return clamp(0.95 - 0.7 * Math.exp(-marginIn / 3) - 0.015 * difficulty, 0.05, 0.95)
}

/**
 * The order an athlete works through dunks: the hardest he clears with the comfort margin
 * first, then the ones he only just clears (safest first). Empty when he cannot dunk.
 */
export function dunkPlan(check: DunkCheck): Dunk[] {
  const margin = (d: Dunk): number => check.clearanceIn - d.requiredClearanceIn
  const comfortable = DUNKS.filter((d) => margin(d) >= COMFORT_MARGIN_IN).sort((x, y) => y.difficulty - x.difficulty)
  const risky = DUNKS.filter((d) => margin(d) >= 0 && margin(d) < COMFORT_MARGIN_IN).sort((x, y) => margin(y) - margin(x))
  return [...comfortable, ...risky]
}

const judgeScore = (x: number): number => clamp(Math.round(x), JUDGE_MIN, JUDGE_MAX)

/**
 * Five judges' scores for a made dunk. Difficulty sets the mean; one shared execution draw
 * moves the whole panel and each judge adds a little of his own. Extra attempts and repeats
 * cost points. Integers from 6 to 10.
 */
export function judgeDunk(difficulty: number, attempts: number, repeat: boolean, rng: () => number): number[] {
  const mean = 6.6 + 0.33 * difficulty - 0.5 * Math.max(0, attempts - 1) - (repeat ? 0.6 : 0)
  const execution = 0.7 * gaussian(rng)
  return Array.from({ length: JUDGES }, () => judgeScore(mean + execution + 0.35 * gaussian(rng)))
}

export interface DunkRound {
  dunk: DunkId | 'layup'
  label: string
  difficulty: number
  /** Clearance left over the dunk's requirement (for a layup, the athlete's clearance). */
  marginIn: number
  /** Chance to finish each attempt. */
  p: number
  /** 1 to 3. */
  attempts: number
  made: boolean
  /** Five integers from 6 to 10. */
  judges: number[]
  total: number
  /** The athlete already did this dunk earlier in the contest. */
  repeat: boolean
}

export interface DunkContestEntry {
  /** Result key: the athlete id, suffixed when the same athlete is entered twice. */
  key: string
  athleteId: string
  name: string
  check: DunkCheck
  rounds: DunkRound[]
  total: number
  /** True when the athlete cannot dunk and every round was a layup. */
  layupsOnly: boolean
  note: string
}

export interface DunkContestResult {
  entries: DunkContestEntry[]
  /** Contest total by entry key. */
  totals: Record<string, number>
  /** Entry keys in finishing order. */
  standings: string[]
  /** Undefined only when no athletes were entered. */
  winner: string | undefined
  /** How a tie at the top was broken, when there was one. */
  tiebreak?: string
  quality: 'SIMULATED'
  basis: string
}

function attemptsUntilMade(p: number, rng: () => number): { attempts: number; made: boolean } {
  let attempts = 0
  let made = false
  while (attempts < MAX_ATTEMPTS && !made) {
    attempts++
    made = rng() < p
  }
  return { attempts, made }
}

function dunkRound(dunk: Dunk, check: DunkCheck, repeat: boolean, rng: () => number): DunkRound {
  const marginIn = check.clearanceIn - dunk.requiredClearanceIn
  const p = dunkMakeProbability(marginIn, dunk.difficulty)
  const { attempts, made } = attemptsUntilMade(p, rng)
  // Three misses still get scored, at the floor.
  const judges = made ? judgeDunk(dunk.difficulty, attempts, repeat, rng) : Array.from({ length: JUDGES }, () => JUDGE_MIN)
  return { dunk: dunk.id, label: dunk.label, difficulty: dunk.difficulty, marginIn, p, attempts, made, judges, total: judges.reduce((s, x) => s + x, 0), repeat }
}

function layupRound(check: DunkCheck, p: number, repeat: boolean, rng: () => number): DunkRound {
  const { attempts, made } = attemptsUntilMade(p, rng)
  // A layup is never a contest dunk: judges stay at the floor, with the odd 7 for style.
  const judges = Array.from({ length: JUDGES }, () => (made && rng() < 0.15 ? JUDGE_MIN + 1 : JUDGE_MIN))
  return { dunk: 'layup', label: 'Layup (cannot dunk)', difficulty: 0, marginIn: check.clearanceIn, p, attempts, made, judges, total: judges.reduce((s, x) => s + x, 0), repeat }
}

const bestRound = (e: DunkContestEntry): number => e.rounds.reduce((m, r) => Math.max(m, r.total), 0)

/**
 * Dunk contest: every athlete takes `dunksEach` rounds, round by round in entry order, up to
 * three attempts a dunk. Athletes who cannot dunk take layups, scored low. Ties go to the best
 * single round, then the bigger clearance, then entry order.
 */
export function dunkContest(athletes: readonly Athlete[], dunksEach: number, rng: () => number): DunkContestResult {
  const rounds = Math.max(0, Math.floor(dunksEach))
  const keys = uniqueKeys(athletes)
  const setups = athletes.map((a) => {
    const check = canDunk(a)
    // An uncontested layup is easier than a game finish at the rim.
    const layupP = clamp(makeProbability(a, 'rim').p + 0.3, 0.5, 0.97)
    return { check, plan: dunkPlan(check), layupP, rounds: [] as DunkRound[], done: new Set<string>() }
  })
  for (let r = 0; r < rounds; r++) {
    for (const s of setups) {
      const dunk = s.plan.length ? s.plan[r % s.plan.length] : undefined
      const id = dunk?.id ?? 'layup'
      s.rounds.push(dunk ? dunkRound(dunk, s.check, s.done.has(id), rng) : layupRound(s.check, s.layupP, s.done.has(id), rng))
      s.done.add(id)
    }
  }
  const entries: DunkContestEntry[] = athletes.map((a, i) => {
    const s = setups[i]!
    const layupsOnly = !s.check.canDunk
    const short = Math.abs(s.check.clearanceIn).toFixed(1)
    const first = s.plan[0]
    const note = layupsOnly
      ? `${a.name} cannot dunk: the hand and ball top out ${short} in short of what a dunk needs, so every round is a layup, scored low.`
      : first && s.check.clearanceIn - first.requiredClearanceIn < COMFORT_MARGIN_IN
        ? `${a.name} can only just dunk (${s.check.clearanceIn.toFixed(1)} in of clearance), so every dunk is a risk.`
        : `${a.name} clears the rim by ${s.check.clearanceIn.toFixed(1)} in and opens with the hardest dunk that leaves ${COMFORT_MARGIN_IN} in to spare.`
    return { key: keys[i]!, athleteId: a.id, name: a.name, check: s.check, rounds: s.rounds, total: s.rounds.reduce((t, x) => t + x.total, 0), layupsOnly, note }
  })
  const order = entries
    .map((_, i) => i)
    .sort((x, y) => {
      const ex = entries[x]!
      const ey = entries[y]!
      return ey.total - ex.total || bestRound(ey) - bestRound(ex) || ey.check.clearanceIn - ex.check.clearanceIn || x - y
    })
  const standings = order.map((i) => entries[i]!.key)
  const top = order[0] !== undefined ? entries[order[0]] : undefined
  const second = order[1] !== undefined ? entries[order[1]] : undefined
  let tiebreak: string | undefined
  if (top && second && top.total === second.total) {
    tiebreak =
      bestRound(top) !== bestRound(second)
        ? `Tied on ${top.total}; ${top.name} had the best single dunk (${bestRound(top)}).`
        : top.check.clearanceIn !== second.check.clearanceIn
          ? `Tied on ${top.total} with equal best dunks; ${top.name} has the bigger clearance.`
          : `Tied on every count; ${top.name} was entered first.`
  }
  return {
    entries,
    totals: Object.fromEntries(entries.map((e) => [e.key, e.total])),
    standings,
    winner: top?.key,
    ...(tiebreak ? { tiebreak } : {}),
    quality: 'SIMULATED',
    basis: `Clearance from standing reach plus max vertical over a ${RIM_HEIGHT_IN} in rim. Each athlete tries the hardest dunk they clear with ${COMFORT_MARGIN_IN} in to spare; the chance per attempt falls as the margin shrinks and difficulty rises, with up to ${MAX_ATTEMPTS} attempts. ${JUDGES} judges score ${JUDGE_MIN} to ${JUDGE_MAX} from difficulty and a random execution draw; a missed dunk scores the floor and a repeat loses points. Simulated.`,
  }
}

// Isolation possessions

export type IsoMove = 'crossover' | 'step-back' | 'drive' | 'pull-up'
export type IsoOutcome = 'make2' | 'make3' | 'miss' | 'turnover' | 'foul'

export interface IsoMoveSpec {
  label: string
  /** Where the move ends up; repeats weight the draw. */
  zones: Zone[]
  /** Base turnover and shooting-foul chances (model settings). */
  turnover: number
  foul: number
  /** Typical seconds of the shot clock the move uses. */
  clockS: number
  /** How much beating the defender matters for this move. */
  edgeWeight: number
}

export const ISO_MOVES: Record<IsoMove, IsoMoveSpec> = {
  crossover: { label: 'Crossover', zones: ['paint', 'midLeft', 'midRight', 'top'], turnover: 0.1, foul: 0.08, clockS: 8, edgeWeight: 1.2 },
  'step-back': { label: 'Step-back', zones: ['wingLeft', 'top', 'wingRight'], turnover: 0.06, foul: 0.04, clockS: 10, edgeWeight: 0.8 },
  drive: { label: 'Drive', zones: ['rim', 'rim', 'paint'], turnover: 0.11, foul: 0.15, clockS: 6, edgeWeight: 1 },
  'pull-up': { label: 'Pull-up', zones: ['midLeft', 'midCenter', 'midRight'], turnover: 0.05, foul: 0.05, clockS: 8, edgeWeight: 0.9 },
}

const MOVE_IDS = Object.keys(ISO_MOVES) as IsoMove[]

/** Basketball grade z for athletes from other sports, who have no NBA grades. */
export const NON_HOOPER_Z = -1.5

export interface IsoPossession {
  move: IsoMove
  zone: Zone
  result: IsoOutcome
  /** 0 to 3: field goal points, or free throws made after a foul. */
  points: number
  /** Seconds of the shot clock used. */
  clockS: number
  /** Field-goal chance of the shot the move created. */
  p: number
}

export interface IsoResult {
  possessions: IsoPossession[]
  points: number
  /** 0 when there were no possessions; never above 3. */
  pointsPerPossession: number
  /** Handler's advantage in z units: ball handling, speed and lane agility against the defender. */
  edge: number
  /** Defender's wingspan minus the handler's height, inches: how much of the shot he can contest. */
  contestIn: number
  /** How often the handler picks each move. */
  moveShare: Record<IsoMove, number>
  quality: 'SIMULATED'
  /** Weakest label among the figures the model read. */
  inputQuality: Quality
  basis: string
}

interface ZQ {
  z: number
  quality: Quality
}

function gradeZ(grades: readonly Grade[], id: string): ZQ {
  const g = grades.find((x) => x.id === id)
  return g ? { z: g.z, quality: g.quality } : { z: NON_HOOPER_Z, quality: 'SIMULATED' }
}

function wingspanOf(a: Athlete): { heightIn: number; wingspanIn: number; quality: Quality } {
  const h = resolveMetric(a, 'heightIn')
  const w = resolveMetric(a, 'wingspanIn')
  const heightIn = h?.value ?? 74
  const heightQuality: Quality = h?.quality ?? 'SIMULATED'
  if (w) return { heightIn, wingspanIn: w.value, quality: weakest(w.quality, heightQuality) }
  return { heightIn, wingspanIn: heightIn * 1.03, quality: weakest(heightQuality, 'ESTIMATED') }
}

function pickWeighted<T>(items: readonly (readonly [T, number])[], rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [item, w] of items) {
    r -= w
    if (r < 0) return item
  }
  return items[items.length - 1]![0]
}

/**
 * One-on-one isolation possessions. The base make chance is the handler's own shooting
 * (makeProbability); beating the defender off the dribble adds to it, and the defender's
 * length over the handler's height takes some away. Turnovers, fouls and the clock are drawn.
 */
export function isoPossessions(handler: Athlete, defender: Athlete, n: number, rng: () => number): IsoResult {
  const count = Math.max(0, Math.floor(n))
  const hg = gradesFor(handler)
  const dg = gradesFor(defender)
  const ballHandling = gradeZ(hg, 'ballHandling')
  const handlerSpeed = gradeZ(hg, 'speed')
  const threePoint = gradeZ(hg, 'threePoint')
  const midRange = gradeZ(hg, 'midRange')
  const finishing = gradeZ(hg, 'finishing')
  const perimeterDefense = gradeZ(dg, 'perimeterDefense')
  const defenderSpeed = gradeZ(dg, 'speed')
  const handlerLane = agilityValue(handler, 'laneAgility')
  const defenderLane = agilityValue(defender, 'laneAgility')
  // Positive when the handler is quicker through the lane drill (0.35 s is about one spread).
  const laneEdge = clamp((defenderLane.value - handlerLane.value) / 0.35, -3, 3)
  const edge = clamp(0.6 * (ballHandling.z - perimeterDefense.z) + 0.25 * (handlerSpeed.z - defenderSpeed.z) + 0.15 * laneEdge, -3, 3)

  const shooter = wingspanOf(handler)
  const reach = wingspanOf(defender)
  const contestIn = reach.wingspanIn - shooter.heightIn
  // About 6 in is an ordinary contest; each 4 in beyond it is one unit.
  const contest = clamp((contestIn - 6) / 4, -2, 3)

  const zones = [...new Set(MOVE_IDS.flatMap((m) => ISO_MOVES[m].zones))]
  const shotP = new Map(zones.map((z) => [z, makeProbability(handler, z)] as const))
  const ft = makeProbability(handler, 'freeThrow')
  const ftP = clamp(ft.p, 0.02, 0.98)

  const expZ = (z: number): number => Math.exp(0.4 * clamp(z, -3, 3))
  const weights: [IsoMove, number][] = [
    ['crossover', expZ(ballHandling.z)],
    ['step-back', expZ(threePoint.z)],
    ['drive', expZ(0.5 * handlerSpeed.z + 0.5 * finishing.z)],
    ['pull-up', expZ(midRange.z)],
  ]
  const weightTotal = weights.reduce((s, [, w]) => s + w, 0)
  const moveShare = Object.fromEntries(weights.map(([m, w]) => [m, w / weightTotal])) as Record<IsoMove, number>

  const possessions: IsoPossession[] = []
  for (let i = 0; i < count; i++) {
    const move = pickWeighted(weights, rng)
    const spec = ISO_MOVES[move]
    const zone = spec.zones[Math.floor(rng() * spec.zones.length)] ?? spec.zones[0]!
    const e = edge * spec.edgeWeight
    // Step-backs buy space, so length contests them less.
    const contestPenalty = 0.025 * contest * (move === 'step-back' ? 0.6 : 1)
    const p = clamp((shotP.get(zone)?.p ?? 0.3) + 0.035 * e - contestPenalty, 0.02, 0.95)
    const pTurnover = clamp(spec.turnover - 0.03 * e, 0.02, 0.35)
    const pFoul = clamp(spec.foul + 0.02 * e, 0.01, 0.3)
    const clockS = round1(clamp(spec.clockS - 0.8 * e + 2 * gaussian(rng), 2, 23.9))
    const three = ZONES[zone].three
    const r = rng()
    if (r < pTurnover) {
      possessions.push({ move, zone, result: 'turnover', points: 0, clockS, p })
    } else if (r < pTurnover + pFoul) {
      let made = 0
      for (let k = 0; k < (three ? 3 : 2); k++) if (rng() < ftP) made++
      possessions.push({ move, zone, result: 'foul', points: made, clockS, p })
    } else if (rng() < p) {
      possessions.push({ move, zone, result: three ? 'make3' : 'make2', points: three ? 3 : 2, clockS, p })
    } else {
      possessions.push({ move, zone, result: 'miss', points: 0, clockS, p })
    }
  }
  const points = possessions.reduce((s, x) => s + x.points, 0)
  const inputQuality = weakest(
    ballHandling.quality,
    handlerSpeed.quality,
    threePoint.quality,
    midRange.quality,
    finishing.quality,
    perimeterDefense.quality,
    defenderSpeed.quality,
    handlerLane.quality,
    defenderLane.quality,
    shooter.quality,
    reach.quality,
    ft.quality,
    ...[...shotP.values()].map((x) => x.quality),
  )
  return {
    possessions,
    points,
    pointsPerPossession: count ? points / count : 0,
    edge,
    contestIn,
    moveShare,
    quality: 'SIMULATED',
    inputQuality,
    basis: `Base chance from ${handler.name}'s shooting by zone, plus 3.5 points per unit of edge (ball handling and speed against ${defender.name}'s perimeter defense, speed and lane agility; athletes from other sports count ${NON_HOOPER_Z} on basketball grades), minus a contest penalty from the defender's wingspan over the handler's height. Moves, turnovers, fouls, free throws and makes are random draws.`,
  }
}

// One-on-one shootout

/** Sudden-death spot: the top of the key, behind the arc. */
export const TIEBREAK_ZONE: Zone = 'top'
/** Sudden death gives up and flips a coin after this many rounds (only for near-zero shooters). */
export const MAX_TIEBREAK_ROUNDS = 100

export interface ShootoutShot {
  /** Result key of the shooter (see `ids`). */
  shooter: string
  zone: Zone
  made: boolean
  p: number
  /** Value of the shot: 2 inside the arc, 3 outside, 0 for a miss. */
  points: number
}

export interface ShootoutResult {
  /** Result keys for a and b: their ids, the second suffixed -2 in a mirror match. */
  ids: [string, string]
  /** Regulation shots, alternating a then b. */
  shots: ShootoutShot[]
  /** Regulation points by key; sudden-death makes do not add to them. */
  scores: Record<string, number>
  winner: string
  /** Sudden-death shots from the top of the key, a then b each round; empty when regulation decided it. */
  tiebreakShots: ShootoutShot[]
  decidedBy: 'regulation' | 'sudden-death' | 'coin-flip'
  quality: 'SIMULATED'
  /** Weakest label among the shooting percentages the model read. */
  inputQuality: Quality
  basis: string
}

/**
 * Alternating shootout over a list of spots, `shotsPerSpot` each per spot. Two points inside the
 * arc, three outside. A tie goes to sudden death from the top of the key, so there is always a
 * winner.
 */
export function oneOnOneShootout(a: Athlete, b: Athlete, spots: readonly Zone[], shotsPerSpot: number, rng: () => number): ShootoutResult {
  const [ka, kb] = uniqueKeys([a, b]) as [string, string]
  const perSpot = Math.max(0, Math.floor(shotsPerSpot))
  const qualities: Quality[] = []
  const chance = (who: Athlete, zone: Zone): number => {
    const prob = makeProbability(who, zone)
    qualities.push(prob.quality)
    return clamp(prob.p, 0.02, 0.98)
  }
  const shoot = (key: string, zone: Zone, p: number): ShootoutShot => {
    const made = rng() < p
    return { shooter: key, zone, made, p, points: made ? (ZONES[zone].three ? 3 : 2) : 0 }
  }

  const shots: ShootoutShot[] = []
  for (const zone of spots) {
    const pa = chance(a, zone)
    const pb = chance(b, zone)
    for (let k = 0; k < perSpot; k++) {
      shots.push(shoot(ka, zone, pa))
      shots.push(shoot(kb, zone, pb))
    }
  }
  const scores: Record<string, number> = { [ka]: 0, [kb]: 0 }
  for (const s of shots) scores[s.shooter] = (scores[s.shooter] ?? 0) + s.points
  const sa = scores[ka] ?? 0
  const sb = scores[kb] ?? 0

  const tiebreakShots: ShootoutShot[] = []
  let winner: string
  let decidedBy: ShootoutResult['decidedBy'] = 'regulation'
  if (sa !== sb) {
    winner = sa > sb ? ka : kb
  } else {
    decidedBy = 'sudden-death'
    const pa = chance(a, TIEBREAK_ZONE)
    const pb = chance(b, TIEBREAK_ZONE)
    let decided: string | undefined
    for (let round = 0; round < MAX_TIEBREAK_ROUNDS && !decided; round++) {
      const x = shoot(ka, TIEBREAK_ZONE, pa)
      const y = shoot(kb, TIEBREAK_ZONE, pb)
      tiebreakShots.push(x, y)
      if (x.made !== y.made) decided = x.made ? ka : kb
    }
    if (!decided) {
      decidedBy = 'coin-flip'
      decided = rng() < 0.5 ? ka : kb
    }
    winner = decided
  }
  return {
    ids: [ka, kb],
    shots,
    scores,
    winner,
    tiebreakShots,
    decidedBy,
    quality: 'SIMULATED',
    inputQuality: qualities.length ? weakest(...qualities) : 'SIMULATED',
    basis: `Each shot is a random draw against the shooter's make chance for the spot (makeProbability). Two points inside the arc, three outside; a tie goes to sudden death from the top of the key${decidedBy === 'coin-flip' ? `, and a coin flip after ${MAX_TIEBREAK_ROUNDS} rounds` : ''}.`,
  }
}
