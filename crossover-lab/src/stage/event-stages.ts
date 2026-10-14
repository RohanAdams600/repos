import * as THREE from 'three'
import type { Athlete, League, MetricKey, Quality } from '../data/types'
import { weakest } from '../data/types'
import { formatMetric, IN_TO_M, LB_TO_KG, METRICS, MPH_TO_MS, YD_TO_M } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { makeBatter, makePitcher, simulateDuel, type Batter, type DuelSummary, type Pitcher } from '../sim/atbat'
import { agilityValue, jumpValue, LIFT_LABEL, liftValue, type EventValue, type LiftEvent } from '../sim/events'
import { armSpeed, CROW_HOP, FEET_TO_M, fieldingDrill, HOME_TO_FIRST_M, homeToFirst, outfieldThrow, RUNNER_TO_FIRST_S, TAG_UP_S, type FieldingDrill, type HomeToFirst, type OutfieldThrow } from '../sim/mlb-events'
import { dunkContest, isoPossessions, ISO_MOVES, oneOnOneShootout, type DunkContestResult, type IsoPossession, type IsoResult, type ShootoutResult } from '../sim/nba-events'
import { armStrength, changeOfDirection, getOff, passRush, qbAccuracy, routeRace, ROUTES, RUSH_WINDOW_S, tackleBreak, type ArmStrengthResult, type PassRushMove, type PassRushResult, type QbAccuracyResult, type RouteId, type RoutePoint, type RouteRun, type TackleBreakResult, type TackleOutcome, type TackleRep } from '../sim/nfl-events'
import { massKg, normalizeJump, normalizeSpeed, normalizeStrength } from '../sim/normalize'
import { createRng } from '../sim/rng'
import { makeProbability, ZONES, type Shot, type Zone } from '../sim/shooting'
import { runSprint, sprintProfile, stateAt, type SprintProfile, type SprintState } from '../sim/sprint'
import { BALLS, flight, throwVelocity } from '../sim/throwing'
import { textPlane, type EnvKind, type EnvOptions } from '../three/env'
import { CONTACT_AT, crouchOffset, cut, deg, emptyPose, idle, jump, mirror, RELEASE_AT, run, shoot, SHOT_RELEASE_AT, smooth, sprintStance, swing, throwMotion, type Carry, type Pose } from '../three/motions'
import { makeBaseball, makeBasketball } from '../three/props'
import { Rig, type Dimensions, type JointName } from '../three/rig'
import { AtBatStage, ShootingStage } from './duel-stages'
import { HeldProp } from './props-manager'
import { TimelineStage } from './timeline'
import { AgilityStage, JumpStage, LiftStage, SprintStage } from './versus-stages'

/**
 * Same-league versus events: a registry per league, default picks, seed handling, one runner
 * that calls the existing sim modules and turns their results into a labelled score card, and the
 * 3D stages that replay each result. The pure part (everything above the stages) has no DOM or
 * WebGL needs, so it is unit-tested. Outcomes are always SIMULATED: these athletes never met.
 */

// ---------------------------------------------------------------------------------------------
// Registry

export type EventId =
  | 'forty'
  | 'route-race'
  | 'tackle-break'
  | 'qb-throw'
  | 'pass-rush'
  | 'shootout'
  | 'vertical-agility'
  | 'dunk-contest'
  | 'iso'
  | 'at-bat'
  | 'home-to-first'
  | 'arm-throw'
  | 'fielding'
  | 'lift-off'

/** Races, jumps, lifts and arm events can be opened to every league; the rest are sport skills. */
export type EventCategory = 'race' | 'jump' | 'lift' | 'arm' | 'skill'

/** split: one lane each on a shared field. shared: both on one spot, where the event has contact. */
export type StageLayout = 'split' | 'shared'

export type VerticalTest = 'maxVertical' | 'standingVertical' | 'laneAgility'

export interface EventDef {
  id: EventId
  label: string
  /** One line on what happens. */
  blurb: string
  category: EventCategory
  /** Role of each pick when they do different jobs (carrier and tackler); absent when symmetric. */
  roles?: [string, string]
  /** Profile figures the sims read for each pick, most important first. */
  inputs: [MetricKey[], MetricKey[]]
  /** Lower is a better fit for the role. Only used to choose the default picks. */
  fit?: (a: Athlete, role: 0 | 1) => number
  /** Layouts the stage supports; the first is the default. */
  layouts: StageLayout[]
  env: EnvKind
  /** Whether random draws decide the result (so the seed matters). */
  random: boolean
}

const SPRINT_KEYS: MetricKey[] = ['fortyS', 'tenSplitS', 'topSpeedMph', 'sprintSpeedFtS', 'threeQuarterSprintS', 'repeatSprintDropPct']
const STRENGTH_KEYS: MetricKey[] = ['bench1RmLb', 'squat1RmLb', 'deadlift1RmLb', 'clean1RmLb']

const both = (keys: MetricKey[]): [MetricKey[], MetricKey[]] => [keys, keys]

/** Fit by position group: the index in the role's preference list, else last. */
function byGroup(first: string[], second: string[] = first): (a: Athlete, role: 0 | 1) => number {
  return (a, role) => {
    const list = role === 0 ? first : second
    const i = list.indexOf(a.positionGroup)
    return i < 0 ? list.length : i
  }
}

export const EVENTS: Record<EventId, EventDef> = {
  forty: {
    id: 'forty',
    label: '40-yard dash',
    blurb: 'Two lanes, one 40: top speed solved from each athlete’s own sprint figure.',
    category: 'race',
    inputs: both([...SPRINT_KEYS, 'heightIn']),
    layouts: ['split'],
    env: 'field',
    random: false,
  },
  'route-race': {
    id: 'route-race',
    label: 'Route race',
    blurb: 'Both receivers run the same route side by side; cuts cost speed and a plant.',
    category: 'race',
    inputs: both(['fortyS', 'shuttleS', 'threeConeS', 'tenSplitS', 'topSpeedMph', 'sprintSpeedFtS', 'threeQuarterSprintS', 'heightIn']),
    fit: byGroup(['WR', 'TE', 'RB']),
    layouts: ['split'],
    env: 'field',
    random: true,
  },
  'tackle-break': {
    id: 'tackle-break',
    label: 'Tackle break',
    blurb: 'Carrier against tackler in space, rep after rep: break it, make him miss, or go down.',
    category: 'skill',
    roles: ['Ball carrier', 'Tackler'],
    inputs: [
      ['weightLb', 'fortyS', 'yardsAfterContactPerCarry', 'rushYardsPerCarry', 'shuttleS', 'topSpeedMph', 'bench1RmLb', 'squat1RmLb', 'deadlift1RmLb'],
      ['weightLb', 'fortyS', 'shuttleS', 'threeConeS', 'topSpeedMph', 'bench1RmLb', 'squat1RmLb', 'deadlift1RmLb'],
    ],
    fit: byGroup(['RB', 'WR', 'TE'], ['LB', 'DB', 'DL']),
    layouts: ['split', 'shared'],
    env: 'field',
    random: true,
  },
  'qb-throw': {
    id: 'qb-throw',
    label: 'QB accuracy and arm',
    blurb: 'Throws at targets from 10 to 40 yards, then one throw for distance.',
    category: 'arm',
    inputs: both(['throwVelocityMph', 'walksPer9', 'assistsPerGame']),
    fit: byGroup(['QB']),
    layouts: ['split'],
    env: 'field',
    random: true,
  },
  'pass-rush': {
    id: 'pass-rush',
    label: 'Pass rush',
    blurb: 'Rusher against blocker, one rep after another: win inside three seconds or the ball is out.',
    category: 'skill',
    roles: ['Pass rusher', 'Blocker'],
    inputs: [
      ['tenSplitS', 'fortyS', 'weightLb', 'shuttleS', 'threeConeS', ...STRENGTH_KEYS.slice(0, 3)],
      ['weightLb', 'shuttleS', 'threeConeS', ...STRENGTH_KEYS.slice(0, 3), 'fortyS'],
    ],
    fit: byGroup(['DL', 'LB'], ['OL', 'TE', 'RB']),
    layouts: ['split', 'shared'],
    env: 'field',
    random: true,
  },
  shootout: {
    id: 'shootout',
    label: '1-on-1 shootout',
    blurb: 'Alternating shots from five spots, twos and threes; a tie goes to sudden death.',
    category: 'skill',
    inputs: both(['threePointPct', 'midRangePct', 'rimFinishPct', 'freeThrowPct', 'maxVerticalIn']),
    layouts: ['shared'],
    env: 'court',
    random: true,
  },
  'vertical-agility': {
    id: 'vertical-agility',
    label: 'Vertical and agility',
    blurb: 'Running vertical, standing vertical and the lane agility drill, test by test.',
    category: 'jump',
    inputs: both(['maxVerticalIn', 'standingVerticalIn', 'laneAgilityS', 'weightLb', 'shuttleS', 'threeConeS']),
    layouts: ['split'],
    env: 'court',
    random: false,
  },
  'dunk-contest': {
    id: 'dunk-contest',
    label: 'Dunk contest',
    blurb: 'Three rounds, up to three attempts a dunk, five judges scoring 6 to 10.',
    category: 'skill',
    inputs: both(['standingReachIn', 'maxVerticalIn', 'standingVerticalIn', 'heightIn', 'rimFinishPct']),
    layouts: ['shared'],
    env: 'court',
    random: true,
  },
  iso: {
    id: 'iso',
    label: 'Iso: handler vs defender',
    blurb: 'Isolation possessions both ways: each athlete attacks the other off the dribble.',
    category: 'skill',
    inputs: both(['threePointPct', 'midRangePct', 'rimFinishPct', 'freeThrowPct', 'laneAgilityS', 'wingspanIn', 'heightIn', 'stealsPerGame', 'assistsPerGame', 'turnoversPerGame', 'threeQuarterSprintS']),
    layouts: ['split', 'shared'],
    env: 'court',
    random: true,
  },
  'at-bat': {
    id: 'at-bat',
    label: 'Batter vs pitcher',
    blurb: 'Five plate appearances, pitch by pitch, with ball flight and batted balls.',
    category: 'skill',
    roles: ['Pitcher', 'Batter'],
    inputs: [
      ['fastballVelocityMph', 'fastballMaxMph', 'walksPer9', 'spinRateRpm', 'throwVelocityMph'],
      ['batSpeedMph', 'avgLaunchAngleDeg', 'battingAvg', 'strikeoutPct', 'onBasePct', 'sluggingPct', 'maxExitVelocityMph', 'homeRuns', 'sprintSpeedFtS'],
    ],
    // Pitchers with an arsenal on file first: the duel model needs one to pitch like a pitcher.
    fit: (a, role) => (role === 0 ? (a.pitches?.length ? 0 : a.positionGroup === 'P' ? 1 : 2) : a.positionGroup === 'H' || a.positionGroup === 'TWP' ? 0 : 1),
    layouts: ['shared'],
    env: 'diamond',
    random: true,
  },
  'home-to-first': {
    id: 'home-to-first',
    label: 'Home to first',
    blurb: 'Swing, drop the bat, 90 feet to the bag: lefties start a step closer.',
    category: 'race',
    inputs: both(['homeToFirstS', 'sprintSpeedFtS', 'fortyS', 'topSpeedMph', 'threeQuarterSprintS', 'heightIn']),
    fit: byGroup(['H', 'TWP']),
    layouts: ['split'],
    env: 'diamond',
    random: false,
  },
  'arm-throw': {
    id: 'arm-throw',
    label: 'Outfield arm',
    blurb: 'Catch a fly and throw home against a runner tagging from third.',
    category: 'arm',
    inputs: both(['armStrengthMph', 'throwVelocityMph', 'shuttleS', 'threeConeS']),
    fit: byGroup(['H', 'TWP']),
    layouts: ['split'],
    env: 'diamond',
    random: true,
  },
  fielding: {
    id: 'fielding',
    label: 'Fielding drill',
    blurb: 'Six fungo chances, the same batted balls for both: grounders, liners and flies.',
    category: 'skill',
    inputs: both(['sprintSpeedFtS', 'fortyS', 'topSpeedMph', 'shuttleS', 'threeConeS', 'armStrengthMph', 'throwVelocityMph']),
    fit: byGroup(['H', 'TWP']),
    layouts: ['split'],
    env: 'diamond',
    random: true,
  },
  'lift-off': {
    id: 'lift-off',
    label: 'Lift-off',
    blurb: 'One-rep max side by side, with the lift scaled to a 200 lb athlete.',
    category: 'lift',
    inputs: both([...STRENGTH_KEYS, 'weightLb']),
    layouts: ['split'],
    env: 'gym',
    random: false,
  },
}

export const LEAGUES: readonly League[] = ['NFL', 'NBA', 'MLB']

/** Events per league, in the order the page lists them. */
export const LEAGUE_EVENTS: Record<League, EventId[]> = {
  NFL: ['forty', 'route-race', 'tackle-break', 'qb-throw', 'pass-rush', 'lift-off'],
  NBA: ['shootout', 'vertical-agility', 'dunk-contest', 'iso', 'lift-off'],
  MLB: ['at-bat', 'home-to-first', 'arm-throw', 'fielding', 'lift-off'],
}

export const CROSS_LEAGUE_CATEGORIES: readonly EventCategory[] = ['race', 'jump', 'lift', 'arm']

export function isLeague(x: unknown): x is League {
  return x === 'NFL' || x === 'NBA' || x === 'MLB'
}

export function isEventId(x: unknown): x is EventId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(EVENTS, x)
}

export function eventsFor(league: League): EventDef[] {
  return LEAGUE_EVENTS[league].map((id) => EVENTS[id])
}

/** Cross-league mode is only for races, lifts, jumps and arm events: sport skills stay in their sport. */
export function allowsCrossLeague(id: EventId): boolean {
  return CROSS_LEAGUE_CATEGORIES.includes(EVENTS[id].category)
}

/** Athletes who qualify: the league's own, or everyone when cross-league mode applies to the event. */
export function eventPool(id: EventId, league: League, cross: boolean, roster: readonly Athlete[]): Athlete[] {
  const open = cross && allowsCrossLeague(id)
  return roster.filter((a) => open || a.league === league)
}

const QUALITY_POINTS: Record<Quality, number> = { VERIFIED: 3, ESTIMATED: 2, SIMULATED: 1 }

export interface Coverage {
  /** Inputs on file. */
  have: number
  of: number
  /** Ranking score: earlier (more important) inputs and better labels count more. */
  score: number
}

export function coverage(a: Athlete, keys: readonly MetricKey[]): Coverage {
  let have = 0
  let score = 0
  keys.forEach((k, i) => {
    const m = resolveMetric(a, k)
    if (!m) return
    have++
    score += QUALITY_POINTS[m.quality] * (keys.length - i)
  })
  return { have, of: keys.length, score }
}

/** The two athletes with the most data for the event, best role fit first. Undefined below two. */
export function defaultPicks(id: EventId, pool: readonly Athlete[]): [Athlete, Athlete] | undefined {
  if (pool.length < 2) return undefined
  const def = EVENTS[id]
  const best = (role: 0 | 1, skip?: string): Athlete =>
    pool
      .map((a, i) => ({ a, i, fit: def.fit?.(a, role) ?? 0, score: coverage(a, def.inputs[role]).score }))
      .filter((x) => x.a.id !== skip)
      .sort((x, y) => x.fit - y.fit || y.score - x.score || x.i - y.i)[0]!.a
  const first = best(0)
  return [first, best(1, first.id)]
}

/**
 * Picks for the event: the requested ids where they qualify and differ, the default picks for
 * any slot that does not. `changed` says whether a requested id had to be replaced.
 */
export function resolvePicks(id: EventId, pool: readonly Athlete[], ids: readonly string[] = []): { picks: [Athlete, Athlete]; changed: boolean } | undefined {
  const defaults = defaultPicks(id, pool)
  if (!defaults) return undefined
  const find = (x: string | undefined) => (x ? pool.find((a) => a.id === x) : undefined)
  let a = find(ids[0])
  let b = find(ids[1])
  if (a && b && a.id === b.id) b = undefined
  const changed = ids.length > 0 && (!a || (ids.length > 1 && !b))
  if (!a) a = defaults[0].id !== b?.id ? defaults[0] : defaults[1]
  if (!b) b = defaults[1].id !== a.id ? defaults[1] : (pool.find((x) => x.id !== a!.id) ?? defaults[0])
  return { picks: [a, b], changed }
}

// ---------------------------------------------------------------------------------------------
// Seeds and links

export const DEFAULT_SEED = 20261014
export const MAX_SEED = 0xffffffff

/** A seed typed by a person: 0 to 4294967295, with spaces, commas or underscores as separators. */
export function parseSeed(text: string): number | undefined {
  const digits = text.trim().replace(/[\s,_]/g, '')
  if (!/^\d{1,10}$/.test(digits)) return undefined
  const n = Number(digits)
  return n <= MAX_SEED ? n : undefined
}

export const EVENTS_HASH = '#events'

export interface EventsRoute {
  league: League
  eventId?: EventId
  ids?: string[]
  seed?: number
}

/** #events.NBA.dunk-contest.id-a,id-b.20261014 (later parts optional). */
export function eventsHash(route: EventsRoute): string {
  const parts = [EVENTS_HASH, route.league]
  if (route.eventId) {
    parts.push(route.eventId)
    if (route.ids?.length) {
      parts.push(route.ids.join(','))
      if (route.seed !== undefined) parts.push(String(route.seed))
    }
  }
  return parts.join('.')
}

export function parseEventsHash(hash: string): EventsRoute | undefined {
  if (hash !== EVENTS_HASH && !hash.startsWith(`${EVENTS_HASH}.`)) return undefined
  const [, league, id, ids, seed] = hash.split('.')
  const lg = league?.toUpperCase()
  const out: EventsRoute = { league: isLeague(lg) ? lg : 'NFL' }
  if (isEventId(id) && (LEAGUE_EVENTS[out.league].includes(id) || allowsCrossLeague(id))) out.eventId = id
  if (out.eventId && ids) {
    const list = ids.split(',').map((x) => decodeURIComponent(x)).filter(Boolean).slice(0, 2)
    if (list.length) out.ids = list
    const s = seed === undefined ? undefined : parseSeed(seed)
    if (s !== undefined) out.seed = s
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Score cards

export interface CardCell {
  text: string
  /** Absent for cells with no figure in them (a dash, a name). */
  quality?: Quality
}

export interface CardLine {
  label: string
  cells: [CardCell, CardCell]
  /** Which side the line favours, when it has a better side. */
  better?: 0 | 1
}

export interface WhyInput {
  label: string
  text: string
  /** Absent when the figure is not on file. */
  quality?: Quality
  sourceId?: string
  asOf?: string
  note?: string
}

export interface WhyBlock {
  athlete: Athlete
  role?: string
  /** The profile figures the sims read, each with its label and source. */
  inputs: WhyInput[]
  /** What the model made of them: derived figures with their labels. */
  model: CardCell[]
}

export interface ScoreCard {
  headline: string
  /** Index of the winning pick, or null for a tie. */
  winner: 0 | 1 | null
  score: [string, string]
  /** What the two big numbers count. */
  scoreLabel: string
  quality: 'SIMULATED'
  /** One line: what decided it. */
  basis: string
  lines: CardLine[]
  why: [WhyBlock, WhyBlock]
  notes: string[]
  /** The sim modules' own full basis text. */
  detail: string[]
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv)$/i

/** Last name for headlines, without Jr./Sr./III. */
export function shortName(a: Athlete): string {
  const parts = a.name.trim().split(/\s+/)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1]!)) parts.pop()
  return parts[parts.length - 1] ?? a.name
}

/** Short names for a pair, falling back to full names when they collide (Styles and Styles Jr.). */
export function pairNames(a: Athlete, b: Athlete): [string, string] {
  const x = shortName(a)
  const y = shortName(b)
  return x === y ? [a.name, b.name] : [x, y]
}

const cell = (text: string, quality?: Quality): CardCell => (quality ? { text, quality } : { text })
const DASH: CardCell = { text: '–' }
const sec = (x: number): string => `${x.toFixed(2)} s`
const pct = (x: number): string => `${Math.round(x * 100)}%`
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** Index of the better value, or undefined when they are level within `eps`. */
export function better(x: number, y: number, higherIsBetter: boolean, eps = 1e-9): 0 | 1 | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - y) <= eps) return undefined
  return (x > y) === higherIsBetter ? 0 : 1
}

function line(label: string, a: CardCell, b: CardCell, best?: 0 | 1): CardLine {
  return best === undefined ? { label, cells: [a, b] } : { label, cells: [a, b], better: best }
}

function whyFor(a: Athlete, keys: readonly MetricKey[], model: CardCell[], role?: string): WhyBlock {
  const inputs = keys.map((k): WhyInput => {
    const m = resolveMetric(a, k)
    if (!m) return { label: METRICS[k].label, text: 'Not on file' }
    return { label: METRICS[k].label, text: formatMetric(k, m.value), quality: m.quality, ...(m.sourceId ? { sourceId: m.sourceId } : {}), ...(m.asOf ? { asOf: m.asOf } : {}), ...(m.note ? { note: m.note } : {}) }
  })
  return role ? { athlete: a, role, inputs, model } : { athlete: a, inputs, model }
}

function weightCell(a: Athlete): CardCell {
  const w = resolveMetric(a, 'weightLb')
  return w ? cell(`${w.value.toFixed(0)} lb`, w.quality) : cell(`${(massKg(a) / LB_TO_KG).toFixed(0)} lb (default)`, 'SIMULATED')
}

const CROSS_NOTE = 'Cross-league: each athlete is measured in his own sport. Conversions and size adjustments are estimates, and the outcome is simulated.'

// ---------------------------------------------------------------------------------------------
// Running an event

export const FORTY_M = 40 * YD_TO_M
export const TACKLE_REPS = 7
export const RUSH_REPS = 7
export const QB_DEPTHS_YD = [10, 20, 30, 40]
export const QB_THROWS_PER_DEPTH = 2
export const SHOOTOUT_SPOTS: Zone[] = ['rim', 'midLeft', 'top', 'wingRight', 'cornerLeft']
export const SHOTS_PER_SPOT = 2
export const DUNK_ROUNDS = 3
export const ISO_POSSESSIONS = 5
export const AT_BAT_PA = 5
export const OUTFIELD_THROWS = 3
export const OUTFIELD_DISTANCES_FT = [200, 250, 300]
export const FIELDING_CHANCES = 6

export interface EventOptions {
  route?: RouteId
  lift?: LiftEvent
  /** Which of the three tests the stage shows (the card always has all three). */
  test?: VerticalTest
  distanceFt?: number
}

export interface SprintRow {
  profile: SprintProfile
  time: number
  samples: SprintState[]
}

export interface VerticalRow {
  maxVertical: EventValue
  standingVertical: EventValue
  laneAgility: EventValue
}

export type EventResult =
  | { kind: 'forty'; rows: [SprintRow, SprintRow] }
  | { kind: 'route-race'; route: RouteId; runs: [RouteRun, RouteRun] }
  | { kind: 'tackle-break'; result: TackleBreakResult; rep: number }
  | { kind: 'qb-throw'; accuracy: [QbAccuracyResult, QbAccuracyResult]; arm: [ArmStrengthResult, ArmStrengthResult] }
  | { kind: 'pass-rush'; result: PassRushResult }
  | { kind: 'shootout'; result: ShootoutResult }
  | { kind: 'vertical-agility'; rows: [VerticalRow, VerticalRow]; test: VerticalTest }
  | { kind: 'dunk-contest'; result: DunkContestResult }
  | { kind: 'iso'; halves: [IsoResult, IsoResult] }
  | { kind: 'at-bat'; pitcher: Pitcher; batter: Batter; duel: DuelSummary }
  | { kind: 'home-to-first'; runs: [HomeToFirst, HomeToFirst]; sprints: [SprintRow, SprintRow] }
  | { kind: 'arm-throw'; throws: [OutfieldThrow, OutfieldThrow] }
  | { kind: 'fielding'; drills: [FieldingDrill, FieldingDrill] }
  | { kind: 'lift-off'; lift: LiftEvent; values: [EventValue, EventValue] }

export interface EventRun {
  id: EventId
  athletes: [Athlete, Athlete]
  seed: number
  cross: boolean
  result: EventResult
  card: ScoreCard
}

/**
 * Run an event between two athletes. Same inputs and seed, same result. `cross` adds the
 * size-adjusted figures and the cross-league note (it only applies to events that allow it).
 */
export function runEvent(id: EventId, athletes: readonly [Athlete, Athlete], seed: number, opts: EventOptions = {}, cross = false): EventRun {
  const pair: [Athlete, Athlete] = [athletes[0], athletes[1]]
  const crossOn = cross && allowsCrossLeague(id) && pair[0].league !== pair[1].league
  const s = seed >>> 0
  const built = RUNNERS[id](pair, s, opts, crossOn)
  if (crossOn) built.card.notes.unshift(CROSS_NOTE)
  if (!EVENTS[id].random) built.card.notes.push('No random draws in this event, so the seed does not change it.')
  return { id, athletes: pair, seed: s, cross: crossOn, result: built.result, card: built.card }
}

type Runner = (p: [Athlete, Athlete], seed: number, opts: EventOptions, cross: boolean) => { result: EventResult; card: ScoreCard }

/** Time at which a sampled run reaches `distance` metres (linear between samples). */
export function timeToDistance(samples: readonly SprintState[], distance: number): number {
  const i = samples.findIndex((x) => x.distance >= distance)
  if (i <= 0) return i === 0 ? 0 : samples[samples.length - 1]?.t ?? 0
  const a = samples[i - 1]!
  const b = samples[i]!
  return a.t + ((distance - a.distance) / (b.distance - a.distance || 1)) * (b.t - a.t)
}

function sprintRow(a: Athlete, distance: number): SprintRow {
  const profile = sprintProfile(a)
  const r = runSprint(profile, distance)
  return { profile, time: r.time, samples: r.samples }
}

function speedLine(p: [Athlete, Athlete], profiles: [SprintProfile, SprintProfile], cross: boolean): CardLine[] {
  const mph = profiles.map((x) => x.vmax / MPH_TO_MS) as [number, number]
  const out = [line('Top speed (sprint model)', cell(`${mph[0].toFixed(1)} mph`, profiles[0].quality), cell(`${mph[1].toFixed(1)} mph`, profiles[1].quality), better(mph[0], mph[1], true, 0.05))]
  if (cross) {
    const n = p.map((a, i) => normalizeSpeed(a, mph[i]!, profiles[i]!.quality))
    out.push(line('Top speed, size-adjusted', n[0] ? cell(`${n[0].value.toFixed(1)} mph`, n[0].quality) : DASH, n[1] ? cell(`${n[1].value.toFixed(1)} mph`, n[1].quality) : DASH, n[0] && n[1] ? better(n[0].value, n[1].value, true, 0.05) : undefined))
  }
  return out
}

function raceHeadline(names: [string, string], times: [number, number], what: string, eps = 0.005): { winner: 0 | 1 | null; headline: string } {
  const w = better(times[0], times[1], false, eps)
  if (w === undefined) return { winner: null, headline: `${names[0]} and ${names[1]} dead level in the ${what}` }
  return { winner: w, headline: `${names[w]} wins the ${what} by ${Math.abs(times[0] - times[1]).toFixed(2)} s` }
}

const runForty: Runner = (p, _seed, _opts, cross) => {
  const rows = p.map((a) => sprintRow(a, FORTY_M)) as [SprintRow, SprintRow]
  const names = pairNames(...p)
  const times = rows.map((r) => r.time) as [number, number]
  const head = raceHeadline(names, times, '40')
  const q = rows.map((r) => weakest(r.profile.quality, 'ESTIMATED')) as [Quality, Quality]
  const lines: CardLine[] = [line('40-yard time', cell(sec(times[0]), q[0]), cell(sec(times[1]), q[1]), better(times[0], times[1], false, 0.005))]
  const tens = rows.map((r) => timeToDistance(r.samples, 10 * YD_TO_M)) as [number, number]
  lines.push(line('10-yard split (model)', cell(sec(tens[0]), q[0]), cell(sec(tens[1]), q[1]), better(tens[0], tens[1], false, 0.005)))
  lines.push(...speedLine(p, [rows[0].profile, rows[1].profile], cross))
  if (head.winner !== null) {
    const loser = rows[1 - head.winner]!
    const behind = (FORTY_M - stateAt(loser.samples, times[head.winner]).distance) / YD_TO_M
    lines.push(line('Gap at the line', head.winner === 0 ? DASH : cell(`${behind.toFixed(1)} yd back`, 'SIMULATED'), head.winner === 1 ? DASH : cell(`${behind.toFixed(1)} yd back`, 'SIMULATED')))
  }
  return {
    result: { kind: 'forty', rows },
    card: {
      ...head,
      score: [sec(times[0]), sec(times[1])],
      scoreLabel: '40-yard time',
      quality: 'SIMULATED',
      basis: 'Sprint model: top speed solved from each athlete’s own sprint figure, run over 40 yards side by side.',
      lines,
      why: [whyFor(p[0], EVENTS.forty.inputs[0], [cell(rows[0].profile.basis, rows[0].profile.quality)]), whyFor(p[1], EVENTS.forty.inputs[1], [cell(rows[1].profile.basis, rows[1].profile.quality)])],
      notes: [],
      detail: ['v(t) = top speed × (1 − e^(−t/0.7)) with a small fatigue term after 6 s, integrated to 40 yards.'],
    },
  }
}

const runRouteRace: Runner = (p, seed, opts) => {
  const route = opts.route ?? 'out'
  // The same seed for both: identical jitter draws, so only the athletes differ.
  const runs = p.map((a) => routeRace(a, route, createRng(seed))) as [RouteRun, RouteRun]
  const names = pairNames(...p)
  const times = runs.map((r) => r.time) as [number, number]
  const label = ROUTES[route].label.toLowerCase()
  const head = raceHeadline(names, times, `${label} route`)
  const cod = p.map((a) => changeOfDirection(a))
  const lines: CardLine[] = [line('Route time', cell(sec(times[0]), 'SIMULATED'), cell(sec(times[1]), 'SIMULATED'), better(times[0], times[1], false, 0.005))]
  const top = runs.map((r) => r.topSpeedMph)
  lines.push(line('Top speed on the route', cell(`${top[0]!.toFixed(1)} mph`, weakest(runs[0].inputQuality, 'ESTIMATED')), cell(`${top[1]!.toFixed(1)} mph`, weakest(runs[1].inputQuality, 'ESTIMATED')), better(top[0]!, top[1]!, true, 0.05)))
  if (runs[0].breaks.length) {
    const lost = runs.map((r) => r.breaks.reduce((s, b) => s + b.lossS, 0))
    const kept = runs.map((r) => r.breaks.reduce((s, b) => s + (b.speedInMs > 0 ? b.speedOutMs / b.speedInMs : 1), 0) / r.breaks.length)
    lines.push(line(runs[0].breaks.length > 1 ? 'Time lost at the breaks' : 'Time lost at the break', cell(sec(lost[0]!), 'SIMULATED'), cell(sec(lost[1]!), 'SIMULATED'), better(lost[0]!, lost[1]!, false, 0.005)))
    lines.push(line('Speed kept through the cut', cell(pct(kept[0]!), 'ESTIMATED'), cell(pct(kept[1]!), 'ESTIMATED'), better(kept[0]!, kept[1]!, true, 0.005)))
  }
  lines.push(line('Change of direction (shuttle equivalent)', cell(sec(cod[0]!.shuttleS), cod[0]!.quality), cell(sec(cod[1]!.shuttleS), cod[1]!.quality), better(cod[0]!.shuttleS, cod[1]!.shuttleS, false, 0.005)))
  return {
    result: { kind: 'route-race', route, runs },
    card: {
      ...head,
      score: [sec(times[0]), sec(times[1])],
      scoreLabel: `${ROUTES[route].label} route time`,
      quality: 'SIMULATED',
      basis: `${ROUTES[route].description} Each receiver runs it on the sprint model; snap and plant times carry seeded jitter.`,
      lines,
      why: p.map((a, i) => whyFor(a, EVENTS['route-race'].inputs[i]!, [cell(runs[i]!.basis.split(' Cuts keep')[0]!, runs[i]!.inputQuality), cell(`Change of direction: ${cod[i]!.basis}.`, cod[i]!.quality)])) as [WhyBlock, WhyBlock],
      notes: [],
      detail: [runs[0].basis],
    },
  }
}

/** The rep to animate: the most common outcome, and within it the rep nearest that outcome's median yards. */
export function representativeRep(reps: readonly TackleRep[]): number {
  if (reps.length === 0) return -1
  const order: TackleOutcome[] = ['tackled', 'broken', 'juked']
  const count = (o: TackleOutcome) => reps.filter((r) => r.outcome === o).length
  const top = order.reduce((best, o) => (count(o) > count(best) ? o : best), order[0]!)
  const idx = reps.map((r, i) => ({ r, i })).filter((x) => x.r.outcome === top)
  const yards = idx.map((x) => x.r.yardsAfterContact).sort((a, b) => a - b)
  const median = yards[Math.floor((yards.length - 1) / 2)]!
  return idx.reduce((best, x) => (Math.abs(x.r.yardsAfterContact - median) < Math.abs(reps[best]!.yardsAfterContact - median) ? x.i : best), idx[0]!.i)
}

const OUTCOME_TEXT: Record<TackleOutcome, string> = { broken: 'broke the tackle', juked: 'made him miss', tackled: 'was tackled' }

const runTackle: Runner = (p, seed) => {
  const [carrier, tackler] = p
  const names = pairNames(carrier, tackler)
  const result = tackleBreak(carrier, tackler, TACKLE_REPS, createRng(seed))
  const n = result.reps.length
  const escapes = result.broken + result.juked
  const winner: 0 | 1 = escapes > result.tackled ? 0 : 1
  const avg = (f: (r: TackleRep) => number) => (n ? result.reps.reduce((s, r) => s + f(r), 0) / n : 0)
  const rep = representativeRep(result.reps)
  const cp = sprintProfile(carrier)
  const tp = sprintProfile(tackler)
  const lines: CardLine[] = [
    line('Reps won', cell(String(escapes), 'SIMULATED'), cell(String(result.tackled), 'SIMULATED'), better(escapes, result.tackled, true)),
    line('Broken tackles', cell(String(result.broken), 'SIMULATED'), DASH),
    line('Made the tackler miss', cell(String(result.juked), 'SIMULATED'), DASH),
    line('Yards after contact, average', cell(`${result.avgYardsAfterContact.toFixed(1)} yd`, 'SIMULATED'), DASH),
    line('Momentum at contact, average', cell(`${avg((r) => r.carrierMomentum).toFixed(0)} kg·m/s`, 'SIMULATED'), cell(`${avg((r) => r.tacklerMomentum).toFixed(0)} kg·m/s`, 'SIMULATED'), better(avg((r) => r.carrierMomentum), avg((r) => r.tacklerMomentum), true, 0.5)),
    line('Chance to break it at contact, average', cell(pct(avg((r) => r.pBreak)), 'SIMULATED'), DASH),
    line('Chance to make him miss', cell(pct(result.reps[0]?.pJuke ?? 0), 'SIMULATED'), DASH),
    line('Weight', weightCell(carrier), weightCell(tackler)),
  ]
  const shown = result.reps[rep]
  return {
    result: { kind: 'tackle-break', result, rep },
    card: {
      winner,
      headline: winner === 0 ? `${names[0]} gets away on ${escapes} of ${n} reps` : `${names[1]} makes the tackle on ${result.tackled} of ${n} reps`,
      score: [String(escapes), String(result.tackled)],
      scoreLabel: `reps won of ${n}`,
      quality: 'SIMULATED',
      basis: 'Logistic model on momentum at contact and the tackle-breaking, elusiveness and strength grades; contact speeds and outcomes are seeded draws.',
      lines,
      why: [
        whyFor(carrier, EVENTS['tackle-break'].inputs[0], [cell(cp.basis, cp.quality)], 'Ball carrier'),
        whyFor(tackler, EVENTS['tackle-break'].inputs[1], [cell(tp.basis, tp.quality), cell(`Change of direction: ${changeOfDirection(tackler).basis}.`, changeOfDirection(tackler).quality)], 'Tackler'),
      ],
      notes: shown ? [`The stage replays rep ${rep + 1}, the most typical one: ${names[0]} ${OUTCOME_TEXT[shown.outcome]} (${shown.yardsAfterContact.toFixed(1)} yd after contact).`] : [],
      detail: [result.basis],
    },
  }
}

const runQb: Runner = (p, seed) => {
  const names = pairNames(...p)
  // Same draws for both passers: the misses differ only by each athlete's spread.
  const accuracy = p.map((a) => qbAccuracy(a, QB_DEPTHS_YD, QB_THROWS_PER_DEPTH, createRng(seed))) as [QbAccuracyResult, QbAccuracyResult]
  const arm = p.map((a) => armStrength(a)) as [ArmStrengthResult, ArmStrengthResult]
  const totals = accuracy.map((r) => r.total) as [number, number]
  let winner = better(totals[0], totals[1], true) ?? null
  let headline = winner === null ? '' : `${names[winner]} wins on the targets, ${Math.max(...totals)} to ${Math.min(...totals)}`
  if (winner === null) {
    winner = better(arm[0].maxDistanceYd, arm[1].maxDistanceYd, true, 0.5) ?? null
    headline = winner === null ? `${names[0]} and ${names[1]} level on targets and distance` : `Level on the targets at ${totals[0]}; ${names[winner]} wins on distance`
  }
  const lines: CardLine[] = [line(`Accuracy points (of ${accuracy[0].maxTotal})`, cell(String(totals[0]), 'SIMULATED'), cell(String(totals[1]), 'SIMULATED'), better(totals[0], totals[1], true))]
  accuracy[0].byDepth.forEach((d, k) => {
    const e = accuracy[1].byDepth[k]
    if (!e) return
    lines.push(line(`At ${d.depthYd} yd`, cell(d.inRange ? `${d.points} pts` : 'Out of range', 'SIMULATED'), cell(e.inRange ? `${e.points} pts` : 'Out of range', 'SIMULATED'), better(d.points, e.points, true)))
  })
  lines.push(line('Throw velocity (football)', cell(`${arm[0].velocityMph.toFixed(1)} mph`, arm[0].velocityQuality), cell(`${arm[1].velocityMph.toFixed(1)} mph`, arm[1].velocityQuality), better(arm[0].velocityMph, arm[1].velocityMph, true, 0.05)))
  lines.push(line('Longest carry', cell(`${arm[0].maxDistanceYd.toFixed(0)} yd`, arm[0].quality), cell(`${arm[1].maxDistanceYd.toFixed(0)} yd`, arm[1].quality), better(arm[0].maxDistanceYd, arm[1].maxDistanceYd, true, 0.5)))
  const deep = accuracy.map((r) => r.byDepth[r.byDepth.length - 1])
  if (deep[0] && deep[1]) lines.push(line(`Air time to ${deep[0].depthYd} yd`, cell(deep[0].inRange ? sec(deep[0].airTimeS) : 'Out of range', accuracy[0].flightQuality), cell(deep[1].inRange ? sec(deep[1].airTimeS) : 'Out of range', accuracy[1].flightQuality), deep[0].inRange && deep[1].inRange ? better(deep[0].airTimeS, deep[1].airTimeS, false, 0.005) : undefined))
  const velocity = p.map((a) => throwVelocity(a, 'football'))
  return {
    result: { kind: 'qb-throw', accuracy, arm },
    card: {
      winner,
      headline,
      score: [String(totals[0]), String(totals[1])],
      scoreLabel: `accuracy points of ${accuracy[0].maxTotal}`,
      quality: 'SIMULATED',
      basis: 'Miss spread from the accuracy grade grows with distance and each miss is a seeded draw; velocity and carry come from the football drag model.',
      lines,
      why: p.map((a, i) => whyFor(a, EVENTS['qb-throw'].inputs[i]!, [cell(`Velocity: ${velocity[i]!.basis}`, velocity[i]!.quality), cell(`Accuracy skill z ${accuracy[i]!.skillZ.toFixed(2)}.`, accuracy[i]!.skillQuality)])) as [WhyBlock, WhyBlock],
      notes: [],
      detail: [accuracy[0].basis, accuracy[1].basis],
    },
  }
}

const MOVE_LABEL: Record<PassRushMove, string> = { speed: 'Speed rush', power: 'Power rush', counter: 'Counter move' }

const runPassRush: Runner = (p, seed) => {
  const [rusher, blocker] = p
  const names = pairNames(rusher, blocker)
  const result = passRush(rusher, blocker, RUSH_REPS, createRng(seed))
  const n = result.reps.length
  const wins = result.reps.filter((r) => r.win).length
  const held = n - wins
  const winner: 0 | 1 = wins > held ? 0 : 1
  const off = getOff(rusher)
  const lines: CardLine[] = [
    line('Reps won', cell(String(wins), 'SIMULATED'), cell(String(held), 'SIMULATED'), better(wins, held, true)),
    line('Average time to win', result.avgTimeToWin === null ? DASH : cell(sec(result.avgTimeToWin), 'SIMULATED'), DASH),
    ...(Object.keys(MOVE_LABEL) as PassRushMove[]).filter((m) => result.byMove[m].reps > 0).map((m) => line(MOVE_LABEL[m], cell(`${result.byMove[m].wins} won of ${result.byMove[m].reps}`, 'SIMULATED'), DASH)),
    line('Get-off (10-yard split)', cell(sec(off.tenSplitS), off.quality), DASH),
    line('Weight', weightCell(rusher), weightCell(blocker)),
  ]
  return {
    result: { kind: 'pass-rush', result },
    card: {
      winner,
      headline: winner === 0 ? `${names[0]} wins ${wins} of ${n} rushes` : `${names[1]} holds up on ${held} of ${n} rushes`,
      score: [String(wins), String(held)],
      scoreLabel: `reps won of ${n}`,
      quality: 'SIMULATED',
      basis: `Move choice and wins are seeded draws on a matchup score from get-off, size, strength and footwork; a rush not won by ${RUSH_WINDOW_S.toFixed(1)} s is lost.`,
      lines,
      why: [
        whyFor(rusher, EVENTS['pass-rush'].inputs[0], [cell(`Get-off: ${off.basis}.`, off.quality), cell(`Footwork: ${changeOfDirection(rusher).basis}.`, changeOfDirection(rusher).quality)], 'Pass rusher'),
        whyFor(blocker, EVENTS['pass-rush'].inputs[1], [cell(`Footwork: ${changeOfDirection(blocker).basis}.`, changeOfDirection(blocker).quality)], 'Blocker'),
      ],
      notes: [],
      detail: [result.basis],
    },
  }
}

/** Shootout shots in the shooting stage's format: one list per shooter, misses spread around the rim. */
export function shootoutShots(result: ShootoutResult): [Shot[], Shot[]] {
  const out: [Shot[], Shot[]] = [[], []]
  ;[...result.shots, ...result.tiebreakShots].forEach((s, i) => {
    const side = s.shooter === result.ids[0] ? 0 : 1
    out[side].push({ zone: s.zone, made: s.made, p: s.p, miss: s.made ? 0 : (((i * 37) % 17) / 8 - 1) || 0.4 })
  })
  return out
}

const runShootout: Runner = (p, seed) => {
  const names = pairNames(...p)
  const result = oneOnOneShootout(p[0], p[1], SHOOTOUT_SPOTS, SHOTS_PER_SPOT, createRng(seed))
  const [ka, kb] = result.ids
  const scores: [number, number] = [result.scores[ka] ?? 0, result.scores[kb] ?? 0]
  const winner: 0 | 1 = result.winner === ka ? 0 : 1
  const mine = (k: string) => result.shots.filter((s) => s.shooter === k)
  const made = [mine(ka), mine(kb)].map((l) => l.filter((s) => s.made).length)
  const threes = [mine(ka), mine(kb)].map((l) => l.filter((s) => s.made && ZONES[s.zone].three).length)
  const chance = p.map((a) => {
    const probs = SHOOTOUT_SPOTS.map((z) => makeProbability(a, z))
    return { p: probs.reduce((s, x) => s + x.p, 0) / probs.length, q: weakest(...probs.map((x) => x.quality)) }
  })
  const total = mine(ka).length
  const lines: CardLine[] = [
    line('Points', cell(String(scores[0]), 'SIMULATED'), cell(String(scores[1]), 'SIMULATED'), better(scores[0], scores[1], true)),
    line(`Makes (of ${total})`, cell(String(made[0]), 'SIMULATED'), cell(String(made[1]), 'SIMULATED'), better(made[0]!, made[1]!, true)),
    line('Threes made', cell(String(threes[0]), 'SIMULATED'), cell(String(threes[1]), 'SIMULATED'), better(threes[0]!, threes[1]!, true)),
    line('Make chance, average over the spots', cell(pct(chance[0]!.p), chance[0]!.q), cell(pct(chance[1]!.p), chance[1]!.q), better(chance[0]!.p, chance[1]!.p, true, 0.005)),
  ]
  const notes: string[] = []
  if (result.decidedBy !== 'regulation') notes.push(`Level at ${scores[0]} after regulation; ${names[winner]} won ${result.decidedBy === 'coin-flip' ? 'on a coin flip' : `in sudden death after ${plural(result.tiebreakShots.length / 2, 'round')}`} from the top of the key.`)
  return {
    result: { kind: 'shootout', result },
    card: {
      winner,
      headline: `${names[winner]} wins the shootout ${Math.max(...scores)}-${Math.min(...scores)}${result.decidedBy === 'regulation' ? '' : ' after a tiebreak'}`,
      score: [String(scores[0]), String(scores[1])],
      scoreLabel: 'points',
      quality: 'SIMULATED',
      basis: 'Each shot is a seeded draw against the shooter’s make chance for the spot; two points inside the arc, three outside.',
      lines,
      why: p.map((a, i) => whyFor(a, EVENTS.shootout.inputs[i]!, SHOOTOUT_SPOTS.slice(0, 3).map((z) => { const m = makeProbability(a, z); return cell(`${ZONES[z].label}: ${pct(m.p)}. ${m.basis}`, m.quality) }))) as [WhyBlock, WhyBlock],
      notes,
      detail: [result.basis],
    },
  }
}

const runVertical: Runner = (p, _seed, opts, cross) => {
  const names = pairNames(...p)
  const rows = p.map((a) => ({ maxVertical: jumpValue(a, 'maxVertical'), standingVertical: jumpValue(a, 'standingVertical'), laneAgility: agilityValue(a, 'laneAgility') })) as [VerticalRow, VerticalRow]
  const tests: { key: VerticalTest; label: string; higher: boolean; fmt: (v: number) => string }[] = [
    { key: 'maxVertical', label: 'Running vertical', higher: true, fmt: (v) => `${v.toFixed(1)} in` },
    { key: 'standingVertical', label: 'Standing vertical', higher: true, fmt: (v) => `${v.toFixed(1)} in` },
    { key: 'laneAgility', label: 'Lane agility', higher: false, fmt: sec },
  ]
  const won: [number, number] = [0, 0]
  const lines = tests.map((t) => {
    const x = rows[0][t.key]
    const y = rows[1][t.key]
    const b = better(x.value, y.value, t.higher, t.key === 'laneAgility' ? 0.005 : 0.05)
    if (b !== undefined) won[b]++
    return line(t.label, cell(t.fmt(x.value), x.quality), cell(t.fmt(y.value), y.quality), b)
  })
  if (cross) {
    const n = p.map((a, i) => normalizeJump(a, rows[i]!.maxVertical.value, rows[i]!.maxVertical.quality))
    lines.push(line('Jump power per kilogram (size-adjusted)', n[0] ? cell(`${n[0].value.toFixed(1)} W/kg`, n[0].quality) : DASH, n[1] ? cell(`${n[1].value.toFixed(1)} W/kg`, n[1].quality) : DASH, n[0] && n[1] ? better(n[0].value, n[1].value, true, 0.05) : undefined))
  }
  const winner = better(won[0], won[1], true) ?? null
  const basisOf = (r: VerticalRow): CardCell[] => tests.map((t) => cell(`${t.label}: ${r[t.key].basis}`, r[t.key].quality))
  return {
    result: { kind: 'vertical-agility', rows, test: opts.test ?? 'maxVertical' },
    card: {
      winner,
      headline: winner === null ? `${names[0]} and ${names[1]} split the tests ${won[0]}-${won[1]}` : `${names[winner]} takes ${won[winner]} of 3 tests`,
      score: [String(won[0]), String(won[1])],
      scoreLabel: 'tests won of 3',
      quality: 'SIMULATED',
      basis: 'Profile figures compared test by test, with a labelled estimate where a figure is missing.',
      lines,
      why: [whyFor(p[0], EVENTS['vertical-agility'].inputs[0], basisOf(rows[0])), whyFor(p[1], EVENTS['vertical-agility'].inputs[1], basisOf(rows[1]))],
      notes: [],
      detail: [],
    },
  }
}

const runDunk: Runner = (p, seed) => {
  const names = pairNames(...p)
  const result = dunkContest(p, DUNK_ROUNDS, createRng(seed))
  const [ea, eb] = result.entries as [DunkContestResult['entries'][number], DunkContestResult['entries'][number]]
  const winner: 0 | 1 = result.winner === ea.key ? 0 : 1
  const roundText = (r: (typeof ea.rounds)[number]) => `${r.label}: ${r.total}${r.made ? (r.attempts > 1 ? ` (made on try ${r.attempts})` : '') : ' (missed 3 times)'}`
  const lines: CardLine[] = [
    line('Contest total', cell(String(ea.total), 'SIMULATED'), cell(String(eb.total), 'SIMULATED'), better(ea.total, eb.total, true)),
    line('Rim clearance', cell(`${ea.check.clearanceIn.toFixed(1)} in`, ea.check.quality), cell(`${eb.check.clearanceIn.toFixed(1)} in`, eb.check.quality), better(ea.check.clearanceIn, eb.check.clearanceIn, true, 0.05)),
    line('Can dunk', cell(ea.check.canDunk ? 'Yes' : 'No', ea.check.quality), cell(eb.check.canDunk ? 'Yes' : 'No', eb.check.quality)),
    ...ea.rounds.map((r, k) => {
      const o = eb.rounds[k]
      return line(`Round ${k + 1}`, cell(roundText(r), 'SIMULATED'), o ? cell(roundText(o), 'SIMULATED') : DASH, o ? better(r.total, o.total, true) : undefined)
    }),
  ]
  return {
    result: { kind: 'dunk-contest', result },
    card: {
      winner,
      headline: `${names[winner]} wins the dunk contest ${Math.max(ea.total, eb.total)}-${Math.min(ea.total, eb.total)}`,
      score: [String(ea.total), String(eb.total)],
      scoreLabel: 'judges’ points',
      quality: 'SIMULATED',
      basis: 'Dunk choice and make chance from rim clearance (standing reach plus vertical); makes and the five judges’ scores are seeded draws.',
      lines,
      why: [whyFor(p[0], EVENTS['dunk-contest'].inputs[0], [cell(ea.check.basis, ea.check.quality)]), whyFor(p[1], EVENTS['dunk-contest'].inputs[1], [cell(eb.check.basis, eb.check.quality)])],
      notes: [ea.note, eb.note, ...(result.tiebreak ? [result.tiebreak] : [])],
      detail: [result.basis],
    },
  }
}

const runIso: Runner = (p, seed) => {
  const names = pairNames(...p)
  const rng = createRng(seed)
  const halves: [IsoResult, IsoResult] = [isoPossessions(p[0], p[1], ISO_POSSESSIONS, rng), isoPossessions(p[1], p[0], ISO_POSSESSIONS, rng)]
  const pts = halves.map((x) => x.points) as [number, number]
  const winner = better(pts[0], pts[1], true) ?? null
  const count = (x: IsoResult, f: (r: IsoResult['possessions'][number]) => boolean) => x.possessions.filter(f).length
  const tov = halves.map((x) => count(x, (r) => r.result === 'turnover'))
  const fouls = halves.map((x) => count(x, (r) => r.result === 'foul'))
  const makes = halves.map((x) => count(x, (r) => r.result === 'make2' || r.result === 'make3'))
  const lines: CardLine[] = [
    line(`Points (${ISO_POSSESSIONS} possessions each)`, cell(String(pts[0]), 'SIMULATED'), cell(String(pts[1]), 'SIMULATED'), better(pts[0], pts[1], true)),
    line('Points per possession', cell(halves[0].pointsPerPossession.toFixed(2), 'SIMULATED'), cell(halves[1].pointsPerPossession.toFixed(2), 'SIMULATED'), better(halves[0].pointsPerPossession, halves[1].pointsPerPossession, true, 0.005)),
    line('Made shots', cell(String(makes[0]), 'SIMULATED'), cell(String(makes[1]), 'SIMULATED'), better(makes[0]!, makes[1]!, true)),
    line('Turnovers', cell(String(tov[0]), 'SIMULATED'), cell(String(tov[1]), 'SIMULATED'), better(tov[0]!, tov[1]!, false)),
    line('Fouls drawn', cell(String(fouls[0]), 'SIMULATED'), cell(String(fouls[1]), 'SIMULATED'), better(fouls[0]!, fouls[1]!, true)),
    line('Edge off the dribble (z)', cell(halves[0].edge.toFixed(2), weakest(halves[0].inputQuality, 'ESTIMATED')), cell(halves[1].edge.toFixed(2), weakest(halves[1].inputQuality, 'ESTIMATED')), better(halves[0].edge, halves[1].edge, true, 0.005)),
    line('Length contesting the shot', cell(`${halves[1].contestIn.toFixed(1)} in`, weakest(halves[1].inputQuality, 'ESTIMATED')), cell(`${halves[0].contestIn.toFixed(1)} in`, weakest(halves[0].inputQuality, 'ESTIMATED'))),
  ]
  const share = (x: IsoResult) => (Object.keys(ISO_MOVES) as (keyof typeof ISO_MOVES)[]).map((m) => `${ISO_MOVES[m].label.toLowerCase()} ${pct(x.moveShare[m])}`).join(', ')
  return {
    result: { kind: 'iso', halves },
    card: {
      winner,
      headline: winner === null ? `${names[0]} and ${names[1]} level at ${pts[0]}` : `${names[winner]} outscores ${names[1 - winner]} ${Math.max(...pts)}-${Math.min(...pts)}`,
      score: [String(pts[0]), String(pts[1])],
      scoreLabel: `points in ${ISO_POSSESSIONS} possessions each`,
      quality: 'SIMULATED',
      basis: `Each athlete gets ${ISO_POSSESSIONS} isolation possessions against the other; moves, turnovers, fouls and makes are seeded draws on shooting, handling, speed and length.`,
      lines,
      why: [
        whyFor(p[0], EVENTS.iso.inputs[0], [cell(`Move mix with the ball: ${share(halves[0])}.`, 'SIMULATED')]),
        whyFor(p[1], EVENTS.iso.inputs[1], [cell(`Move mix with the ball: ${share(halves[1])}.`, 'SIMULATED')]),
      ],
      notes: ['The “length contesting the shot” line is the defender’s wingspan over the shooter’s height, so each cell describes that athlete on defense.'],
      detail: [halves[0].basis, halves[1].basis],
    },
  }
}

const REACHED = new Set(['single', 'double', 'triple', 'homeRun', 'walk'])
const PA_TEXT: Record<string, string> = { out: 'out', single: 'single', double: 'double', triple: 'triple', homeRun: 'home run', walk: 'walk', strikeout: 'strikeout' }

const runAtBat: Runner = (p, seed) => {
  const names = pairNames(...p)
  const pitcher = makePitcher(p[0])
  const batter = makeBatter(p[1])
  const duel = simulateDuel(pitcher, batter, createRng(seed), AT_BAT_PA)
  const batterWon = duel.appearances.filter((x) => REACHED.has(x.result)).length
  const pitcherWon = duel.appearances.length - batterWon
  const winner: 0 | 1 = pitcherWon > batterWon ? 0 : 1
  const line5 = duel.line
  const pitches = duel.appearances.reduce((s, x) => s + x.pitches.length, 0)
  const top = pitcher.arsenal.reduce((m, x) => (x.mph > m.mph ? x : m), pitcher.arsenal[0]!)
  const notes: string[] = []
  if (!p[0].pitches?.length && (p[0].positionGroup === 'P' || p[0].positionGroup === 'TWP')) notes.push(`No pitch arsenal is on file for ${p[0].name}, so the duel model treats him as a position player throwing an estimated fastball; his listed fastball figures are not used.`)
  return {
    result: { kind: 'at-bat', pitcher, batter, duel },
    card: {
      winner,
      headline: winner === 0 ? `${names[0]} wins ${pitcherWon} of ${duel.appearances.length} plate appearances` : `${names[1]} reaches base in ${batterWon} of ${duel.appearances.length} plate appearances`,
      score: [String(pitcherWon), String(batterWon)],
      scoreLabel: `plate appearances won of ${duel.appearances.length}`,
      quality: 'SIMULATED',
      basis: 'Pitch by pitch: locations, swings and batted balls are seeded draws on the arsenal, bat speed, contact and discipline. A walk or hit is the batter’s.',
      lines: [
        line('Plate appearances won', cell(String(pitcherWon), 'SIMULATED'), cell(String(batterWon), 'SIMULATED'), better(pitcherWon, batterWon, true)),
        line('Results', DASH, cell(duel.appearances.map((x) => PA_TEXT[x.result] ?? x.result).join(', '), 'SIMULATED')),
        line('Strikeouts and walks', cell(`${line5.k} K, ${line5.bb} BB`, 'SIMULATED'), DASH),
        line('Hits and home runs', DASH, cell(`${line5.h} H, ${line5.hr} HR`, 'SIMULATED')),
        line('Pitches thrown', cell(String(pitches), 'SIMULATED'), DASH),
        line('Hardest pitch in the arsenal', cell(`${top.mph.toFixed(1)} mph ${top.type}`, top.quality), DASH),
        line('Bat speed', DASH, cell(`${batter.batSpeedMph.toFixed(1)} mph`, weakest(resolveMetric(p[1], 'batSpeedMph')?.quality ?? 'SIMULATED', p[1].league === 'MLB' ? 'VERIFIED' : 'SIMULATED'))),
      ],
      why: [whyFor(p[0], EVENTS['at-bat'].inputs[0], [cell(pitcher.basis, pitcher.quality)], 'Pitcher'), whyFor(p[1], EVENTS['at-bat'].inputs[1], [cell(batter.basis, batter.quality)], 'Batter')],
      notes,
      detail: [],
    },
  }
}

const runHomeToFirst: Runner = (p, _seed, _opts, cross) => {
  const names = pairNames(...p)
  const runs = p.map((a) => homeToFirst(a)) as [HomeToFirst, HomeToFirst]
  const sprints = p.map((a) => sprintRow(a, HOME_TO_FIRST_M)) as [SprintRow, SprintRow]
  const times = runs.map((r) => r.time) as [number, number]
  const w = better(times[0], times[1], false, 0.005)
  const lines: CardLine[] = [
    line('Home to first', cell(sec(times[0]), runs[0].quality), cell(sec(times[1]), runs[1].quality), w),
    line('Bats', cell(runs[0].batsLeft ? 'Left (closer to first)' : 'Right'), cell(runs[1].batsLeft ? 'Left (closer to first)' : 'Right')),
    ...speedLine(p, [sprints[0].profile, sprints[1].profile], cross),
  ]
  return {
    result: { kind: 'home-to-first', runs, sprints },
    card: {
      winner: w ?? null,
      headline: w === undefined ? `${names[0]} and ${names[1]} reach first together` : `${names[w]} beats ${names[1 - w]} to first by ${Math.abs(times[0] - times[1]).toFixed(2)} s`,
      score: [sec(times[0]), sec(times[1])],
      scoreLabel: 'home to first',
      quality: 'SIMULATED',
      basis: 'A measured home-to-first time where the profile has one, otherwise the sprint model over 90 feet plus the time to finish the swing.',
      lines,
      why: p.map((a, i) => whyFor(a, EVENTS['home-to-first'].inputs[i]!, [cell(runs[i]!.basis, runs[i]!.quality)])) as [WhyBlock, WhyBlock],
      notes: [],
      detail: [],
    },
  }
}

const runArm: Runner = (p, seed, opts) => {
  const names = pairNames(...p)
  const feet = opts.distanceFt ?? 250
  const throws = p.map((a) => outfieldThrow(a, feet, OUTFIELD_THROWS, createRng(seed))) as [OutfieldThrow, OutfieldThrow]
  const arms = p.map((a) => armSpeed(a, CROW_HOP))
  const outs = throws.map((t) => t.outs) as [number, number]
  const avgTime = throws.map((t) => t.throws.reduce((s, x) => s + x.timeToPlateS, 0) / Math.max(1, t.throws.length)) as [number, number]
  let winner = better(outs[0], outs[1], true) ?? null
  let headline = winner === null ? '' : `${names[winner]} throws out ${outs[winner]} of ${OUTFIELD_THROWS} runners to ${outs[1 - winner]}`
  if (winner === null) {
    winner = better(avgTime[0], avgTime[1], false, 0.005) ?? null
    headline = winner === null ? `${names[0]} and ${names[1]} level from ${throws[0].distanceFt} ft` : `Level on runners at ${outs[0]}; ${names[winner]} gets it home quicker`
  }
  const fastest = throws.map((t) => Math.min(...t.throws.map((x) => x.timeToPlateS)))
  const hops = throws.map((t) => t.throws.filter((x) => x.bounces).length)
  return {
    result: { kind: 'arm-throw', throws },
    card: {
      winner,
      headline,
      score: [String(outs[0]), String(outs[1])],
      scoreLabel: `runners out of ${OUTFIELD_THROWS}`,
      quality: 'SIMULATED',
      basis: `Catch at ${throws[0].distanceFt.toFixed(0)} ft and throw home; release, velocity jitter and the miss are seeded draws and the runner from third needs ${TAG_UP_S} s.`,
      lines: [
        line(`Runners thrown out (of ${OUTFIELD_THROWS})`, cell(String(outs[0]), 'SIMULATED'), cell(String(outs[1]), 'SIMULATED'), better(outs[0], outs[1], true)),
        line('Average time to the plate', cell(sec(avgTime[0]), 'SIMULATED'), cell(sec(avgTime[1]), 'SIMULATED'), better(avgTime[0], avgTime[1], false, 0.005)),
        line('Quickest throw home', cell(sec(fastest[0]!), 'SIMULATED'), cell(sec(fastest[1]!), 'SIMULATED'), better(fastest[0]!, fastest[1]!, false, 0.005)),
        line('Throw velocity with a crow hop', cell(`${arms[0]!.mph.toFixed(1)} mph`, weakest(arms[0]!.quality, resolveMetric(p[0], 'armStrengthMph') ? 'VERIFIED' : 'ESTIMATED')), cell(`${arms[1]!.mph.toFixed(1)} mph`, weakest(arms[1]!.quality, resolveMetric(p[1], 'armStrengthMph') ? 'VERIFIED' : 'ESTIMATED')), better(arms[0]!.mph, arms[1]!.mph, true, 0.05)),
        line('Throws that came in on a hop', cell(String(hops[0]), 'SIMULATED'), cell(String(hops[1]), 'SIMULATED')),
      ],
      why: p.map((a, i) => whyFor(a, EVENTS['arm-throw'].inputs[i]!, [cell(`Arm: ${arms[i]!.basis}.`, arms[i]!.quality)])) as [WhyBlock, WhyBlock],
      notes: [],
      detail: [throws[0].basis, throws[1].basis],
    },
  }
}

const runFielding: Runner = (p, seed) => {
  const names = pairNames(...p)
  // A fresh generator with the same seed for each: both field identical batted balls.
  const drills = p.map((a) => fieldingDrill(a, FIELDING_CHANCES, createRng(seed))) as [FieldingDrill, FieldingDrill]
  const outs = drills.map((d) => d.outs) as [number, number]
  const errors = drills.map((d) => d.chances.filter((c) => c.outcome === 'error').length) as [number, number]
  const hits = drills.map((d) => d.chances.filter((c) => c.outcome === 'hit').length)
  const react = drills.map((d) => d.chances.reduce((s, c) => s + c.reactionS, 0) / Math.max(1, d.chances.length))
  const dives = drills.map((d) => d.chances.filter((c) => c.outcome === 'out' && c.arrivalS > c.hangTimeS).length)
  let winner = better(outs[0], outs[1], true) ?? null
  let headline = winner === null ? '' : `${names[winner]} turns ${outs[winner]} of ${FIELDING_CHANCES} chances into outs, to ${outs[1 - winner]}`
  if (winner === null) {
    winner = better(errors[0], errors[1], false) ?? null
    headline = winner === null ? `${names[0]} and ${names[1]} level on ${outs[0]} outs` : `Level on outs at ${outs[0]}; ${names[winner]} makes fewer errors`
  }
  return {
    result: { kind: 'fielding', drills },
    card: {
      winner,
      headline,
      score: [String(outs[0]), String(outs[1])],
      scoreLabel: `outs of ${FIELDING_CHANCES}`,
      quality: 'SIMULATED',
      basis: 'The same seeded batted balls for both; reaction, route, catch and throw to first are draws on agility, fielding, sprint and arm.',
      lines: [
        line(`Outs (of ${FIELDING_CHANCES})`, cell(String(outs[0]), 'SIMULATED'), cell(String(outs[1]), 'SIMULATED'), better(outs[0], outs[1], true)),
        line('Errors', cell(String(errors[0]), 'SIMULATED'), cell(String(errors[1]), 'SIMULATED'), better(errors[0], errors[1], false)),
        line('Hits allowed', cell(String(hits[0]), 'SIMULATED'), cell(String(hits[1]), 'SIMULATED'), better(hits[0]!, hits[1]!, false)),
        line('Diving outs', cell(String(dives[0]), 'SIMULATED'), cell(String(dives[1]), 'SIMULATED')),
        line('Average reaction', cell(sec(react[0]!), 'SIMULATED'), cell(sec(react[1]!), 'SIMULATED'), better(react[0]!, react[1]!, false, 0.005)),
      ],
      why: p.map((a, i) => whyFor(a, EVENTS.fielding.inputs[i]!, [cell(sprintProfile(a).basis, sprintProfile(a).quality), cell(`Arm: ${armSpeed(a, 0.9).basis}.`, armSpeed(a, 0.9).quality)])) as [WhyBlock, WhyBlock],
      notes: p.some((a) => a.league !== 'MLB') ? ['Athletes outside MLB field with a novice glove grade.'] : [],
      detail: [drills[0].basis, drills[1].basis],
    },
  }
}

const runLift: Runner = (p, _seed, opts) => {
  const names = pairNames(...p)
  const lift = opts.lift ?? 'bench'
  const values = p.map((a) => liftValue(a, lift)) as [EventValue, EventValue]
  const w = better(values[0].value, values[1].value, true, 0.5)
  const norm = p.map((a, i) => normalizeStrength(a, values[i]!.value, values[i]!.quality))
  return {
    result: { kind: 'lift-off', lift, values },
    card: {
      winner: w ?? null,
      headline: w === undefined ? `${names[0]} and ${names[1]} lift the same` : `${names[w]} out-lifts ${names[1 - w]} by ${Math.abs(values[0].value - values[1].value).toFixed(0)} lb`,
      score: [`${values[0].value.toFixed(0)} lb`, `${values[1].value.toFixed(0)} lb`],
      scoreLabel: `${LIFT_LABEL[lift].toLowerCase()}, one-rep max`,
      quality: 'SIMULATED',
      basis: 'One-rep maxes on file compared side by side; a missing lift is a labelled demo value.',
      lines: [
        line(`${LIFT_LABEL[lift]}, one-rep max`, cell(`${values[0].value.toFixed(0)} lb`, values[0].quality), cell(`${values[1].value.toFixed(0)} lb`, values[1].quality), w),
        line('Scaled to a 200 lb athlete', norm[0] ? cell(`${norm[0].value.toFixed(0)} lb`, norm[0].quality) : DASH, norm[1] ? cell(`${norm[1].value.toFixed(0)} lb`, norm[1].quality) : DASH, norm[0] && norm[1] ? better(norm[0].value, norm[1].value, true, 0.5) : undefined),
        line('Bodyweight', weightCell(p[0]), weightCell(p[1])),
      ],
      why: p.map((a, i) => whyFor(a, EVENTS['lift-off'].inputs[i]!, [cell(values[i]!.basis, values[i]!.quality), ...(norm[i] ? [cell(norm[i]!.method, norm[i]!.quality)] : [])])) as [WhyBlock, WhyBlock],
      notes: [],
      detail: [],
    },
  }
}

const RUNNERS: Record<EventId, Runner> = {
  forty: runForty,
  'route-race': runRouteRace,
  'tackle-break': runTackle,
  'qb-throw': runQb,
  'pass-rush': runPassRush,
  shootout: runShootout,
  'vertical-agility': runVertical,
  'dunk-contest': runDunk,
  iso: runIso,
  'at-bat': runAtBat,
  'home-to-first': runHomeToFirst,
  'arm-throw': runArm,
  fielding: runFielding,
  'lift-off': runLift,
}

// ---------------------------------------------------------------------------------------------
// Motion helpers (pure)

/** Distance after t seconds accelerating toward speed v with time constant tau (sprint-model shape). */
export function accelDistance(v: number, t: number, tau = 0.7): number {
  return t <= 0 ? 0 : v * (t - tau * (1 - Math.exp(-t / tau)))
}

export function accelSpeed(v: number, t: number, tau = 0.7): number {
  return t <= 0 ? 0 : v * (1 - Math.exp(-t / tau))
}

/**
 * When two athletes `gap` metres apart, running at each other and accelerating toward vA and vB,
 * come within `sep` metres. Infinity when neither moves.
 */
export function closingTime(gap: number, vA: number, vB: number, sep = 0, tau = 0.7): number {
  const target = gap - sep
  if (target <= 0) return 0
  if (vA + vB <= 0) return Infinity
  const f = (t: number) => accelDistance(vA, t, tau) + accelDistance(vB, t, tau) - target
  let lo = 0
  let hi = 1
  while (f(hi) < 0 && hi < 1e4) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return hi
}

// ---------------------------------------------------------------------------------------------
// Stages

export interface LiveCell {
  label: string
  big: string
  sub: string
  quality: Quality
}

export interface BuiltStage {
  stage: TimelineStage
  env: [EnvKind, EnvOptions]
  /** Running figures for the panel while the replay plays. */
  live?: (t: number) => LiveCell[]
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const clamp01 = (x: number): number => clamp(x, 0, 1)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const wrap01 = (x: number): number => ((x % 1) + 1) % 1
const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const RIM = new THREE.Vector3(0, 3.05, 0)
const G = 9.81

type Side = 'L' | 'R'

// Pose writers in the conventions of motions.ts (degrees in, radians stored).
function setJ(p: Pose, j: JointName, x = 0, y = 0, z = 0): void {
  p.joints[j] = [deg(x), deg(y), deg(z)]
}

function legJ(p: Pose, side: Side, hipFlex: number, knee: number, ankle = 0, abduct = 0): void {
  setJ(p, `hip${side}`, -hipFlex, 0, side === 'L' ? abduct : -abduct)
  setJ(p, `knee${side}`, knee)
  setJ(p, `ankle${side}`, ankle)
}

function armJ(p: Pose, side: Side, flex: number, abduct: number, elbow: number, axial = 0): void {
  const s = side === 'L' ? 1 : -1
  setJ(p, `shoulder${side}`, -flex, s * axial, s * abduct)
  setJ(p, `elbow${side}`, -elbow)
}

function trunkJ(p: Pose, lean: number, twist = 0, tilt = 0): void {
  setJ(p, 'spine', lean * 0.55, twist * 0.45, tilt * 0.5)
  setJ(p, 'chest', lean * 0.45, twist * 0.55, tilt * 0.5)
}

function crouchJ(p: Pose, d: Dimensions, thigh: number, shin: number, abduct = 0): void {
  legJ(p, 'L', thigh, thigh + shin, -shin, abduct)
  legJ(p, 'R', thigh, thigh + shin, -shin, abduct)
  const o = crouchOffset(d, thigh, shin)
  p.root.y -= o.drop + 0.004 * abduct * d.height * 0.1
  p.root.z -= o.back
}

/** Athletic ready stance: knees bent, chest over the toes, hands up. */
function readyPose(d: Dimensions, t: number): Pose {
  const p = emptyPose()
  crouchJ(p, d, 42, 26, 6)
  trunkJ(p, 28 + Math.sin(t * 3) * 1.5)
  armJ(p, 'L', 40, 18, 85)
  armJ(p, 'R', 40, 18, 85)
  setJ(p, 'head', -22)
  return p
}

/** Hands on the opponent: leaning in with the arms extended. `push` 0..1 adds drive. */
function engagePose(d: Dimensions, push: number, t: number): Pose {
  const p = emptyPose()
  const wobble = Math.sin(t * 9) * 4
  crouchJ(p, d, 48 + 8 * push, 30, 8)
  trunkJ(p, 32 + 10 * push, wobble * 0.5)
  armJ(p, 'L', 78 + wobble, 12, 35)
  armJ(p, 'R', 78 - wobble, 12, 35)
  setJ(p, 'head', -28)
  return p
}

/** Going to the ground: k 0..1 tips the body over, forward (1) or backward (-1). */
function fallPose(d: Dimensions, k: number, dir: 1 | -1): Pose {
  const p = emptyPose()
  const u = smooth(k)
  trunkJ(p, dir * 12 * u)
  armJ(p, 'L', (dir > 0 ? 95 : 40) * u, 30, 30)
  armJ(p, 'R', (dir > 0 ? 95 : 40) * u, 30, 30)
  legJ(p, 'L', 25 * u, 35 * u)
  legJ(p, 'R', 10 * u, 15 * u)
  p.root.pitch = dir * (Math.PI / 2 - 0.12) * u
  p.root.y = 0.075 * d.height * d.girth * u
  return p
}

/** A diving reach toward +Z: airborne in the middle, flat on the ground at the end. */
function divePose(d: Dimensions, k: number): Pose {
  const p = emptyPose()
  const u = smooth(k)
  armJ(p, 'L', 70 + 100 * u, 15, 10)
  armJ(p, 'R', 70 + 100 * u, 15, 10)
  legJ(p, 'L', 10 - 25 * u, 20 * u)
  legJ(p, 'R', 10 - 15 * u, 35 * u)
  trunkJ(p, 10 * (1 - u))
  setJ(p, 'head', -40 * u)
  p.root.pitch = (Math.PI / 2 - 0.15) * u
  p.root.y = 0.07 * d.height * u + 0.3 * Math.sin(Math.PI * u)
  return p
}

/** Defensive stance: wide base, low hips, arms out to the side. */
function defendPose(d: Dimensions, t: number): Pose {
  const p = emptyPose()
  crouchJ(p, d, 50, 30, 14)
  trunkJ(p, 22)
  armJ(p, 'L', 25 + 6 * Math.sin(t * 4), 55, 40)
  armJ(p, 'R', 25 - 6 * Math.sin(t * 4), 55, 40)
  setJ(p, 'head', -18)
  return p
}

/** Catching: hands up and out front for a fly or liner, low and out front for a grounder. */
function catchPose(d: Dimensions, high: boolean): Pose {
  const p = emptyPose()
  if (high) {
    legJ(p, 'L', 8, 12)
    legJ(p, 'R', 8, 12)
    trunkJ(p, -4)
    armJ(p, 'L', 150, 15, 25)
    armJ(p, 'R', 140, 10, 35)
    setJ(p, 'head', 30)
  } else {
    crouchJ(p, d, 70, 35, 10)
    trunkJ(p, 45)
    armJ(p, 'L', 55, 10, 15)
    armJ(p, 'R', 50, 12, 25)
    setJ(p, 'head', -30)
  }
  return p
}

/** Running pose with the leg cycle tied to distance so the feet do not skate. */
function runPose(rig: Rig, distance: number, speed: number, vmax: number, accel = 0, carry: Carry = 'none'): Pose {
  const sig = rig.athlete.movement.run
  const frac = clamp01(speed / Math.max(1, vmax))
  const stride = sig.strideLengthM * (0.55 + 0.45 * frac)
  return run(wrap01(distance / (2 * stride)), sig, Math.max(0.25, frac), accel, carry)
}

/** Flat marking on the turf from (x0, z0) to (x1, z1). */
function stripe(x0: number, z0: number, x1: number, z1: number, width: number, color: number, y = 0.012): THREE.Mesh {
  const len = Math.max(0.01, Math.hypot(x1 - x0, z1 - z0))
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshBasicMaterial({ color }))
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = -Math.atan2(x1 - x0, z1 - z0)
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  return mesh
}

function disc(x: number, z: number, r: number, color: number, y = 0.014): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, y, z)
  return mesh
}

function cone(x: number, z: number, color = 0xff7a2f): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
  mesh.position.set(x, 0.21, z)
  mesh.castShadow = true
  return mesh
}

/** A flat white base bag. */
function bag(x: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.7 }))
  mesh.position.set(x, 0.04, z)
  mesh.rotation.y = Math.PI / 4
  mesh.receiveShadow = true
  return mesh
}

/** Runner marker for the drills: a token on the base path, not a figure. */
function token(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }))
  mesh.castShadow = true
  return mesh
}

/** Quadratic arc between two points, peaking `lift` metres above the higher end. */
function arcPoint(from: THREE.Vector3, to: THREE.Vector3, k: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const apex = Math.max(from.y, to.y) + lift
  out.lerpVectors(from, to, k)
  out.y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * (2 * apex - (from.y + to.y) / 2) + k * k * to.y
  return out
}

/** Points of flight() are kept every 20 ms; this reads one at time s (the last point after landing). */
const PATH_DT = 0.02

interface FlightPath {
  path: [number, number][]
  time: number
  distance: number
}

function pathPoint(f: FlightPath, s: number): [number, number] {
  const last = f.path[f.path.length - 1] ?? [0, 0]
  if (s >= f.time) return last
  const i = Math.max(0, s) / PATH_DT
  const k = Math.floor(i)
  const a = f.path[Math.min(k, f.path.length - 1)] ?? last
  const b = f.path[Math.min(k + 1, f.path.length - 1)] ?? last
  return [lerp(a[0], b[0], i - k), lerp(a[1], b[1], i - k)]
}

/** A base for the event stages: one rig per athlete in pick order, props cleaned up on dispose. */
abstract class EventStage extends TimelineStage {
  protected readonly held: HeldProp[] = []
  protected readonly owned: THREE.Object3D[] = []

  constructor(scene: THREE.Scene, athletes: readonly Athlete[]) {
    super(scene)
    this.rigs = athletes.map((a) => {
      const rig = new Rig(a)
      this.group.add(rig.root)
      return rig
    })
  }

  protected add<T extends THREE.Object3D>(o: T): T {
    this.group.add(o)
    return o
  }

  protected name(i: number): string {
    const [a, b] = this.rigs.map((r) => r.athlete)
    return a && b ? pairNames(a, b)[i]! : (this.rigs[i]?.athlete.name ?? '')
  }

  override dispose(): void {
    this.held.forEach((p) => p.dispose())
    super.dispose()
  }
}

// --- Route race -------------------------------------------------------------------------------

const ROUTE_LANE_M = 7.5
const ROUTE_SNAP = 1

interface Track {
  pts: RoutePoint[]
  cum: number[]
  yaw: number[]
}

function buildTrack(pts: readonly RoutePoint[], toWorld: (x: number, z: number) => { x: number; z: number }): Track {
  const world = pts.map((p) => ({ ...p, ...toWorld(p.x, p.z) }))
  const cum: number[] = []
  const yaw: number[] = []
  let d = 0
  let heading = 0
  world.forEach((p, i) => {
    const prev = world[i - 1]
    if (prev) d += Math.hypot(p.x - prev.x, p.z - prev.z)
    cum.push(d)
    const next = world[i + 1]
    if (next && Math.hypot(next.x - p.x, next.z - p.z) > 1e-4) heading = Math.atan2(next.x - p.x, next.z - p.z)
    yaw.push(heading)
  })
  return { pts: world, cum, yaw }
}

function trackAt(tr: Track, t: number): { x: number; z: number; speed: number; dist: number; yaw: number } {
  const pts = tr.pts
  const first = pts[0]!
  const n = pts.length - 1
  const last = pts[n]!
  if (t <= first.t) return { x: first.x, z: first.z, speed: 0, dist: 0, yaw: tr.yaw[0]! }
  if (t >= last.t) return { x: last.x, z: last.z, speed: last.speed, dist: tr.cum[n]!, yaw: tr.yaw[n]! }
  let lo = 0
  let hi = n
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = pts[lo]!
  const b = pts[hi]!
  const k = (t - a.t) / (b.t - a.t || 1)
  return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), speed: lerp(a.speed, b.speed, k), dist: lerp(tr.cum[lo]!, tr.cum[hi]!, k), yaw: tr.yaw[lo]! }
}

/** Two receivers run the same route in their own lanes; the route is painted on the turf. */
export class RouteRaceStage extends EventStage {
  private readonly tracks: Track[]
  private readonly turns: (1 | -1)[]
  private readonly vmax: number[]
  private readonly center = new THREE.Vector3(0, 1, 4)

  constructor(
    scene: THREE.Scene,
    athletes: readonly Athlete[],
    readonly runs: readonly [RouteRun, RouteRun],
    colors: readonly [number, number],
  ) {
    super(scene, athletes)
    const def = ROUTES[runs[0].route]
    this.tracks = runs.map((r, i) => buildTrack(r.path, (x, z) => this.world(i, x, z)))
    this.vmax = athletes.map((a) => sprintProfile(a).vmax)
    const pts = def.points.map(([x, z]) => [x * YD_TO_M, z * YD_TO_M] as const)
    this.turns = pts.slice(1, -1).map((p, k) => {
      const a = pts[k]!
      const c = pts[k + 2]!
      // Route x points to world -x, so headings are taken in world terms.
      const yIn = Math.atan2(-(p[0] - a[0]), p[1] - a[1])
      const yOut = Math.atan2(-(c[0] - p[0]), c[1] - p[1])
      return angleDiff(yOut, yIn) >= 0 ? 1 : -1
    })
    for (let yd = 5; yd <= 45; yd += 5) this.add(stripe(-20, yd * YD_TO_M, 20, yd * YD_TO_M, 0.08, 0xe9eee9, 0.006))
    this.add(stripe(-20, 0, 20, 0, 0.1, 0x8fb3ff, 0.007))
    runs.forEach((_, i) => {
      const w = pts.map(([x, z]) => this.world(i, x, z))
      for (let k = 0; k + 1 < w.length; k++) this.add(stripe(w[k]!.x, w[k]!.z, w[k + 1]!.x, w[k + 1]!.z, 0.16, colors[i]!))
      w.slice(1).forEach((p) => this.add(disc(p.x, p.z, 0.26, 0xffffff, 0.016)))
    })
    this.duration = ROUTE_SNAP + Math.max(...runs.map((r) => r.time)) + 1.6
    this.loop = false
    const order = [0, 1].sort((x, y) => runs[x]!.time - runs[y]!.time)
    this.captionsList = [
      { at: 0, text: `${def.label}: ${def.description}` },
      { at: ROUTE_SNAP, text: 'Snap.' },
      ...runs[0].breaks.map((b) => ({ at: ROUTE_SNAP + b.atS, text: `Break: a ${Math.round(b.angleDeg)}° cut.` })),
      ...order.map((i) => ({ at: ROUTE_SNAP + runs[i]!.time, text: `${athletes[i]!.name} finishes the route in ${sec(runs[i]!.time)}.` })),
    ].sort((x, y) => x.at - y.at)
    this.render(0)
  }

  /** Lanes either side of the middle; route x runs toward the receiver's sideline (world -x). */
  private world(i: number, x: number, z: number): { x: number; z: number } {
    return { x: (i === 0 ? -1 : 1) * ROUTE_LANE_M - x, z }
  }

  render(t: number): void {
    const rt = t - ROUTE_SNAP
    let cx = 0
    let cz = 0
    this.rigs.forEach((rig, i) => {
      const tr = this.tracks[i]!
      const r = this.runs[i]!
      if (rt <= 0) {
        const s = tr.pts[0]!
        rig.applyPose(rt < -0.6 ? idle(t) : sprintStance(rig.dims), { x: s.x, z: s.z, yaw: 0 })
        cx += s.x
        cz += s.z
        return
      }
      const at = trackAt(tr, Math.min(rt, r.time))
      let x = at.x
      let z = at.z
      let pose: Pose
      if (rt >= r.time) {
        // Ease down past the end of the route.
        const after = Math.min(1.2, rt - r.time)
        const extra = at.speed * (after - (after * after) / 2.4)
        x += Math.sin(at.yaw) * extra
        z += Math.cos(at.yaw) * extra
        const sp = at.speed * Math.max(0, 1 - after / 1.2)
        pose = sp > 0.4 ? runPose(rig, at.dist + extra, sp, this.vmax[i]!) : idle(t)
      } else {
        const k = r.breaks.findIndex((b) => rt >= b.atS - 0.1 && rt <= b.atS + 0.2)
        const brk = r.breaks[k]
        pose = brk ? cut(clamp01((rt - brk.atS + 0.1) / 0.3), rig.dims, this.turns[k] ?? 1) : runPose(rig, at.dist, at.speed, this.vmax[i]!, Math.max(0, 1 - rt / 0.9))
      }
      rig.applyPose(pose, { x, z, yaw: at.yaw })
      cx += x
      cz += z
    })
    this.center.set(cx / 2, 1, cz / 2)
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.center)
  }

  framing(): number {
    return 2.6
  }

  /** High behind the line of scrimmage, looking downfield at both routes. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 11, -13)
  }

  live(t: number): LiveCell[] {
    const rt = t - ROUTE_SNAP
    return this.runs.map((r, i) => {
      const done = rt >= r.time
      const at = trackAt(this.tracks[i]!, clamp(rt, 0, r.time))
      return { label: this.name(i), big: (done ? 0 : at.speed / MPH_TO_MS).toFixed(1), sub: done ? `mph · route done in ${sec(r.time)}` : `mph · ${sec(Math.max(0, rt))}`, quality: 'SIMULATED' }
    })
  }
}

// --- Tackle break -----------------------------------------------------------------------------

const TACKLE_GAP_M = 12
const TACKLE_GO = 1
const CONTACT_SEP = 0.8
const FALLBACK_REP: TackleRep = { outcome: 'tackled', pBreak: 0, pJuke: 0, contactSpeedMs: 6, carrierMomentum: 600, tacklerMomentum: 600, yardsAfterContact: 0 }

/** One representative rep: carrier and tackler close on each other, then the outcome plays out. */
export class TackleStage extends EventStage {
  readonly rep: TackleRep
  readonly repIndex: number
  /** Stage time of contact (or of the miss). */
  readonly contact: number
  private readonly vC: number
  private readonly vT: number
  private readonly tc: number
  private readonly zContact: number
  private readonly lanes: [number, number]
  private readonly ball: HeldProp
  private readonly mid = new THREE.Vector3(0, 1, TACKLE_GAP_M / 2)
  private readonly speeds: [number, number] = [0, 0]

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], result: TackleBreakResult, repIndex: number, layout: StageLayout) {
    super(scene, athletes)
    this.repIndex = Math.max(0, repIndex)
    this.rep = result.reps[this.repIndex] ?? FALLBACK_REP
    this.vC = Math.max(1, this.rep.contactSpeedMs)
    this.vT = Math.max(1, this.rep.tacklerMomentum / massKg(athletes[1]))
    this.tc = closingTime(TACKLE_GAP_M, this.vC, this.vT, CONTACT_SEP)
    this.contact = TACKLE_GO + this.tc
    this.zContact = accelDistance(this.vC, this.tc)
    this.lanes = layout === 'shared' ? [0, 0] : [-0.8, 0.8]
    this.ball = new HeldProp('football', this.group, this.rigs[0]!)
    this.held.push(this.ball)
    this.add(stripe(-6, 0, 6, 0, 0.1, 0x8fb3ff, 0.007))
    this.duration = this.contact + 3.2
    this.loop = false
    const [c, k] = [athletes[0].name, athletes[1].name]
    const yd = this.rep.yardsAfterContact.toFixed(1)
    const outcome =
      this.rep.outcome === 'broken' ? `${c} breaks the tackle: ${yd} yd after contact.` : this.rep.outcome === 'juked' ? `${c} makes ${k} miss: ${yd} yd after the miss.` : `${k} brings him down after ${yd} yd.`
    this.captionsList = [
      { at: 0, text: `Rep ${this.repIndex + 1} of ${result.reps.length}: ${c} with the ball, ${k} to make the stop.` },
      { at: TACKLE_GO, text: 'Go.' },
      ...(this.rep.outcome === 'juked'
        ? [{ at: this.contact - 0.35, text: 'Juke!' }]
        : [{ at: this.contact, text: `Contact: ${this.rep.carrierMomentum.toFixed(0)} against ${this.rep.tacklerMomentum.toFixed(0)} kg·m/s of momentum.` }]),
      { at: this.contact + 0.8, text: outcome },
    ]
    this.render(0)
  }

  render(t: number): void {
    const [cr, tk] = this.rigs as [Rig, Rig]
    const g = t - TACKLE_GO
    const tc = this.tc
    const yac = this.rep.yardsAfterContact * YD_TO_M
    const shared = this.lanes[0] === this.lanes[1]
    const approachT = (x: number) => TACKLE_GAP_M - accelDistance(this.vT, x)
    let cx = this.lanes[0]
    let tx = this.lanes[1]
    let cz = accelDistance(this.vC, g)
    let tz = approachT(g)
    let cPose: Pose
    let tPose: Pose
    let cSpeed = accelSpeed(this.vC, g)
    let tSpeed = accelSpeed(this.vT, g)
    const tYaw = Math.PI
    const approachC = (): Pose => runPose(cr, cz, cSpeed, this.vC, Math.max(0, 1 - g / 0.8), 'footballR')
    const approachTk = (): Pose => runPose(tk, TACKLE_GAP_M - tz, tSpeed, this.vT, Math.max(0, 1 - g / 0.8))
    /** Carrier running on at `v` from (z0 at time g0) to zEnd, then easing to a stop. */
    const runOn = (z0: number, g0: number, v: number, zEnd: number): void => {
      const reach = g0 + Math.max(0, zEnd - z0) / v
      if (g <= reach) {
        cz = z0 + v * (g - g0)
        cSpeed = v
      } else {
        const after = Math.min(1, g - reach)
        cz = Math.max(z0, zEnd) + v * (after - (after * after) / 2)
        cSpeed = v * (1 - after)
      }
    }
    if (g <= 0) {
      cz = 0
      tz = TACKLE_GAP_M
      cSpeed = 0
      tSpeed = 0
      cPose = readyPose(cr.dims, t)
      tPose = readyPose(tk.dims, t + 1)
    } else if (this.rep.outcome === 'juked') {
      const gCut = tc - 0.35
      const gDive = tc - 0.1
      if (g < gCut) cPose = approachC()
      else {
        const zCut = accelDistance(this.vC, gCut)
        runOn(zCut, gCut, 0.8 * this.vC, this.zContact + Math.max(yac, 1.5))
        cx += (shared ? 1.3 : 0.6) * smooth((g - gCut) / 0.4)
        cPose = g < gCut + 0.5 ? cut(clamp01((g - gCut) / 0.5), cr.dims, 1) : cSpeed > 0.4 ? runPose(cr, cz, cSpeed, this.vC, 0, 'footballR') : idle(t)
      }
      if (g < gDive) tPose = approachTk()
      else {
        const k = clamp01((g - gDive) / 0.55)
        tz = approachT(gDive) - 1.6 * smooth(k)
        tSpeed = 0
        tPose = divePose(tk.dims, k)
      }
    } else if (g < tc) {
      cPose = approachC()
      tPose = approachTk()
    } else if (this.rep.outcome === 'broken') {
      const u = g - tc
      if (u < 0.35) {
        cz = this.zContact + 0.45 * this.vC * u
        cSpeed = 0.45 * this.vC
        cPose = runPose(cr, cz, cSpeed, this.vC, 0.7, 'footballR')
      } else {
        const z1 = this.zContact + 0.45 * this.vC * 0.35
        runOn(z1, tc + 0.35, 0.8 * this.vC, Math.max(this.zContact + yac, z1 + 0.5))
        cPose = cSpeed > 0.4 ? runPose(cr, cz, cSpeed, this.vC, 0.2, 'footballR') : idle(t)
      }
      if (shared) cx += 0.6 * smooth(u / 0.4)
      const k = clamp01(u / 0.6)
      tz = approachT(tc) + 0.9 * smooth(k)
      if (shared) tx -= 0.4 * smooth(k)
      tSpeed = 0
      tPose = fallPose(tk.dims, k, -1)
    } else {
      // Tackled: driven yac yards (backward when negative), then both go down that way.
      const u = g - tc
      const drive = smooth(clamp01(u / 0.7))
      const zBoth = this.zContact + yac * drive
      cz = zBoth
      tz = zBoth + CONTACT_SEP * 0.6
      cSpeed = u < 0.7 ? Math.abs(yac) / 0.7 : 0
      tSpeed = 0
      const forward = yac >= 0
      if (u < 0.7) {
        cPose = runPose(cr, cz, Math.max(cSpeed, 1.5), this.vC, 0.6, 'footballR')
        tPose = engagePose(tk.dims, 1, t)
      } else {
        const k = clamp01((u - 0.7) / 0.55)
        cPose = fallPose(cr.dims, k, forward ? 1 : -1)
        tPose = fallPose(tk.dims, k, forward ? -1 : 1)
        tz += (forward ? 0.2 : -0.2) * k
      }
    }
    cr.applyPose(cPose, { x: cx, z: cz, yaw: 0 })
    tk.applyPose(tPose, { x: tx, z: tz, yaw: tYaw })
    this.ball.update(cPose, false)
    this.speeds[0] = cSpeed
    this.speeds[1] = tSpeed
    const together = g < tc ? (cz + tz) / 2 : cz
    this.mid.set((cx + tx) / 2, 1, together)
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.mid)
  }

  framing(): number {
    return 1.7
  }

  live(t: number): LiveCell[] {
    this.render(t)
    const after = t >= this.contact + 0.8
    const outcome = this.rep.outcome === 'tackled' ? 'tackle made' : this.rep.outcome === 'broken' ? 'tackle broken' : 'missed tackle'
    return [0, 1].map((i) => ({ label: this.name(i), big: (this.speeds[i]! / MPH_TO_MS).toFixed(1), sub: after ? `mph · ${outcome}` : i === 0 ? 'mph · ball carrier' : 'mph · tackler', quality: 'SIMULATED' as Quality }))
  }
}

// --- QB accuracy and arm ----------------------------------------------------------------------

const QB_LANE_M = 3.5
const QB_MOTION = 1.3
const CATCH_HEIGHT = 1.3
const FOOTBALL_DRAG = BALLS.football.drag
const Z_AXIS = new THREE.Vector3(0, 0, 1)

interface ThrowSlot {
  k: number
  start: number
  release: number
  arrive: number
  end: number
  long: boolean
}

/** Both passers throw at the same depths in their own lanes, then one throw each for distance. */
export class QbThrowStage extends EventStage {
  private readonly slots: ThrowSlot[] = []
  private readonly flights: Map<number, FlightPath>[]
  private readonly longFlights: FlightPath[]
  private readonly balls: HeldProp[]
  private readonly marks: { mesh: THREE.Object3D; at: number }[] = []
  private readonly view = new THREE.Vector3(0, 1.4, 6)
  private readonly dir = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    athletes: readonly Athlete[],
    readonly accuracy: readonly [QbAccuracyResult, QbAccuracyResult],
    readonly arm: readonly [ArmStrengthResult, ArmStrengthResult],
    colors: readonly [number, number],
  ) {
    super(scene, athletes)
    this.flights = accuracy.map((r, i) => {
      const map = new Map<number, FlightPath>()
      for (const d of r.byDepth) {
        const speed = (r.throws[0]?.velocityMph ?? this.arm[i]!.velocityMph) * MPH_TO_MS
        // Release 0.7 m above catch height, as in the accuracy model.
        map.set(d.depthYd, flight(speed, d.launchDeg, FOOTBALL_DRAG, 0.7))
      }
      return map
    })
    this.longFlights = arm.map((r) => flight(r.velocityMph * MPH_TO_MS, r.angleDeg, FOOTBALL_DRAG, 2))
    this.balls = this.rigs.map((rig) => new HeldProp('football', this.group, rig))
    this.held.push(...this.balls)
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 })
    for (let i = 0; i < 2; i++) {
      for (const d of accuracy[i]!.byDepth) {
        for (const r of [0.5, 1, 1.5]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 6, 40), ringMat)
          ring.position.set(this.laneX(i), CATCH_HEIGHT, d.depthYd * YD_TO_M)
          this.add(ring)
        }
      }
    }
    const n = Math.min(accuracy[0].throws.length, accuracy[1].throws.length)
    let t = 0.6
    for (let k = 0; k < n; k++) {
      const air = Math.max(...[0, 1].map((i) => this.throwFlight(i, k)?.time ?? 1))
      const release = t + QB_MOTION * RELEASE_AT.football
      this.slots.push({ k, start: t, release, arrive: release + air, end: release + air + 0.7, long: false })
      t = release + air + 0.7
    }
    const longAir = Math.max(...this.longFlights.map((f) => f.time))
    const release = t + QB_MOTION * RELEASE_AT.football
    this.slots.push({ k: n, start: t, release, arrive: release + longAir, end: release + longAir + 1.6, long: true })
    this.duration = release + longAir + 1.6
    this.loop = false
    // Where each throw ended up: a dot on the target face, or on the turf when it fell short.
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: colors[i]!, roughness: 0.4 })
      accuracy[i]!.throws.slice(0, n).forEach((th, k) => {
        const slot = this.slots[k]!
        const short = !th.inRange
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat)
        const reach = this.throwFlight(i, k)?.distance ?? 0
        mesh.position.set(this.laneX(i) + th.dx, short ? 0.07 : CATCH_HEIGHT + th.dy, short ? reach : th.depthYd * YD_TO_M - 0.05)
        mesh.visible = false
        this.marks.push({ mesh: this.add(mesh), at: slot.arrive })
      })
      const lf = this.longFlights[i]!
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colors[i]! }))
      ring.position.set(this.laneX(i), 0.02, lf.distance)
      ring.visible = false
      const label = textPlane(`${(lf.distance / YD_TO_M).toFixed(0)} yd`, 0.6, '#ffffff')
      label.position.set(this.laneX(i), 0.03, lf.distance + 1.3)
      label.rotation.z = Math.PI
      label.visible = false
      const at = this.slots[this.slots.length - 1]!.arrive - (longAir - lf.time)
      this.marks.push({ mesh: this.add(ring), at }, { mesh: this.add(label), at })
    }
    const names = athletes.map((a) => a.name)
    this.captionsList = this.slots.flatMap((s) => {
      if (s.long) {
        return [
          { at: s.start, text: 'Last throw: as far as he can.' },
          { at: s.arrive, text: `Longest carry: ${names[0]} ${arm[0].maxDistanceYd.toFixed(0)} yd, ${names[1]} ${arm[1].maxDistanceYd.toFixed(0)} yd.` },
        ]
      }
      const a = accuracy[0].throws[s.k]!
      const b = accuracy[1].throws[s.k]!
      const pts = (x: typeof a) => (!x.inRange ? 'short of the target' : x.points ? `${x.points} pts` : 'a miss')
      return [
        { at: s.start, text: `Throw ${s.k + 1} of ${n}: target at ${a.depthYd} yards.` },
        { at: s.arrive, text: `${names[0]}: ${pts(a)}. ${names[1]}: ${pts(b)}.` },
      ]
    })
    this.render(0)
  }

  private laneX(i: number): number {
    return (i === 0 ? -1 : 1) * QB_LANE_M
  }

  private throwFlight(i: number, k: number): FlightPath | undefined {
    const th = this.accuracy[i]?.throws[k]
    return th ? this.flights[i]?.get(th.depthYd) : undefined
  }

  private slotAt(t: number): ThrowSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? (t >= this.duration ? this.slots[this.slots.length - 1] : undefined)
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    this.rigs.forEach((rig, i) => {
      const base = { x: this.laneX(i), z: 0, yaw: 0 }
      if (!slot) {
        const pose = idle(t + i)
        rig.applyPose(pose, base)
        this.balls[i]!.update(pose, false)
        return
      }
      const pose = throwMotion(clamp((t - slot.start) / QB_MOTION, 0, 0.999), rig.dims, rig.athlete.movement.throw, 'football')
      rig.applyPose(pose, base)
      this.balls[i]!.update(pose, false, (s, from, obj) => this.fly(i, slot, s, from, obj), t - slot.release)
    })
    for (const m of this.marks) m.mesh.visible = t >= m.at
    if (slot) {
      const reach = slot.long ? Math.max(...this.longFlights.map((f) => f.distance)) : (this.accuracy[0].throws[slot.k]?.depthYd ?? 10) * YD_TO_M
      const k = clamp01((t - slot.release) / Math.max(0.1, slot.arrive - slot.release))
      this.view.set(0, 1.4, 4 + (reach * 0.5 - 4) * k)
    }
  }

  /** Ball position s seconds after release; false hides it. */
  private fly(i: number, slot: ThrowSlot, s: number, from: THREE.Vector3, obj: THREE.Object3D): boolean {
    if (slot.long) {
      const f = this.longFlights[i]!
      if (s > f.time + 1.2) return false
      const k = clamp01(s / f.time)
      const [px, py] = pathPoint(f, s)
      obj.position.set(this.laneX(i), Math.max(0.1, py + (from.y - 2) * (1 - k)), from.z + px)
      this.orient(obj, f, s)
      return true
    }
    const th = this.accuracy[i]!.throws[slot.k]
    const f = this.throwFlight(i, slot.k)
    if (!th || !f) return false
    if (s > f.time + 0.9) return false
    const k = clamp01(s / f.time)
    const [px, py] = pathPoint(f, s)
    const dM = th.depthYd * YD_TO_M
    const endZ = th.inRange ? dM : f.distance
    let y = CATCH_HEIGHT + py + (from.y - 2) * (1 - k) + (th.inRange ? th.dy * k : 0)
    let z = from.z + (px * (endZ - from.z)) / (f.distance || 1)
    if (s > f.time) {
      // Past the target: the ball drops to the turf.
      const after = s - f.time
      y = Math.max(0.12, y - 4.9 * after * after - 1.5 * after)
      z += after * 1.5
    }
    obj.position.set(this.laneX(i) + th.dx * k, y, z)
    this.orient(obj, f, Math.min(s, f.time))
    return true
  }

  private orient(obj: THREE.Object3D, f: FlightPath, s: number): void {
    const [x0, y0] = pathPoint(f, s)
    const [x1, y1] = pathPoint(f, s + PATH_DT)
    this.dir.set(0, y1 - y0, x1 - x0)
    if (this.dir.lengthSq() > 1e-8) obj.quaternion.setFromUnitVectors(Z_AXIS, this.dir.normalize())
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.view)
  }

  framing(): number {
    return 2
  }

  /** Raised and to the side of the passers, looking down the lanes. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(12, 7, -7)
  }

  live(t: number): LiveCell[] {
    const n = this.slots.length - 1
    return [0, 1].map((i) => {
      const r = this.accuracy[i]!
      const pts = r.throws.slice(0, n).reduce((s, th, k) => s + (this.slots[k]!.arrive <= t ? th.points : 0), 0)
      const done = this.slots.filter((s) => !s.long && s.arrive <= t).length
      return { label: this.name(i), big: String(pts), sub: `pts · ${done} of ${n} throws`, quality: 'SIMULATED' as Quality }
    })
  }
}

// --- Pass rush --------------------------------------------------------------------------------

const RUSH_START = 0.6
const QB_SPOT_Z = -7
const ENGAGE_GAP = 0.85
const RUSHER_Z0 = 1
const BLOCKER_Z0 = -0.8

interface RushSlot {
  k: number
  snap: number
  engage: number
  /** Seconds after the snap the rusher sheds the block, null when the blocker holds. */
  shed: number | null
  reach: number
  end: number
  from: { x: number; z: number }
}

/** Rep after rep at the line: get-off, hand fight, and either a path to the quarterback spot or a stalemate. */
export class PassRushStage extends EventStage {
  private readonly slots: RushSlot[] = []
  private readonly vR: number
  private readonly lanes: [number, number]
  private readonly qbX: number
  private readonly view = new THREE.Vector3(0, 1, -2)

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly result: PassRushResult, layout: StageLayout) {
    super(scene, athletes)
    this.vR = sprintProfile(athletes[0]).vmax * 0.7
    this.lanes = layout === 'shared' ? [0, 0] : [0.75, -0.75]
    this.qbX = 0
    this.add(stripe(-6, 0.1, 6, 0.1, 0.1, 0x8fb3ff, 0.007))
    this.add(disc(this.qbX, QB_SPOT_Z, 0.6, 0xff7a2f))
    this.add(cone(this.qbX + 0.9, QB_SPOT_Z))
    this.add(cone(this.qbX - 0.9, QB_SPOT_Z))
    const label = textPlane('QB', 0.45, '#ffffff')
    label.position.set(this.qbX, 0.02, QB_SPOT_Z - 1)
    label.rotation.z = Math.PI
    this.add(label)
    // Engagement: the first moment the rusher's charge meets the blocker's kick-step.
    let engage = 0.8
    for (let s = 0; s < 2; s += 1 / 120) {
      if (this.rusherZ(s) - this.blockerZ(s) <= ENGAGE_GAP) {
        engage = s
        break
      }
    }
    let t = RUSH_START
    result.reps.forEach((rep, k) => {
      const snap = t + 0.7
      const shed = rep.win && rep.timeToWinS !== null ? Math.max(rep.timeToWinS, engage + 0.25) : null
      const shedZ = this.blockerZ(shed ?? engage) + ENGAGE_GAP
      const off = rep.move === 'speed' ? 1 : rep.move === 'counter' ? -0.8 : 0.5
      const from = { x: this.lanes[0] + off, z: shedZ - 0.4 }
      const run = Math.hypot(from.x - this.qbX, from.z - QB_SPOT_Z) / 6.5
      const reach = shed === null ? RUSH_WINDOW_S : shed + 0.3 + run
      const end = snap + reach + 0.9
      this.slots.push({ k, snap, engage, shed, reach, end, from })
      t = end
    })
    this.duration = t + 0.3
    this.loop = false
    const [r, b] = [athletes[0].name, athletes[1].name]
    this.captionsList = this.slots.flatMap((s) => {
      const rep = result.reps[s.k]!
      return [
        { at: s.snap - 0.7, text: `Rep ${s.k + 1} of ${result.reps.length}.` },
        { at: s.snap, text: 'Snap.' },
        s.shed === null
          ? { at: s.snap + RUSH_WINDOW_S, text: `${b} holds to ${RUSH_WINDOW_S.toFixed(1)} s: ball out.` }
          : { at: s.snap + s.shed, text: `${MOVE_LABEL[rep.move]} by ${r} wins at ${sec(rep.timeToWinS ?? s.shed)}.` },
      ]
    })
    this.render(0)
  }

  private rusherZ(s: number): number {
    return RUSHER_Z0 - accelDistance(this.vR, s)
  }

  private blockerZ(s: number): number {
    return BLOCKER_Z0 - 1.4 * smooth(s / 0.6)
  }

  render(t: number): void {
    const [ru, bl] = this.rigs as [Rig, Rig]
    const slot = this.slots.find((s) => t < s.end) ?? this.slots[this.slots.length - 1]
    const rx0 = this.lanes[0]
    const bx0 = this.lanes[1]
    if (!slot || t < slot.snap) {
      ru.applyPose(sprintStance(ru.dims), { x: rx0, z: RUSHER_Z0, yaw: Math.PI })
      bl.applyPose(readyPose(bl.dims, t), { x: bx0, z: BLOCKER_Z0, yaw: 0 })
      return
    }
    const s = t - slot.snap
    const rep = this.result.reps[slot.k]!
    const engaged = Math.min(s, slot.engage)
    let rx = rx0
    let rz = this.rusherZ(engaged)
    let bx = bx0
    let bz = this.blockerZ(Math.min(s, slot.engage))
    let rYaw = Math.PI
    let bYaw = 0
    let rPose: Pose
    let bPose: Pose
    const window = slot.shed ?? RUSH_WINDOW_S
    if (s < slot.engage) {
      rz = this.rusherZ(s)
      bz = this.blockerZ(s)
      rPose = runPose(ru, RUSHER_Z0 - rz, accelSpeed(this.vR, s), this.vR / 0.7, Math.max(0, 1 - s / 0.6))
      bPose = readyPose(bl.dims, t * 3)
    } else if (s < window) {
      const drive = rep.move === 'power' && slot.shed !== null ? 0.5 * (s - slot.engage) : 0
      bz = this.blockerZ(slot.engage) - drive
      rz = bz + ENGAGE_GAP
      rPose = engagePose(ru.dims, 0.6 + 0.4 * Math.sin(t * 5), t)
      bPose = engagePose(bl.dims, 0.5, t + 0.3)
    } else if (slot.shed === null) {
      // The blocker held: both straighten up as the ball comes out.
      bz = this.blockerZ(slot.engage)
      rz = bz + ENGAGE_GAP
      rPose = idle(t)
      bPose = idle(t + 1)
    } else {
      const u = s - slot.shed
      const drive = rep.move === 'power' ? 0.5 * (slot.shed - slot.engage) : 0
      bz = this.blockerZ(slot.engage) - drive
      if (u < 0.3) {
        // Shedding the block: around the edge, through him, or a spin back inside.
        const k = u / 0.3
        rx = lerp(rx0, slot.from.x, smooth(k))
        rz = lerp(bz + ENGAGE_GAP, slot.from.z, smooth(k))
        if (rep.move === 'counter') rYaw = Math.PI + 2 * Math.PI * smooth(k)
        rPose = rep.move === 'power' ? engagePose(ru.dims, 1, t) : cut(k, ru.dims, rep.move === 'speed' ? -1 : 1)
      } else {
        const run = Math.hypot(slot.from.x - this.qbX, slot.from.z - QB_SPOT_Z)
        const k = clamp01(((u - 0.3) * 6.5) / Math.max(0.1, run))
        rx = lerp(slot.from.x, this.qbX + 0.3, k)
        rz = lerp(slot.from.z, QB_SPOT_Z + 0.5, k)
        rYaw = Math.atan2(this.qbX - slot.from.x, QB_SPOT_Z - slot.from.z)
        rPose = k < 1 ? runPose(ru, k * run, 6.5, this.vR / 0.7) : idle(t)
      }
      bPose = rep.move === 'power' ? fallPose(bl.dims, clamp01(u / 0.6), -1) : readyPose(bl.dims, t)
      if (rep.move !== 'power') bYaw = Math.atan2(rx - bx, rz - bz) * smooth(clamp01(u / 0.4))
      bx = bx0
    }
    ru.applyPose(rPose, { x: rx, z: rz, yaw: rYaw })
    bl.applyPose(bPose, { x: bx, z: bz, yaw: bYaw })
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.view)
  }

  framing(): number {
    return 1.6
  }

  live(t: number): LiveCell[] {
    const done = this.slots.filter((s) => s.snap + (s.shed ?? RUSH_WINDOW_S) <= t)
    const wins = done.filter((s) => s.shed !== null).length
    return [
      { label: this.name(0), big: String(wins), sub: `rushes won of ${done.length}`, quality: 'SIMULATED' },
      { label: this.name(1), big: String(done.length - wins), sub: `blocks held of ${done.length}`, quality: 'SIMULATED' },
    ]
  }
}

// --- Iso possessions --------------------------------------------------------------------------

const ISO_TOP = { x: 0, z: 8.2 }
const ISO_SLOT_S = 3.5

interface IsoSlot {
  half: 0 | 1
  k: number
  poss: IsoPossession
  start: number
  path: { x: number; z: number }[]
  edge: number
}

/** Isolation possessions both ways at one hoop: setup, the move, then the shot, foul or turnover. */
export class IsoStage extends EventStage {
  private readonly slots: IsoSlot[] = []
  private readonly ball: THREE.Mesh
  private readonly from = new THREE.Vector3()
  private readonly offset: number
  private readonly tmp = new THREE.Vector3()

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly halves: readonly [IsoResult, IsoResult], layout: StageLayout) {
    super(scene, athletes)
    this.offset = layout === 'split' ? 1.1 : 0
    this.ball = this.add(makeBasketball())
    let t = 0.4
    halves.forEach((h, half) => {
      h.possessions.forEach((poss, k) => {
        this.slots.push({ half: half as 0 | 1, k, poss, start: t, path: isoPath(poss), edge: h.edge })
        t += ISO_SLOT_S
      })
    })
    this.duration = t + 0.3
    this.loop = false
    const names = athletes.map((a) => a.name)
    this.captionsList = this.slots.flatMap((s) => {
      const handler = names[s.half]!
      const defender = names[1 - s.half]!
      const p = s.poss
      const text = p.result === 'make3' ? 'Three!' : p.result === 'make2' ? 'Two points.' : p.result === 'miss' ? 'Miss.' : p.result === 'turnover' ? `Turnover: ${defender} takes it.` : `Shooting foul: ${p.points} of ${ZONES[p.zone].three ? 3 : 2} free throws.`
      return [
        { at: s.start, text: `${handler} with the ball against ${defender}: ${ISO_MOVES[p.move].label.toLowerCase()}, possession ${s.k + 1} of ${halves[s.half]!.possessions.length}.` },
        { at: s.start + (p.result === 'turnover' ? 1.5 : 2.95), text },
      ]
    })
    this.render(0)
  }

  private slotAt(t: number): IsoSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.start + ISO_SLOT_S) ?? (t >= this.duration - 0.31 ? this.slots[this.slots.length - 1] : this.slots[0])
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    if (!slot) return
    const hi = slot.half
    const handler = this.rigs[hi]!
    const defender = this.rigs[1 - hi]!
    const s = clamp(t - slot.start, 0, ISO_SLOT_S)
    const p = slot.poss
    const move = clamp01((s - 0.5) / 1.3)
    const at = pathAt(slot.path, smooth(move))
    const yawToRim = (x: number, z: number) => Math.atan2(-x, -z)
    // Handler.
    let hPose: Pose
    const shooting = p.result !== 'turnover' && s >= 1.8
    if (s < 0.5) hPose = readyPose(handler.dims, t)
    else if (!shooting) {
      const nearCut = p.move === 'crossover' && Math.abs(move - 0.45) < 0.12
      hPose = nearCut ? cut(clamp01((move - 0.33) / 0.24), handler.dims, at.x > 0 ? 1 : -1) : runPose(handler, move * at.len, 5, 8)
    } else hPose = shoot(clamp01((s - 1.8) / 1.1), handler.dims, handler.athlete.movement.shoot)
    handler.applyPose(hPose, { x: at.x, z: at.z, yaw: yawToRim(at.x, at.z) })
    // Defender: between the handler and the rim, trailing more when the handler has the edge.
    const lag = clamp(0.18 + 0.08 * slot.edge, 0.05, 0.4)
    const behind = pathAt(slot.path, smooth(clamp01((s - 0.5 - lag) / 1.3)))
    const toRim = Math.hypot(behind.x, behind.z) || 1
    let dx = behind.x - (behind.x / toRim) * 1.05 + this.offset
    let dz = behind.z - (behind.z / toRim) * 1.05
    let dPose: Pose = defendPose(defender.dims, t)
    if (shooting) {
      const u = clamp01((s - 1.85) / 1.0)
      dPose = jump(u, defender.dims, { height: 0.3, sig: defender.athlete.movement.jump })
    }
    if (p.result === 'turnover' && s >= 1.5) {
      // The ball comes loose toward the sideline and the defender picks it up.
      const k = clamp01((s - 1.5) / 0.7)
      dx = lerp(dx, at.x + 2.2, smooth(k))
      dz = lerp(dz, at.z + 0.6, smooth(k))
      dPose = k < 1 ? runPose(defender, k * 2.3, 4, 8) : idle(t)
    }
    defender.applyPose(dPose, { x: dx, z: dz, yaw: Math.atan2(at.x - dx, at.z - dz) })
    // Ball.
    handler.root.updateMatrixWorld(true)
    const hand = handler.jointWorld('wristR', this.tmp)
    if (p.result === 'turnover' && s >= 1.5) {
      const k = clamp01((s - 1.5) / 0.7)
      this.ball.position.set(lerp(hand.x, at.x + 2.4, k), Math.max(0.12, lerp(hand.y, 0.12, k * 2)), lerp(hand.z, at.z + 0.9, k))
      if (k >= 1) {
        defender.root.updateMatrixWorld(true)
        defender.jointWorld('wristR', this.ball.position)
      }
      return
    }
    const release = 1.8 + 1.1 * SHOT_RELEASE_AT
    if (!shooting || s < release) {
      if (shooting) {
        const other = handler.jointWorld('wristL', new THREE.Vector3())
        this.ball.position.copy(hand).add(other).multiplyScalar(0.5)
        this.ball.position.y += 0.05
      } else {
        // Dribble: hand to floor and back.
        const bounce = Math.abs(Math.sin(t * 7))
        this.ball.position.set(hand.x, lerp(0.12, Math.max(0.3, hand.y - 0.1), bounce), hand.z)
      }
      this.from.copy(this.ball.position)
      return
    }
    const made = p.result === 'make2' || p.result === 'make3'
    const target = made ? RIM : this.tmp.set(0.18 * (slot.k % 2 ? 1 : -1), 3.08, 0.2)
    const k = clamp01((s - release) / 0.8)
    if (k < 1) arcPoint(this.from, target, k, 1.1, this.ball.position)
    else {
      const a = s - release - 0.8
      if (made) this.ball.position.set(0, Math.max(0.12, 3.05 - 4.9 * a * a - 1.5 * a), 0)
      else this.ball.position.set(target.x + 2 * a * Math.sign(target.x), Math.max(0.12, 3.08 + 1.4 * a - 4.9 * a * a), target.z + 1.5 * a)
    }
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1.5, 4.2)
  }

  /** From above the top of the key, toward the hoop. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(5, 5.5, 9)
  }

  framing(): number {
    return 1.8
  }

  live(t: number): LiveCell[] {
    return [0, 1].map((i) => {
      const mine = this.slots.filter((s) => s.half === i && s.start + 2.95 <= t)
      return { label: this.name(i), big: String(mine.reduce((sum, s) => sum + s.poss.points, 0)), sub: `pts · ${mine.length} of ${this.halves[i]!.possessions.length} possessions`, quality: 'SIMULATED' as Quality }
    })
  }
}

/** The handler's route for a move: from the top of the key, via one waypoint, to the shot spot. */
function isoPath(p: IsoPossession): { x: number; z: number }[] {
  const z = ZONES[p.zone]
  const spot = { x: z.x, z: Math.max(0.9, z.y) }
  const side = spot.x === 0 ? 1 : Math.sign(spot.x)
  switch (p.move) {
    case 'crossover':
      return [ISO_TOP, { x: -side * 1.5, z: 6.8 }, spot]
    case 'step-back':
      return [ISO_TOP, { x: spot.x * 0.7, z: spot.z * 0.7 + 0.6 }, spot]
    case 'drive':
      return [ISO_TOP, { x: side * 1.1, z: 4.6 }, spot]
    default:
      return [ISO_TOP, { x: spot.x * 0.5, z: (ISO_TOP.z + spot.z) / 2 }, spot]
  }
}

function pathAt(path: readonly { x: number; z: number }[], k: number): { x: number; z: number; len: number } {
  const legs = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.z - path[i]!.z))
  const len = legs.reduce((s, x) => s + x, 0)
  let d = clamp01(k) * len
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!
    if (d <= leg || i === legs.length - 1) {
      const a = path[i]!
      const b = path[i + 1]!
      const f = leg ? clamp01(d / leg) : 1
      return { x: lerp(a.x, b.x, f), z: lerp(a.z, b.z, f), len }
    }
    d -= leg
  }
  const last = path[path.length - 1]!
  return { x: last.x, z: last.z, len }
}

// --- Dunk contest -----------------------------------------------------------------------------

type DunkRoundResult = DunkContestResult['entries'][number]['rounds'][number]

interface DunkSlot {
  entry: 0 | 1
  round: number
  attempt: number
  r: DunkRoundResult
  made: boolean
  start: number
  jump: number
  jumpLen: number
  end: number
  takeoffZ: number
  forward: number
  side: number
}

const DUNK_APPROACH_S = 1

/** Turns at one hoop: approach, takeoff, the dunk (or the miss), and the judges' scores. */
export class DunkStage extends EventStage {
  private readonly slots: DunkSlot[] = []
  private readonly ball: THREE.Mesh
  private readonly from = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly verticals: number[]

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly result: DunkContestResult) {
    super(scene, athletes)
    this.ball = this.add(makeBasketball())
    this.verticals = result.entries.map((e) => e.check.verticalIn * IN_TO_M)
    const rounds = Math.max(...result.entries.map((e) => e.rounds.length), 0)
    let t = 0.4
    for (let round = 0; round < rounds; round++) {
      result.entries.forEach((e, entry) => {
        const r = e.rounds[round]
        if (!r) return
        const v = this.verticals[entry] ?? 0.7
        const hang = 2 * Math.sqrt((2 * Math.max(0.2, v)) / G)
        const jumpLen = clamp(hang / 0.4, 1.2, 2.4)
        const ftLine = r.dunk === 'free-throw-line'
        for (let attempt = 1; attempt <= r.attempts; attempt++) {
          const last = attempt === r.attempts
          const start = t
          const jumpAt = start + DUNK_APPROACH_S
          const end = jumpAt + jumpLen + 0.6 + (last ? 1.1 : 0)
          this.slots.push({ entry: entry as 0 | 1, round, attempt, r, made: last && r.made, start, jump: jumpAt, jumpLen, end, takeoffZ: ftLine ? 4.4 : 1.9, forward: ftLine ? 3.4 : 1.2, side: round % 2 ? 1.6 : -1.6 })
          t = end
        }
      })
    }
    this.duration = t + 0.3
    this.loop = false
    const names = athletes.map((a) => a.name)
    this.captionsList = this.slots.flatMap((s) => {
      const land = s.jump + s.jumpLen * 0.85
      const out = [
        { at: s.start, text: `${names[s.entry]}, round ${s.round + 1}: ${s.r.label}${s.attempt > 1 ? `, attempt ${s.attempt}` : ''}.` },
        { at: land, text: s.made ? (s.r.dunk === 'layup' ? 'The layup drops.' : 'Down!') : 'No good.' },
      ]
      if (s.attempt === s.r.attempts) out.push({ at: s.end - 1, text: `Judges: ${s.r.judges.join(', ')}, total ${s.r.total}.` })
      return out
    })
    this.render(0)
  }

  private slotAt(t: number): DunkSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? (t >= this.duration - 0.31 ? this.slots[this.slots.length - 1] : this.slots[0])
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    this.rigs.forEach((rig, i) => {
      if (!slot || slot.entry !== i) rig.applyPose(idle(t + i), { x: -5.4, z: -0.4 + i * 1.2, yaw: Math.PI / 2 })
    })
    if (!slot) return
    const rig = this.rigs[slot.entry]!
    const s = t - slot.start
    const start = { x: slot.side, z: slot.takeoffZ + 5.6 }
    let pose: Pose
    let x = 0
    let z = slot.takeoffZ
    if (s < DUNK_APPROACH_S) {
      const k = s / DUNK_APPROACH_S
      x = lerp(start.x, 0, k)
      z = lerp(start.z, slot.takeoffZ, k)
      pose = runPose(rig, k * 5.8, 4 + 3 * k, 8, Math.max(0, 0.5 - k))
    } else {
      const u = clamp((s - DUNK_APPROACH_S) / slot.jumpLen, 0, 0.999)
      const layup = slot.r.dunk === 'layup'
      pose = jump(u, rig.dims, { height: this.verticals[slot.entry] ?? 0.6, sig: { ...rig.athlete.movement.jump, takeoff: 'one-foot' }, forward: slot.forward })
      const flying = clamp01((u - 0.42) / 0.4)
      if (!layup) styleDunk(pose, slot.r.dunk, flying)
    }
    rig.applyPose(pose, { x, z, yaw: Math.PI })
    // Ball: right hand on the run, both hands in the air, then through the rim or off it.
    rig.root.updateMatrixWorld(true)
    const release = DUNK_APPROACH_S + slot.jumpLen * (slot.r.dunk === 'layup' ? 0.55 : 0.62)
    if (s < release) {
      rig.jointWorld('wristR', this.ball.position)
      if (s >= DUNK_APPROACH_S) this.ball.position.add(rig.jointWorld('wristL', this.tmp)).multiplyScalar(0.5)
      this.ball.position.y -= 0.06
      this.from.copy(this.ball.position)
      return
    }
    const flightS = slot.r.dunk === 'layup' ? 0.45 : 0.12
    const a = s - release
    const target = slot.made ? RIM : this.tmp.set(0.05, 3.1, 0.24)
    if (a < flightS) arcPoint(this.from, target, a / flightS, slot.r.dunk === 'layup' ? 0.5 : 0, this.ball.position)
    else {
      const b = a - flightS
      if (slot.made) this.ball.position.set(0, Math.max(0.12, 3.05 - 4.9 * b * b - 1.2 * b), 0.02)
      else this.ball.position.set(target.x + 0.8 * b, Math.max(0.12, target.y + 1.6 * b - 4.9 * b * b), target.z + 1.8 * b)
    }
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 2, 2.4)
  }

  framing(): number {
    return 1.6
  }

  live(t: number): LiveCell[] {
    return this.result.entries.map((e, i) => {
      const scored = this.slots.filter((s) => s.entry === i && s.attempt === s.r.attempts && s.end - 1 <= t)
      return { label: this.name(i), big: String(scored.reduce((sum, s) => sum + s.r.total, 0)), sub: `judges’ points · ${scored.length} of ${e.rounds.length} rounds`, quality: 'SIMULATED' as Quality }
    })
  }
}

/** Dress a jump pose up as the named dunk (k 0..1 through the flight). */
function styleDunk(p: Pose, dunk: DunkRoundResult['dunk'], k: number): void {
  if (k <= 0) return
  const u = smooth(k)
  switch (dunk) {
    case '360':
      p.root.yaw += 2 * Math.PI * u
      break
    case 'reverse':
      p.root.yaw += Math.PI * u
      break
    case 'windmill': {
      const flex = 170 + 360 * u
      setJ(p, 'shoulderR', -flex, 0, -10)
      break
    }
    case 'tomahawk':
      setJ(p, 'shoulderR', -(170 + 40 * Math.sin(Math.PI * u)), 0, -10)
      setJ(p, 'elbowR', -(60 * Math.sin(Math.PI * u)))
      break
    case 'between-the-legs':
      setJ(p, 'hipL', -80 * Math.sin(Math.PI * u))
      setJ(p, 'hipR', -80 * Math.sin(Math.PI * u))
      setJ(p, 'kneeL', 90 * Math.sin(Math.PI * u))
      setJ(p, 'kneeR', 90 * Math.sin(Math.PI * u))
      break
    default:
      break
  }
}

// --- Home to first ----------------------------------------------------------------------------

const DIAG = Math.SQRT1_2
/** First base on the diamond environment: 90 ft up the line toward -X. */
const FIRST_BASE = { x: -HOME_TO_FIRST_M * DIAG, z: HOME_TO_FIRST_M * DIAG }
const THIRD_BASE = { x: HOME_TO_FIRST_M * DIAG, z: HOME_TO_FIRST_M * DIAG }
const H2F_CONTACT = 1.4
const SWING_S = 1.2

/** Swing, drop the bat, run 90 feet: two batters side by side down the first-base line. */
export class HomeToFirstStage extends EventStage {
  private readonly bats: HeldProp[]
  private readonly starts: { x: number; z: number }[]
  private readonly ends: { x: number; z: number }[]
  private readonly breakAt: number[]
  private readonly arrive: number[]
  private readonly scale: number[]
  private readonly view = new THREE.Vector3(-6, 1, 6)
  private readonly progress: number[] = [0, 0]

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly runs: readonly [HomeToFirst, HomeToFirst], readonly sprints: readonly [SprintRow, SprintRow]) {
    super(scene, athletes)
    this.add(bag(FIRST_BASE.x, FIRST_BASE.z))
    this.bats = this.rigs.map((rig) => new HeldProp('bat', this.group, rig))
    this.held.push(...this.bats)
    // Each runner gets his own lane either side of the line: lanes are offset across it.
    const across = [-0.7, 0.7]
    this.starts = runs.map((r, i) => ({ x: (r.batsLeft ? -0.95 : 0.95) + (r.batsLeft === runs[1 - i]!.batsLeft ? across[i]! * 0.5 : 0), z: 0.15 }))
    this.ends = across.map((o) => ({ x: FIRST_BASE.x + o * DIAG, z: FIRST_BASE.z + o * DIAG }))
    this.breakAt = runs.map((r) => H2F_CONTACT + (r.batsLeft ? SWING_FINISH.left : SWING_FINISH.right))
    this.arrive = runs.map((r) => H2F_CONTACT + r.time)
    // Measured times are matched by time-scaling the sprint model's shape.
    this.scale = runs.map((_, i) => sprints[i]!.time / Math.max(0.5, this.arrive[i]! - this.breakAt[i]!))
    this.duration = Math.max(...this.arrive) + 1.6
    this.loop = false
    const order = [0, 1].sort((x, y) => runs[x]!.time - runs[y]!.time)
    this.captionsList = [
      { at: 0, text: 'Both batters in the box.' },
      { at: H2F_CONTACT, text: 'Contact.' },
      ...order.map((i) => ({ at: this.arrive[i]!, text: `${athletes[i]!.name} reaches first in ${sec(runs[i]!.time)}.` })),
    ]
    this.render(0)
  }

  render(t: number): void {
    let cx = 0
    let cz = 0
    this.rigs.forEach((rig, i) => {
      const r = this.runs[i]!
      const s0 = this.starts[i]!
      const e = this.ends[i]!
      const left = r.batsLeft
      const sw = (t - (H2F_CONTACT - CONTACT_AT * SWING_S)) / SWING_S
      if (t < this.breakAt[i]!) {
        let pose = swing(clamp(sw, 0, 0.999), rig.dims, rig.athlete.movement.swing)
        if (left) pose = mirror(pose)
        rig.applyPose(pose, { x: s0.x, z: s0.z, yaw: left ? Math.PI / 2 : -Math.PI / 2 })
        this.bats[i]!.update(pose, left)
        this.progress[i] = 0
        cx += s0.x
        cz += s0.z
        return
      }
      // The bat stays where it was dropped, flat on the dirt.
      const batObj = this.bats[i]!.object
      batObj.position.set(s0.x * 0.6, 0.035, 0.7)
      batObj.rotation.set(Math.PI / 2, 0, left ? 0.6 : -0.6)
      const len = Math.hypot(e.x - s0.x, e.z - s0.z)
      const yaw = Math.atan2(e.x - s0.x, e.z - s0.z)
      const runT = (t - this.breakAt[i]!) * this.scale[i]!
      const sp = this.sprints[i]!
      let d: number
      let v: number
      if (t < this.arrive[i]!) {
        const st = stateAt(sp.samples, runT)
        d = (st.distance / HOME_TO_FIRST_M) * len
        v = st.speed / this.scale[i]!
      } else {
        // Run through the bag and ease up.
        const after = Math.min(1.4, t - this.arrive[i]!)
        const vEnd = (sp.samples[sp.samples.length - 1]?.speed ?? 7) / this.scale[i]!
        d = len + vEnd * (after - (after * after) / 2.8)
        v = vEnd * Math.max(0, 1 - after / 1.4)
      }
      this.progress[i] = Math.min(1, d / len)
      const x = s0.x + Math.sin(yaw) * d
      const z = s0.z + Math.cos(yaw) * d
      const pose = v > 0.4 ? runPose(rig, d, v, sp.profile.vmax, Math.max(0, 1 - runT / 1)) : idle(t)
      rig.applyPose(pose, { x, z, yaw })
      cx += x
      cz += z
    })
    this.view.set(cx / 2, 1, cz / 2)
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.view)
  }

  framing(): number {
    return 2
  }

  /** From the infield side of the line, square to the runners. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(8, 6, 8)
  }

  live(t: number): LiveCell[] {
    return this.runs.map((r, i) => {
      const done = t >= this.arrive[i]!
      return { label: this.name(i), big: done ? sec(r.time) : sec(Math.max(0, t - H2F_CONTACT)), sub: done ? 'safe at first' : `${Math.round(this.progress[i]! * 90)} of 90 ft`, quality: done ? r.quality : 'SIMULATED' }
    })
  }
}

const SWING_FINISH = { left: 0.25, right: 0.35 } as const

// --- Outfield arm -----------------------------------------------------------------------------

const BASEBALL_DRAG = BALLS.baseball.drag
const OF_CATCH_S = 0.9

interface ArmSlot {
  k: number
  start: number
  catchAt: number
  end: number
}

/** Catch a fly in the outfield and throw home; a token runs home from third against the throw. */
export class OutfieldThrowStage extends EventStage {
  private readonly slots: ArmSlot[] = []
  private readonly spots: { x: number; z: number; yaw: number }[]
  private readonly flights: FlightPath[][]
  private readonly balls: HeldProp[]
  private readonly runner: THREE.Mesh
  private readonly distanceM: number
  private readonly view = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly throws: readonly [OutfieldThrow, OutfieldThrow]) {
    super(scene, athletes)
    this.distanceM = throws[0].distanceFt * FEET_TO_M
    this.spots = [0.17, -0.17].map((a) => ({ x: Math.sin(a) * this.distanceM, z: Math.cos(a) * this.distanceM, yaw: Math.atan2(-Math.sin(a), -Math.cos(a)) }))
    this.flights = throws.map((r) => r.throws.map((x) => flight(x.velocityMph * MPH_TO_MS, x.angleDeg, BASEBALL_DRAG, 2)))
    this.balls = this.rigs.map((rig) => new HeldProp('baseball', this.group, rig))
    this.held.push(...this.balls)
    this.add(bag(THIRD_BASE.x, THIRD_BASE.z))
    this.add(bag(FIRST_BASE.x, FIRST_BASE.z))
    this.runner = this.add(token())
    const n = Math.min(throws[0].throws.length, throws[1].throws.length)
    let t = 0.4
    for (let k = 0; k < n; k++) {
      const catchAt = t + OF_CATCH_S
      const slow = Math.max(TAG_UP_S, ...throws.map((r) => r.throws[k]!.timeToPlateS))
      this.slots.push({ k, start: t, catchAt, end: catchAt + slow + 1.3 })
      t = catchAt + slow + 1.3
    }
    this.duration = t + 0.2
    this.loop = false
    const names = athletes.map((a) => a.name)
    this.captionsList = this.slots.flatMap((s) => [
      { at: s.start, text: `Throw ${s.k + 1} of ${n}: a fly ball ${throws[0].distanceFt.toFixed(0)} ft from home, runner tagging at third.` },
      { at: s.catchAt, text: 'Catch. The runner goes.' },
      ...[0, 1]
        .map((i) => ({ i, x: throws[i]!.throws[s.k]! }))
        .sort((a, b) => a.x.timeToPlateS - b.x.timeToPlateS)
        .map(({ i, x }) => ({ at: s.catchAt + x.timeToPlateS, text: `${names[i]}’s throw is home in ${sec(x.timeToPlateS)}${x.bounces ? ' on a hop' : ''}: ${x.runnerOut ? 'out' : 'safe'}.` })),
    ])
    this.captionsList.sort((a, b) => a.at - b.at)
    this.render(0)
  }

  private slotAt(t: number): ArmSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? (t >= this.duration - 0.21 ? this.slots[this.slots.length - 1] : this.slots[0])
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    if (!slot) return
    const s = t - slot.catchAt
    this.rigs.forEach((rig, i) => {
      const spot = this.spots[i]!
      const x = this.throws[i]!.throws[slot.k]!
      const motion = x.releaseS / RELEASE_AT.baseball
      let pose: Pose
      if (s < 0) pose = catchPose(rig.dims, true)
      else pose = throwMotion(clamp(s / motion, 0, 0.999), rig.dims, rig.athlete.movement.throw, 'baseball')
      if (rig.athlete.throws === 'L') pose = mirror(pose)
      rig.applyPose(pose, { x: spot.x, z: spot.z, yaw: spot.yaw })
      this.balls[i]!.update(pose, rig.athlete.throws === 'L', (since, from, obj) => this.fly(i, slot, since, from, obj), s - x.releaseS)
      if (s < 0) {
        // The fly ball drops into the glove.
        const k = clamp01((t - slot.start) / OF_CATCH_S)
        const glove = rig.jointWorld(rig.athlete.throws === 'L' ? 'wristR' : 'wristL', this.tmp)
        this.balls[i]!.object.position.set(glove.x, lerp(28, glove.y, k * k), glove.z)
      }
    })
    // Runner token: third to home in TAG_UP_S once the ball is caught.
    const r = clamp01(s / TAG_UP_S)
    this.runner.position.set(lerp(THIRD_BASE.x, 0.4, r), 0.06, lerp(THIRD_BASE.z, 0.4, r))
    const k = clamp01(s / 3)
    this.view.set(0, 1.5, lerp(this.distanceM * 0.75, this.distanceM * 0.3, k))
  }

  private fly(i: number, slot: ArmSlot, s: number, from: THREE.Vector3, obj: THREE.Object3D): boolean {
    const x = this.throws[i]!.throws[slot.k]!
    const f = this.flights[i]![slot.k]!
    const total = x.timeToPlateS - x.releaseS
    if (s > total + 1) return false
    const dist = Math.hypot(from.x, from.z) || 1
    const ux = -from.x / dist
    const uz = -from.z / dist
    let along: number
    let y: number
    if (s <= f.time || !x.bounces) {
      const [px, py] = pathPoint(f, Math.min(s, f.time))
      along = Math.min(px, dist)
      y = Math.max(0.05, py + (from.y - 2) * (1 - clamp01(s / f.time)))
    } else {
      const k = clamp01((s - f.time) / Math.max(0.05, total - f.time))
      along = lerp(f.distance, dist, k)
      y = 0.05 + 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k)
    }
    if (s > total) {
      // In the catcher's glove at the plate.
      along = dist
      y = 0.9
    }
    const side = x.dx * clamp01(along / dist)
    obj.position.set(from.x + ux * along - uz * side, y, from.z + uz * along + ux * side)
    return true
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.view)
  }

  framing(): number {
    return 3.5
  }

  /** High behind home plate, looking out at the throw. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(0, 16, -22)
  }

  live(t: number): LiveCell[] {
    return [0, 1].map((i) => {
      const done = this.slots.filter((s) => s.catchAt + this.throws[i]!.throws[s.k]!.timeToPlateS <= t)
      const outs = done.filter((s) => this.throws[i]!.throws[s.k]!.runnerOut).length
      return { label: this.name(i), big: String(outs), sub: `runners out of ${done.length}`, quality: 'SIMULATED' as Quality }
    })
  }
}

// --- Fielding drill ---------------------------------------------------------------------------

const FIELD_HOME = new THREE.Vector3(0, 1, 0.4)
const FIELD_START = { x: 9, z: 33 }
const FIELD_LANE = 1.6

interface FieldSlot {
  k: number
  start: number
  contact: number
  end: number
}

/** Fungo chances to two fielders side by side: the same batted ball in each lane. */
export class FieldingStage extends EventStage {
  private readonly slots: FieldSlot[] = []
  private readonly balls: THREE.Mesh[]
  private readonly runner: THREE.Mesh
  private readonly fwd: { x: number; z: number }
  private readonly third: { x: number; z: number }
  private readonly vmax: number[]
  private readonly tmp = new THREE.Vector3()
  private readonly from: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()]

  constructor(scene: THREE.Scene, athletes: readonly [Athlete, Athlete], readonly drills: readonly [FieldingDrill, FieldingDrill]) {
    super(scene, athletes)
    const len = Math.hypot(FIELD_START.x, FIELD_START.z)
    this.fwd = { x: -FIELD_START.x / len, z: -FIELD_START.z / len }
    this.third = { x: -this.fwd.z, z: this.fwd.x }
    this.vmax = athletes.map((a) => sprintProfile(a).vmax)
    this.balls = [0, 1].map(() => this.add(makeBaseball()))
    this.runner = this.add(token())
    this.add(bag(FIRST_BASE.x, FIRST_BASE.z))
    this.add(bag(THIRD_BASE.x, THIRD_BASE.z))
    const n = Math.min(drills[0].chances.length, drills[1].chances.length)
    let t = 0.4
    for (let k = 0; k < n; k++) {
      const contact = t + 0.6
      const last = Math.max(...drills.map((d) => {
        const c = d.chances[k]!
        return Math.max(c.hangTimeS, c.arrivalS, c.throwArrivalS ?? 0)
      }))
      this.slots.push({ k, start: t, contact, end: contact + last + 1.4 })
      t = contact + last + 1.4
    }
    this.duration = t + 0.2
    this.loop = false
    const names = athletes.map((a) => a.name)
    const text = (c: FieldingDrill['chances'][number]) => (c.outcome === 'out' ? (c.type === 'grounder' ? 'out at first' : 'caught') : c.outcome === 'error' ? 'an error' : 'a hit')
    this.captionsList = this.slots.flatMap((s) => {
      const a = drills[0].chances[s.k]!
      const b = drills[1].chances[s.k]!
      return [
        { at: s.start, text: `Chance ${s.k + 1} of ${n}: a ${a.type === 'fly' ? 'fly ball' : a.type}.` },
        { at: s.end - 1, text: `${names[0]}: ${text(a)}. ${names[1]}: ${text(b)}.` },
      ]
    })
    this.render(0)
  }

  /** Lane start for fielder i, and the world point for a chance offset (x toward third, z toward home). */
  private origin(i: number): { x: number; z: number } {
    const o = (i === 0 ? -1 : 1) * FIELD_LANE
    return { x: FIELD_START.x + this.third.x * o, z: FIELD_START.z + this.third.z * o }
  }

  private target(i: number, c: FieldingDrill['chances'][number]): { x: number; z: number } {
    const o = this.origin(i)
    return { x: o.x + this.third.x * c.ball.x + this.fwd.x * c.ball.z, z: o.z + this.third.z * c.ball.x + this.fwd.z * c.ball.z }
  }

  private slotAt(t: number): FieldSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? (t >= this.duration - 0.21 ? this.slots[this.slots.length - 1] : this.slots[0])
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    if (!slot) return
    const s = t - slot.contact
    let grounder = false
    this.rigs.forEach((rig, i) => {
      const c = this.drills[i]!.chances[slot.k]!
      grounder = grounder || c.type === 'grounder'
      const o = this.origin(i)
      const tg = this.target(i, c)
      const homeYaw = Math.atan2(this.fwd.x, this.fwd.z)
      const runYaw = Math.atan2(tg.x - o.x, tg.z - o.z)
      const runS = Math.max(0.1, c.arrivalS - c.reactionS)
      const dist = Math.hypot(tg.x - o.x, tg.z - o.z)
      const late = c.arrivalS > c.hangTimeS
      let x = o.x
      let z = o.z
      let yaw = homeYaw
      let pose: Pose
      if (s < c.reactionS) pose = readyPose(rig.dims, t)
      else if (s < c.arrivalS) {
        // Sprint-shaped progress, normalised to arrive on time.
        const tau = s - c.reactionS
        const k = accelDistance(1, tau) / Math.max(1e-6, accelDistance(1, runS))
        x = lerp(o.x, tg.x, k)
        z = lerp(o.z, tg.z, k)
        yaw = dist > 0.5 ? runYaw : homeYaw
        const diving = late && s > c.arrivalS - 0.45
        pose = diving ? divePose(rig.dims, clamp01((s - (c.arrivalS - 0.45)) / 0.45)) : dist > 0.5 ? runPose(rig, k * dist, Math.min(this.vmax[i]!, dist / runS * 1.3), this.vmax[i]!) : readyPose(rig.dims, t)
      } else {
        x = tg.x
        z = tg.z
        yaw = late && dist > 0.5 ? runYaw : homeYaw
        const thrown = c.throwArrivalS !== undefined
        const fielded = c.hangTimeS + (late ? 0.45 : 0)
        if (late && s < fielded + 0.2) pose = divePose(rig.dims, 1)
        else if (thrown && s >= fielded) {
          const throwStart = fielded + (late ? 0.2 : 0)
          const release = throwStart + 0.6 * (c.throwArrivalS! - throwStart)
          const motion = Math.max(0.3, (release - throwStart) / RELEASE_AT.baseball)
          yaw = Math.atan2(FIRST_BASE.x - x, FIRST_BASE.z - z)
          pose = throwMotion(clamp((s - throwStart) / motion, 0, 0.999), rig.dims, rig.athlete.movement.throw, 'baseball')
        } else pose = catchPose(rig.dims, c.type !== 'grounder')
      }
      rig.applyPose(pose, { x, z, yaw })
      this.placeBall(i, rig, c, s)
    })
    // Runner token for grounders: home to first in the drill's runner time.
    this.runner.visible = grounder && s >= 0
    const r = clamp01(s / RUNNER_TO_FIRST_S)
    this.runner.position.set(lerp(0.3, FIRST_BASE.x, r), 0.06, lerp(0.3, FIRST_BASE.z, r))
  }

  private placeBall(i: number, rig: Rig, c: FieldingDrill['chances'][number], s: number): void {
    const ball = this.balls[i]!
    const tg = this.target(i, c)
    const end = this.tmp.set(tg.x, c.type === 'grounder' ? 0.12 : 1.2, tg.z)
    ball.visible = s >= 0
    if (s < 0) return
    rig.root.updateMatrixWorld(true)
    const glove = (out: THREE.Vector3) => rig.jointWorld(rig.athlete.throws === 'L' ? 'wristR' : 'wristL', out)
    if (s < c.hangTimeS) {
      const k = s / c.hangTimeS
      ball.position.lerpVectors(FIELD_HOME, end, k)
      if (c.type === 'grounder') ball.position.y = 0.12 + 0.5 * Math.abs(Math.sin(3 * Math.PI * k)) * (1 - k)
      else if (c.type === 'liner') ball.position.y = lerp(FIELD_HOME.y, end.y, k) + 1.6 * Math.sin(Math.PI * k)
      else ball.position.y = lerp(FIELD_HOME.y, end.y, k) + (G * c.hangTimeS * c.hangTimeS * k * (1 - k)) / 2
      this.from[i]!.copy(ball.position)
      return
    }
    const after = s - c.hangTimeS
    if (c.outcome === 'out' || c.throwArrivalS !== undefined) {
      const thrown = c.throwArrivalS !== undefined
      const late = c.arrivalS > c.hangTimeS
      const fielded = c.hangTimeS + (late ? 0.45 : 0)
      const throwStart = fielded + (late ? 0.2 : 0)
      const release = throwStart + 0.6 * ((c.throwArrivalS ?? 0) - throwStart)
      if (!thrown || s < release) {
        glove(ball.position)
        this.from[i]!.copy(ball.position)
        return
      }
      const k = clamp01((s - release) / Math.max(0.1, c.throwArrivalS! - release))
      arcPoint(this.from[i]!, this.tmp.set(FIRST_BASE.x, 1.3, FIRST_BASE.z), k, 1, ball.position)
      return
    }
    if (c.outcome === 'error') {
      // Off the glove and onto the grass.
      ball.position.set(end.x + 0.5 * Math.min(after, 1), Math.max(0.05, end.y - 4.9 * after * after), end.z + 0.4 * Math.min(after, 1))
      return
    }
    // A hit: the ball gets past and keeps going.
    const dx = end.x - FIELD_HOME.x
    const dz = end.z - FIELD_HOME.z
    const l = Math.hypot(dx, dz) || 1
    const roll = Math.min(after, 1.5) * 6
    ball.position.set(end.x + (dx / l) * roll, c.type === 'grounder' ? 0.12 : Math.max(0.05, end.y - 4.9 * after * after + 2 * after), end.z + (dz / l) * roll)
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(FIELD_START.x * 0.6, 1, FIELD_START.z * 0.75)
  }

  framing(): number {
    return 3.6
  }

  /** Behind home plate, raised, so the batted ball and both fielders are in view. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(-4, 14, -20)
  }

  live(t: number): LiveCell[] {
    return [0, 1].map((i) => {
      const done = this.slots.filter((s) => s.end - 1 <= t)
      const outs = done.filter((s) => this.drills[i]!.chances[s.k]!.outcome === 'out').length
      return { label: this.name(i), big: String(outs), sub: `outs of ${done.length} chances`, quality: 'SIMULATED' as Quality }
    })
  }
}

// --- Factory ----------------------------------------------------------------------------------

/** Hex colour number from a CSS hex string, for turf markings in an athlete's colour. */
export function colorNumber(css: string, fallback = 0xff7a2f): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim())
  return m ? parseInt(m[1]!, 16) : fallback
}

/** The stage that replays a run, with its environment and live readout. */
export function createEventStage(scene: THREE.Scene, run: EventRun, layout: StageLayout, colors: readonly [number, number]): BuiltStage {
  const pair = run.athletes
  const r = run.result
  const lay = EVENTS[run.id].layouts.includes(layout) ? layout : EVENTS[run.id].layouts[0]!
  switch (r.kind) {
    case 'forty': {
      const stage = new SprintStage(scene, [...pair], 40, 'yd')
      return {
        stage,
        env: ['field', { lanes: 2, length: stage.distance, unit: 'yd' }],
        live: (t) =>
          stage.rows.map((row, i) => {
            const st = stage.stateOf(i, t - stage.start)
            return { label: pairNames(...pair)[i]!, big: (st.speed / MPH_TO_MS).toFixed(1), sub: `mph · ${Math.min(40, st.distance / YD_TO_M).toFixed(1)} yd${st.finished ? ` · ${sec(row.time)}` : ''}`, quality: weakest(row.profile.quality, 'ESTIMATED') }
          }),
      }
    }
    case 'route-race': {
      const stage = new RouteRaceStage(scene, pair, r.runs, colors)
      return { stage, env: ['field', { lanes: 2, length: 45 * YD_TO_M, unit: 'yd' }], live: (t) => stage.live(t) }
    }
    case 'tackle-break': {
      const stage = new TackleStage(scene, pair, r.result, r.rep, lay)
      return { stage, env: ['field', { lanes: 2, length: 20 * YD_TO_M, unit: 'yd' }], live: (t) => stage.live(t) }
    }
    case 'qb-throw': {
      const stage = new QbThrowStage(scene, pair, r.accuracy, r.arm, colors)
      const far = Math.max(QB_DEPTHS_YD[QB_DEPTHS_YD.length - 1]! + 5, ...r.arm.map((x) => x.maxDistanceYd + 5))
      return { stage, env: ['field', { lanes: 2, length: far * YD_TO_M, unit: 'yd' }], live: (t) => stage.live(t) }
    }
    case 'pass-rush': {
      const stage = new PassRushStage(scene, pair, r.result, lay)
      return { stage, env: ['field', { lanes: 2, length: 10 * YD_TO_M, unit: 'yd' }], live: (t) => stage.live(t) }
    }
    case 'shootout': {
      const shots = shootoutShots(r.result)
      const stage = new ShootingStage(scene, [...pair], shots, (s) => (ZONES[s.zone].three ? 3 : 2))
      const regulation = r.result.shots.length
      return {
        stage,
        env: ['court', {}],
        live: (t) => {
          const pts: [number, number] = [0, 0]
          stage.slots.forEach((s, k) => {
            if (k < regulation && s.arrive <= t && s.shot.made) pts[s.athlete as 0 | 1] += ZONES[s.shot.zone].three ? 3 : 2
          })
          return [0, 1].map((i) => ({ label: pairNames(...pair)[i]!, big: String(pts[i]), sub: 'points', quality: 'SIMULATED' as Quality }))
        },
      }
    }
    case 'vertical-agility': {
      if (r.test === 'laneAgility') return { stage: new AgilityStage(scene, [...pair], 'laneAgility'), env: ['court', {}] }
      return { stage: new JumpStage(scene, [...pair], r.test), env: ['studio', {}] }
    }
    case 'dunk-contest': {
      const stage = new DunkStage(scene, pair, r.result)
      return { stage, env: ['court', {}], live: (t) => stage.live(t) }
    }
    case 'iso': {
      const stage = new IsoStage(scene, pair, r.halves, lay)
      return { stage, env: ['court', {}], live: (t) => stage.live(t) }
    }
    case 'at-bat': {
      const stage = new AtBatStage(scene, r.pitcher, r.batter, r.duel)
      const names = pairNames(...pair)
      return {
        stage,
        env: ['diamond', {}],
        live: (t) => {
          const done = r.duel.appearances.filter((_, pa) => {
            const last = [...stage.slots].reverse().find((s) => s.pa === pa)
            return last ? last.arrive <= t : false
          })
          const batter = done.filter((x) => REACHED.has(x.result)).length
          return [
            { label: names[0], big: String(done.length - batter), sub: `plate appearances won of ${done.length}`, quality: 'SIMULATED' },
            { label: names[1], big: String(batter), sub: `on base in ${done.length}`, quality: 'SIMULATED' },
          ]
        },
      }
    }
    case 'home-to-first': {
      const stage = new HomeToFirstStage(scene, pair, r.runs, r.sprints)
      return { stage, env: ['diamond', {}], live: (t) => stage.live(t) }
    }
    case 'arm-throw': {
      const stage = new OutfieldThrowStage(scene, pair, r.throws)
      return { stage, env: ['diamond', {}], live: (t) => stage.live(t) }
    }
    case 'fielding': {
      const stage = new FieldingStage(scene, pair, r.drills)
      return { stage, env: ['diamond', {}], live: (t) => stage.live(t) }
    }
    case 'lift-off':
      return { stage: new LiftStage(scene, [...pair], r.lift), env: ['gym', {}] }
  }
}
