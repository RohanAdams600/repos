import type { Athlete, League, Measured, MetricKey, Pitch, Quality } from '../data/types'
import { weakest } from '../data/types'
import { LB_TO_KG } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { sprintProfile } from '../sim/sprint'
import { GROUP_LABEL, groupFor, normalCdf, normFor, PITCH_NORMS, zScore, type NormKey } from './norms'

/**
 * Video-game style grades, 0 to 99. Each grade is a weighted average of z-scores against the
 * athlete's position norms, mapped to the scale by GRADE = 72 + 9 x z (so a typical pro is in
 * the low 70s and three spreads above average reaches 99). A grade is tagged with the weakest
 * quality among the inputs it used; the percentile is never better than ESTIMATED because the
 * norms themselves are approximate.
 */
export const GRADE_BASE = 72
export const GRADE_SPREAD = 9

export type GradeGroup = 'Shared' | League

export interface Term {
  key: NormKey
  label: string
  weight: number
  get: (a: Athlete, year?: number) => Measured | undefined
}

export interface GradeDef {
  id: string
  label: string
  group: GradeGroup
  terms: Term[]
  /** Added to z for a position group: how far the position usually sits from the norm. */
  offset?: Record<string, number>
  /** Used when no input exists. */
  baseline?: Record<string, number>
}

export interface TermResult {
  label: string
  key: NormKey
  weight: number
  value: number
  z: number
  quality: Quality
  note?: string
  sourceId?: string
}

export interface Grade {
  id: string
  label: string
  group: GradeGroup
  value: number
  z: number
  quality: Quality
  percentile: number
  percentileQuality: Quality
  formula: string
  terms: TermResult[]
  normGroup: string
  /** False when no input exists and the position baseline stands in (always SIMULATED). */
  measured: boolean
}

const metric =
  (key: MetricKey) =>
  (a: Athlete, year?: number): Measured | undefined =>
    resolveMetric(a, key, year)

function derived(value: number, quality: Quality, note: string): Measured {
  return { value, quality, note }
}

const relStrength = (a: Athlete, year?: number): Measured | undefined => {
  const parts = (['bench1RmLb', 'squat1RmLb', 'deadlift1RmLb'] as const).map((k) => resolveMetric(a, k, year))
  const weight = resolveMetric(a, 'weightLb', year)
  if (!weight || parts.some((p) => !p)) return undefined
  const total = parts.reduce((sum, p) => sum + p!.value, 0)
  return derived(total / Math.pow(weight.value, 0.67), weakest(weight.quality, ...parts.map((p) => p!.quality)), 'Bench + squat + deadlift divided by bodyweight^0.67 (allometric scaling).')
}

const workload = (a: Athlete, year?: number): Measured | undefined => {
  const season = year !== undefined ? a.seasons.find((s) => s.year === year) : [...a.seasons].sort((x, y) => y.year - x.year).find((s) => s.games)
  if (a.league === 'NFL') {
    if (!season?.games || !season.metrics.carries) return undefined
    return derived(season.metrics.carries.value / season.games.value, weakest(season.games.quality, season.metrics.carries.quality), `${season.season}: carries per game.`)
  }
  if (a.league === 'MLB') {
    if (!season?.games) return undefined
    return derived(season.games.value, season.games.quality, `${season.season}: games played.`)
  }
  return resolveMetric(a, 'minutesPerGame', year)
}

const rushTdRate = (a: Athlete, year?: number): Measured | undefined => {
  const td = resolveMetric(a, 'rushTd', year)
  const carries = resolveMetric(a, 'carries', year)
  if (!td || !carries || carries.value === 0) return undefined
  return derived((100 * td.value) / carries.value, weakest(td.quality, carries.quality), 'Rushing touchdowns per 100 carries.')
}

const momentum = (a: Athlete, year?: number): Measured | undefined => {
  const weight = resolveMetric(a, 'weightLb', year)
  if (!weight) return undefined
  const sprint = sprintProfile(a)
  return derived(weight.value * LB_TO_KG * sprint.vmax, weakest(weight.quality, sprint.quality), 'Body mass x estimated top speed (kg·m/s).')
}

const obpMinusAvg = (a: Athlete, year?: number): Measured | undefined => {
  const obp = resolveMetric(a, 'onBasePct', year)
  const avg = resolveMetric(a, 'battingAvg', year)
  if (!obp || !avg) return undefined
  return derived(obp.value - avg.value, weakest(obp.quality, avg.quality), 'On-base pct minus batting average: walks and hit-by-pitches.')
}

const astTov = (a: Athlete, year?: number): Measured | undefined => {
  const ast = resolveMetric(a, 'assistsPerGame', year)
  const tov = resolveMetric(a, 'turnoversPerGame', year)
  if (!ast || !tov || tov.value === 0) return undefined
  return derived(ast.value / tov.value, weakest(ast.quality, tov.quality), 'Assists per turnover.')
}

const stocks = (a: Athlete, year?: number): Measured | undefined => {
  const stl = resolveMetric(a, 'stealsPerGame', year)
  const blk = resolveMetric(a, 'blocksPerGame', year)
  if (!stl || !blk) return undefined
  return derived(stl.value + blk.value, weakest(stl.quality, blk.quality), 'Steals plus blocks per game.')
}

const apeIndex = (a: Athlete, year?: number): Measured | undefined => {
  const span = resolveMetric(a, 'wingspanIn', year)
  const height = resolveMetric(a, 'heightIn', year)
  if (!span || !height) return undefined
  return derived(span.value - height.value, weakest(span.quality, height.quality), 'Wingspan minus height, inches.')
}

/** League-appropriate sprint input for the speed grade. */
const sprintTerms = (weight: number): Term[] => [
  { key: 'fortyS', label: '40-yard dash', weight, get: metric('fortyS') },
  { key: 'sprintSpeedFtS', label: 'Sprint speed', weight, get: metric('sprintSpeedFtS') },
  { key: 'threeQuarterSprintS', label: '3/4-court sprint', weight, get: metric('threeQuarterSprintS') },
]

const t = (key: NormKey, label: string, weight: number, get: Term['get'] = metric(key as MetricKey)): Term => ({ key, label, weight, get })

export const GRADE_DEFS: GradeDef[] = [
  // Shared
  { id: 'speed', label: 'Speed', group: 'Shared', terms: sprintTerms(1) },
  { id: 'acceleration', label: 'Acceleration', group: 'Shared', terms: [...sprintTerms(0.5), t('broadJumpIn', 'Broad jump', 0.3), t('standingVerticalIn', 'Standing vertical', 0.2)] },
  { id: 'agility', label: 'Agility', group: 'Shared', terms: [t('shuttleS', '5-10-5 shuttle', 0.4), t('threeConeS', '3-cone', 0.35), t('laneAgilityS', 'Lane agility', 0.25)] },
  { id: 'strength', label: 'Strength', group: 'Shared', terms: [t('relStrength', 'Relative strength', 1, relStrength)] },
  { id: 'vertical', label: 'Vertical', group: 'Shared', terms: [t('maxVerticalIn', 'Max vertical', 0.7), t('standingVerticalIn', 'Standing vertical', 0.3)] },
  { id: 'stamina', label: 'Stamina', group: 'Shared', terms: [t('repeatSprintDropPct', 'Repeat-sprint drop-off', 0.5), t('workload', 'Workload', 0.5, workload)] },
  { id: 'flexibility', label: 'Flexibility', group: 'Shared', terms: [t('sitReachIn', 'Sit and reach', 1)] },
  { id: 'durability', label: 'Durability', group: 'Shared', terms: [t('gamesPlayedPct', 'Games available', 1)] },
  {
    id: 'awareness',
    label: 'Awareness',
    group: 'Shared',
    terms: [
      t('rushYardsPerCarry', 'Yards per carry (vision)', 0.5),
      t('rushTdRate', 'TD per 100 carries', 0.5, rushTdRate),
      t('obpMinusAvg', 'Walks over average', 0.6, obpMinusAvg),
      t('strikeoutPct', 'Strikeout rate', 0.4),
      t('astTov', 'Assist-to-turnover', 1, astTov),
    ],
  },
  { id: 'bodyComposition', label: 'Body composition', group: 'Shared', terms: [t('bodyFatPct', 'Body fat', 1)] },
  {
    id: 'athleticism',
    label: 'Athleticism',
    group: 'Shared',
    terms: [...sprintTerms(0.3), t('maxVerticalIn', 'Max vertical', 0.2), t('broadJumpIn', 'Broad jump', 0.15), t('shuttleS', 'Shuttle', 0.15), t('relStrength', 'Relative strength', 0.2, relStrength)],
  },

  // NFL
  { id: 'throwPower', label: 'Throw power', group: 'NFL', terms: [t('throwVelocityMph', 'Throw velocity', 1)], offset: { RB: 0 } },
  { id: 'throwAccuracy', label: 'Throw accuracy', group: 'NFL', terms: [], baseline: { RB: -2 } },
  { id: 'catching', label: 'Catching', group: 'NFL', terms: [t('catchRatePct', 'Catch rate', 1)] },
  { id: 'routeRunning', label: 'Route running', group: 'NFL', terms: [t('shuttleS', 'Shuttle', 0.5), t('catchRatePct', 'Catch rate', 0.5)], offset: { RB: -0.6 } },
  { id: 'elusiveness', label: 'Elusiveness', group: 'NFL', terms: [t('shuttleS', 'Shuttle', 0.4), t('rushYardsPerCarry', 'Yards per carry', 0.3), t('yardsAfterContactPerCarry', 'Yards after contact', 0.3)] },
  { id: 'tackleBreaking', label: 'Tackle breaking', group: 'NFL', terms: [t('yardsAfterContactPerCarry', 'Yards after contact', 0.5), t('momentum', 'Momentum at top speed', 0.5, momentum)] },
  { id: 'blocking', label: 'Blocking', group: 'NFL', terms: [t('relStrength', 'Relative strength', 1, relStrength)], offset: { RB: -1 } },
  { id: 'passRush', label: 'Pass rush', group: 'NFL', terms: [t('relStrength', 'Relative strength', 0.5, relStrength), ...sprintTerms(0.5)], offset: { RB: -2.2 } },
  { id: 'coverage', label: 'Coverage', group: 'NFL', terms: [...sprintTerms(0.5), t('shuttleS', 'Shuttle', 0.5)], offset: { RB: -2.4 } },

  // MLB
  { id: 'contact', label: 'Contact', group: 'MLB', terms: [t('battingAvg', 'Batting average', 0.6), t('strikeoutPct', 'Strikeout rate', 0.4)] },
  { id: 'power', label: 'Power', group: 'MLB', terms: [t('sluggingPct', 'Slugging', 0.4), t('maxExitVelocityMph', 'Max exit velocity', 0.3), t('homeRuns', 'Home runs', 0.3)] },
  { id: 'plateDiscipline', label: 'Plate discipline', group: 'MLB', terms: [t('obpMinusAvg', 'Walks over average', 0.7, obpMinusAvg), t('strikeoutPct', 'Strikeout rate', 0.3)] },
  { id: 'armStrength', label: 'Arm strength', group: 'MLB', terms: [t('throwVelocityMph', 'Throw velocity', 1)] },
  { id: 'fielding', label: 'Fielding', group: 'MLB', terms: [], baseline: { TWP: -0.4 } },
  { id: 'baserunning', label: 'Baserunning', group: 'MLB', terms: [t('sprintSpeedFtS', 'Sprint speed', 0.6), t('stolenBases', 'Stolen bases', 0.4)] },
  { id: 'velocity', label: 'Velocity', group: 'MLB', terms: [t('fastballVelocityMph', 'Average fastball', 1)] },
  { id: 'command', label: 'Command', group: 'MLB', terms: [t('walksPer9', 'Walks per 9', 1)] },

  // NBA
  { id: 'threePoint', label: 'Three-point', group: 'NBA', terms: [t('threePointPct', '3-point pct', 1)] },
  { id: 'midRange', label: 'Mid-range', group: 'NBA', terms: [t('midRangePct', 'Mid-range pct', 0.7), t('freeThrowPct', 'Free throw pct', 0.3)] },
  { id: 'finishing', label: 'Finishing', group: 'NBA', terms: [t('rimFinishPct', 'At-rim pct', 0.6), t('maxVerticalIn', 'Max vertical', 0.4)] },
  { id: 'ballHandling', label: 'Ball handling', group: 'NBA', terms: [t('astTov', 'Assist-to-turnover', 0.5, astTov), t('laneAgilityS', 'Lane agility', 0.25), t('shuttleS', 'Shuttle', 0.25)] },
  { id: 'passing', label: 'Passing', group: 'NBA', terms: [t('assistsPerGame', 'Assists per game', 0.7), t('astTov', 'Assist-to-turnover', 0.3, astTov)] },
  { id: 'rebounding', label: 'Rebounding', group: 'NBA', terms: [t('reboundsPerGame', 'Rebounds per game', 0.7), t('standingReachIn', 'Standing reach', 0.3)] },
  { id: 'perimeterDefense', label: 'Perimeter defense', group: 'NBA', terms: [t('stealsPerGame', 'Steals per game', 0.4), t('laneAgilityS', 'Lane agility', 0.3), t('apeIndexIn', 'Wingspan minus height', 0.3, apeIndex)] },
  { id: 'interiorDefense', label: 'Interior defense', group: 'NBA', terms: [t('blocksPerGame', 'Blocks per game', 0.5), t('standingReachIn', 'Standing reach', 0.3), t('relStrength', 'Relative strength', 0.2, relStrength)] },
  { id: 'blockSteal', label: 'Block and steal', group: 'NBA', terms: [t('stocks', 'Steals plus blocks', 1, stocks)] },
]

export function gradeFromZ(z: number): number {
  return Math.max(1, Math.min(99, Math.round(GRADE_BASE + GRADE_SPREAD * z)))
}

export function computeGrade(def: GradeDef, a: Athlete, year?: number): Grade {
  const group = groupFor(a.positionGroup, a.league)
  const terms: TermResult[] = []
  for (const term of def.terms) {
    const m = term.get(a, year)
    const norm = normFor(group, a.league, term.key)
    if (!m || !norm) continue
    terms.push({ label: term.label, key: term.key, weight: term.weight, value: m.value, z: zScore(norm, m.value), quality: m.quality, note: m.note, sourceId: m.sourceId })
  }
  const offset = def.offset?.[group] ?? 0
  let z: number
  let quality: Quality
  let formula: string
  if (terms.length === 0) {
    z = def.baseline?.[group] ?? 0
    quality = 'SIMULATED'
    formula = `${GRADE_BASE} + ${GRADE_SPREAD} × z, with z = ${z.toFixed(1)}: no input data, so the position baseline for ${GROUP_LABEL[group] ?? group} is used.`
  } else {
    const totalWeight = terms.reduce((s, x) => s + x.weight, 0)
    z = terms.reduce((s, x) => s + (x.weight / totalWeight) * x.z, 0) + offset
    quality = weakest(...terms.map((x) => x.quality))
    const parts = terms.map((x) => `${(x.weight / totalWeight).toFixed(2)}·z(${x.label})`).join(' + ')
    const offsetText = offset ? ` ${offset < 0 ? '−' : '+'} ${Math.abs(offset).toFixed(1)} (position adjustment)` : ''
    formula = `${GRADE_BASE} + ${GRADE_SPREAD} × z, with z = ${parts}${offsetText}. Norms: ${GROUP_LABEL[group] ?? group}.`
  }
  return {
    id: def.id,
    label: def.label,
    group: def.group,
    value: gradeFromZ(z),
    z,
    quality,
    percentile: Math.round(normalCdf(z) * 100),
    percentileQuality: weakest(quality, 'ESTIMATED'),
    formula,
    terms,
    normGroup: GROUP_LABEL[group] ?? group,
    measured: terms.length > 0,
  }
}

export interface PitchGrade {
  type: Pitch['type']
  value: number
  z: number
  movementZ: number
  quality: Quality
  formula: string
}

export function pitchGrades(a: Athlete): PitchGrade[] {
  return (a.pitches ?? []).map((p) => {
    const norm = PITCH_NORMS[p.type]!
    const move = norm.movementAxis === 'vertical' ? p.verticalBreakIn : p.horizontalBreakIn
    const moveValue = norm.movementAxis === 'horizontal' ? Math.abs(move.value) : move.value
    const zv = zScore(norm.velocity, p.velocityMph.value)
    const zm = zScore(norm.movement, moveValue)
    const z = 0.5 * zv + 0.5 * zm
    return {
      type: p.type,
      value: gradeFromZ(z),
      z,
      movementZ: zm,
      quality: weakest(p.velocityMph.quality, move.quality),
      formula: `${GRADE_BASE} + ${GRADE_SPREAD} × (0.5·z(velocity ${p.velocityMph.value.toFixed(1)} mph) + 0.5·z(${norm.movementLabel} ${moveValue.toFixed(0)} in)) against MLB ${p.type} norms.`,
    }
  })
}

/** Movement grade for pitchers: usage-weighted movement z across the arsenal. */
function movementGrade(a: Athlete): Grade | undefined {
  if (!a.pitches?.length) return undefined
  const grades = pitchGrades(a)
  let total = 0
  let z = 0
  const qualities: Quality[] = []
  a.pitches.forEach((p, i) => {
    total += p.usagePct.value
    z += p.usagePct.value * grades[i]!.movementZ
    qualities.push(grades[i]!.quality, p.usagePct.quality)
  })
  z /= total || 1
  const quality = weakest(...qualities)
  return {
    id: 'movement',
    label: 'Movement',
    group: 'MLB',
    value: gradeFromZ(z),
    z,
    quality,
    percentile: Math.round(normalCdf(z) * 100),
    percentileQuality: weakest(quality, 'ESTIMATED'),
    formula: `${GRADE_BASE} + ${GRADE_SPREAD} × z, with z = usage-weighted movement z across ${a.pitches.length} pitches.`,
    terms: [],
    normGroup: 'MLB pitchers',
    measured: true,
  }
}

export function gradesFor(a: Athlete, year?: number): Grade[] {
  const list = GRADE_DEFS.filter((d) => d.group === 'Shared' || d.group === a.league).map((d) => computeGrade(d, a, year))
  if (a.league === 'MLB') {
    const movement = movementGrade(a)
    if (movement) list.push(movement)
  }
  return list
}

/**
 * How much each grade counts toward the overall, by position group. These weights are the app's
 * own judgement of what matters at each position (documented on the methodology page), not a
 * league formula.
 */
const OVERALL_WEIGHTS: Record<string, Record<string, number>> = {
  QB: { throwAccuracy: 0.2, throwPower: 0.16, awareness: 0.14, durability: 0.08, speed: 0.06, agility: 0.06, elusiveness: 0.06, athleticism: 0.06, acceleration: 0.04, stamina: 0.04, strength: 0.04, vertical: 0.02 },
  RB: { speed: 0.14, acceleration: 0.1, agility: 0.08, elusiveness: 0.12, tackleBreaking: 0.12, strength: 0.06, catching: 0.08, routeRunning: 0.04, blocking: 0.04, awareness: 0.08, durability: 0.05, stamina: 0.04, vertical: 0.02, athleticism: 0.03 },
  WR: { catching: 0.16, speed: 0.14, routeRunning: 0.14, acceleration: 0.1, agility: 0.1, vertical: 0.07, elusiveness: 0.06, awareness: 0.06, durability: 0.05, athleticism: 0.05, stamina: 0.04, strength: 0.03 },
  TE: { catching: 0.14, blocking: 0.12, routeRunning: 0.1, strength: 0.1, speed: 0.08, athleticism: 0.07, acceleration: 0.06, agility: 0.06, tackleBreaking: 0.06, awareness: 0.06, durability: 0.06, vertical: 0.05, stamina: 0.04 },
  OL: { blocking: 0.3, strength: 0.2, awareness: 0.1, agility: 0.08, durability: 0.08, acceleration: 0.06, stamina: 0.06, athleticism: 0.06, speed: 0.03, bodyComposition: 0.03 },
  DL: { passRush: 0.26, strength: 0.18, acceleration: 0.12, agility: 0.08, awareness: 0.08, durability: 0.07, athleticism: 0.07, speed: 0.06, stamina: 0.05, vertical: 0.03 },
  LB: { speed: 0.12, coverage: 0.12, passRush: 0.12, acceleration: 0.1, agility: 0.1, strength: 0.1, awareness: 0.1, athleticism: 0.07, durability: 0.06, stamina: 0.05, vertical: 0.04 },
  DB: { coverage: 0.24, speed: 0.16, agility: 0.12, acceleration: 0.1, vertical: 0.08, awareness: 0.08, athleticism: 0.08, durability: 0.06, stamina: 0.05, strength: 0.03 },
  ST: { awareness: 0.2, durability: 0.2, strength: 0.15, speed: 0.1, stamina: 0.1, athleticism: 0.1, flexibility: 0.1, agility: 0.05 },
  H: { contact: 0.18, power: 0.18, plateDiscipline: 0.14, baserunning: 0.1, fielding: 0.08, armStrength: 0.07, speed: 0.06, durability: 0.06, awareness: 0.05, athleticism: 0.05, strength: 0.03 },
  P: { velocity: 0.26, command: 0.22, movement: 0.22, durability: 0.1, stamina: 0.08, armStrength: 0.04, athleticism: 0.04, strength: 0.04 },
  TWP: { power: 0.14, contact: 0.12, plateDiscipline: 0.1, baserunning: 0.06, velocity: 0.1, command: 0.08, movement: 0.14, armStrength: 0.04, speed: 0.04, durability: 0.06, awareness: 0.04, strength: 0.03, athleticism: 0.03, fielding: 0.02 },
  G: { threePoint: 0.13, midRange: 0.07, finishing: 0.1, ballHandling: 0.1, passing: 0.08, perimeterDefense: 0.08, speed: 0.07, acceleration: 0.06, vertical: 0.06, agility: 0.05, awareness: 0.06, durability: 0.05, stamina: 0.04, rebounding: 0.03, blockSteal: 0.02 },
  W: { threePoint: 0.12, perimeterDefense: 0.1, finishing: 0.1, midRange: 0.07, ballHandling: 0.07, rebounding: 0.07, passing: 0.06, speed: 0.06, vertical: 0.06, awareness: 0.06, agility: 0.05, durability: 0.05, stamina: 0.04, blockSteal: 0.04 },
  B: { rebounding: 0.16, interiorDefense: 0.16, finishing: 0.14, blockSteal: 0.08, strength: 0.07, vertical: 0.06, midRange: 0.05, threePoint: 0.05, passing: 0.05, awareness: 0.05, durability: 0.05, stamina: 0.04, perimeterDefense: 0.04 },
}

/** An overall needs at least this share of its weight on measured grades to be shown as a number. */
export const OVERALL_MIN_COVERAGE = 0.4

const LEAGUE_DEFAULT: Record<League, string> = { NFL: 'RB', MLB: 'H', NBA: 'G' }

export const OVERALL_STRETCH = 1.5

export interface Overall {
  value: number
  quality: Quality
  /** Share of the overall's weight resting on each quality of input. */
  mix: Record<Quality, number>
  weights: { id: string; label: string; weight: number; value: number; quality: Quality; measured: boolean }[]
  formula: string
  /** Share of the weight resting on grades with real inputs (not position baselines). */
  coverage: number
  /** False when coverage is below OVERALL_MIN_COVERAGE: show "not enough data", not a number. */
  enough: boolean
}

export function overall(a: Athlete, grades = gradesFor(a)): Overall {
  const group = groupFor(a.positionGroup, a.league)
  const weights: Record<string, number> = OVERALL_WEIGHTS[group] ?? OVERALL_WEIGHTS[LEAGUE_DEFAULT[a.league]] ?? {}
  const rows: Overall['weights'] = []
  for (const [id, weight] of Object.entries(weights)) {
    const g = grades.find((x) => x.id === id)
    if (g) rows.push({ id, label: g.label, weight, value: g.value, quality: g.quality, measured: g.measured })
  }
  const total = rows.reduce((s, r) => s + r.weight, 0) || 1
  const average = rows.reduce((s, r) => s + (r.weight / total) * r.value, 0)
  // Averaging pulls every athlete toward the middle, so the spread is stretched back out, the
  // way game ratings are: an athlete strong across the board should reach the 90s.
  const value = Math.max(1, Math.min(99, Math.round(GRADE_BASE + (average - GRADE_BASE) * OVERALL_STRETCH)))
  const mix: Record<Quality, number> = { VERIFIED: 0, ESTIMATED: 0, SIMULATED: 0 }
  for (const r of rows) mix[r.quality] += r.weight / total
  // VERIFIED only when at least 80% of the weight rests on verified grades; SIMULATED as soon as
  // a fifth of it rests on simulated ones.
  const quality: Quality = mix.SIMULATED >= 0.2 ? 'SIMULATED' : mix.SIMULATED + mix.ESTIMATED >= 0.2 ? 'ESTIMATED' : 'VERIFIED'
  const coverage = rows.reduce((s, r) => s + (r.measured ? r.weight / total : 0), 0)
  return {
    value,
    quality,
    mix,
    coverage,
    enough: coverage >= OVERALL_MIN_COVERAGE,
    weights: rows,
    formula: `${GRADE_BASE} + ${OVERALL_STRETCH} × (weighted average − ${GRADE_BASE}) over ${rows.length} grades with ${GROUP_LABEL[group] ?? group} weights: ${rows
      .slice()
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 4)
      .map((r) => `${r.label} ${(100 * r.weight / total).toFixed(0)}%`)
      .join(', ')}, and the rest.`,
  }
}

export interface HistoryPoint {
  season: string
  year: number
  overall: number
  grades: Record<string, number>
  quality: Quality
}

export function gradeHistory(a: Athlete): HistoryPoint[] {
  return [...a.seasons]
    .sort((x, y) => x.year - y.year)
    .map((s) => {
      const grades = gradesFor(a, s.year)
      const o = overall(a, grades)
      return { season: s.season, year: s.year, overall: o.value, quality: o.quality, grades: Object.fromEntries(grades.map((g) => [g.id, g.value])) }
    })
}
