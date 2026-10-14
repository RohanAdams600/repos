import type { Athlete, League, Measured, MetricKey, Quality, SeasonLine } from '../data/types'
import { weakest } from '../data/types'
import { formatMetric, FTS_TO_MS, LB_TO_KG, METRICS } from '../data/metrics'
import { positionGroupFor } from '../data/positions'
import { resolveMetric } from '../data/resolve'
import { computeGrade, GRADE_DEFS, gradeHistory, overall } from '../grades/grades'
import { GROUP_LABEL, groupFor, normalCdf, normFor, zScore, type NormKey } from '../grades/norms'

/**
 * Standouts: a weekly discovery page per league, built only from figures already on file.
 * Nothing here is drawn at random and nothing is invented: SIMULATED figures never compete,
 * anything computed from measured inputs is at best ESTIMATED, and percentiles are ESTIMATED
 * because the position norms behind them are approximate. Ranks are always among the athletes
 * on file and say how many were compared; a source's own rank wording is carried verbatim.
 */

export type SectionId = 'fastest' | 'explosive' | 'strongest' | 'arms' | 'builds' | 'rising' | 'improved' | 'hidden'

/** Sections that are straight leaderboards of measured figures. */
export type MetricSectionId = 'fastest' | 'explosive' | 'strongest' | 'arms'

export const SECTION_IDS: readonly SectionId[] = ['fastest', 'explosive', 'strongest', 'arms', 'builds', 'rising', 'improved', 'hidden']

export const SECTION_CAP = 10
export const DEFAULT_MIN_SAMPLE = 5
/** One-sided 95th percentile of the standard normal: the outlier line against a position norm. */
export const OUTLIER_Z = 1.645
export const HIDDEN_GEM_MIN_ATHLETICISM = 85

const JUMPS: readonly MetricKey[] = ['maxVerticalIn', 'broadJumpIn', 'standingVerticalIn']
const LIFTS: readonly MetricKey[] = ['benchReps225', 'bench1RmLb', 'squat1RmLb']

/** Which measured figures compete in each leaderboard section, per league. */
export const SECTION_METRICS: Record<MetricSectionId, Record<League, readonly MetricKey[]>> = {
  fastest: { NFL: ['fortyS', 'tenSplitS', 'topSpeedMph'], MLB: ['sprintSpeedFtS', 'homeToFirstS'], NBA: ['threeQuarterSprintS', 'avgSpeedMph'] },
  explosive: { NFL: JUMPS, MLB: [...JUMPS, 'batSpeedMph', 'maxExitVelocityMph'], NBA: JUMPS },
  strongest: { NFL: LIFTS, MLB: LIFTS, NBA: LIFTS },
  arms: { NFL: ['throwVelocityMph'], MLB: ['armStrengthMph', 'fastballMaxMph', 'fastballVelocityMph', 'spinRateRpm'], NBA: ['wingspanIn'] },
}

/** Size figures for the generic rare size-speed combination. */
export const SIZE_METRICS: readonly MetricKey[] = ['weightLb', 'heightIn', 'wingspanIn']

/** Season-line production figures compared season over season for Most improved. */
export const PRODUCTION_METRICS: Record<League, readonly MetricKey[]> = {
  NFL: ['rushYards', 'rushTd', 'rushYardsPerCarry', 'receptions', 'receivingYards', 'catchRatePct', 'yardsAfterContact', 'yardsAfterContactPerCarry', 'brokenTackles'],
  MLB: ['battingAvg', 'onBasePct', 'sluggingPct', 'homeRuns', 'stolenBases', 'strikeoutPct', 'pitchingEra', 'pitchingStrikeoutPer9', 'walksPer9'],
  NBA: ['pointsPerGame', 'threePointPct', 'freeThrowPct', 'midRangePct', 'rimFinishPct', 'assistsPerGame', 'reboundsPerGame', 'stealsPerGame', 'blocksPerGame'],
}

/** NFL arm talent is a quarterback question: a running back's throw is not a standout arm. */
const RESTRICT: Partial<Record<MetricSectionId, Partial<Record<League, { groups: readonly string[]; noun: string }>>>> = {
  arms: { NFL: { groups: ['QB'], noun: 'quarterback' } },
}

/** Metric keys that also have a position norm (the compiler checks each is in both unions). */
const NORMED_METRICS: readonly (MetricKey & NormKey)[] = [
  'heightIn',
  'weightLb',
  'wingspanIn',
  'standingReachIn',
  'bodyFatPct',
  'fortyS',
  'tenSplitS',
  'threeQuarterSprintS',
  'sprintSpeedFtS',
  'topSpeedMph',
  'homeToFirstS',
  'avgSpeedMph',
  'maxVerticalIn',
  'standingVerticalIn',
  'broadJumpIn',
  'shuttleS',
  'threeConeS',
  'laneAgilityS',
  'sitReachIn',
  'benchReps225',
  'repeatSprintDropPct',
  'gamesPlayedPct',
  'throwVelocityMph',
  'armStrengthMph',
  'rushYardsPerCarry',
  'yardsAfterContactPerCarry',
  'catchRatePct',
  'battingAvg',
  'sluggingPct',
  'homeRuns',
  'stolenBases',
  'strikeoutPct',
  'maxExitVelocityMph',
  'batSpeedMph',
  'fastballVelocityMph',
  'fastballMaxMph',
  'spinRateRpm',
  'walksPer9',
  'pitchingStrikeoutPer9',
  'threePointPct',
  'midRangePct',
  'rimFinishPct',
  'freeThrowPct',
  'assistsPerGame',
  'reboundsPerGame',
  'stealsPerGame',
  'blocksPerGame',
]

export interface StandoutEntry {
  section: SectionId
  athleteId: string
  athleteName: string
  league: League
  positionGroup: string
  /**
   * A MetricKey, or a derived id: speedScore, apeIndexIn, momentum, rareCombo, overallGain,
   * athleticism, or `<MetricKey>Gain` for a season-over-season change.
   */
  metric: string
  label: string
  value: number
  /** The value formatted with units. */
  display: string
  quality: Quality
  sourceId?: string
  asOf?: string
  /** Rank among the athletes on file, always naming how many were compared. */
  rankText: string
  /** The source's own published rank wording (Measured.rank), verbatim. Never generated. */
  sourceRank?: string
  /** Against the athlete's position norm, 1 to 99. */
  percentile?: number
  /** Never better than ESTIMATED: the norms are approximate. */
  percentileQuality?: Quality
  /** z >= 1.645 against the position norm. */
  outlier: boolean
  /** One plain sentence. */
  why: string
}

export interface StandoutSection {
  id: SectionId
  label: string
  /** Best first, at most SECTION_CAP, each athlete at most once (on the best figure). */
  entries: StandoutEntry[]
}

export interface Standouts {
  league: League
  /** ISO date (yyyy-mm-dd) of the Monday of the week the page was built for. */
  generatedWeek: string
  /** All eight sections in SECTION_IDS order, empty ones included. */
  sections: StandoutSection[]
  notes: string[]
}

export interface StandoutOptions {
  league: League
  today: Date
  /** Below this many athletes compared, a note says the ranks are among a small sample. */
  minSample?: number
}

/** A figure at or above the 95th percentile of the athlete's position norm. */
export interface Outlier {
  athleteId: string
  athleteName: string
  league: League
  positionGroup: string
  metric: string
  label: string
  value: number
  display: string
  quality: Quality
  sourceId?: string
  asOf?: string
  sourceRank?: string
  z: number
  percentile: number
  percentileQuality: Quality
  why: string
}

/** ISO date of the Monday that starts the week containing `date`, on the UTC calendar. */
export function weekOf(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('weekOf needs a valid date')
  const back = (date.getUTCDay() + 6) % 7
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - back)).toISOString().slice(0, 10)
}

export function sectionLabel(id: SectionId, league: League): string {
  switch (id) {
    case 'fastest':
      return 'Fastest'
    case 'explosive':
      return 'Most explosive'
    case 'strongest':
      return 'Strongest'
    case 'arms':
      return league === 'NBA' ? 'Longest arms' : 'Strongest arms'
    case 'builds':
      return 'Rarest builds'
    case 'rising':
      return 'Rising'
    case 'improved':
      return 'Most improved'
    case 'hidden':
      return 'Hidden gems'
  }
}

// ---------------------------------------------------------------------------------------------
// Shared helpers

interface Rated {
  z: number
  percentile: number
  percentileQuality: Quality
  outlier: boolean
}

interface Placed {
  rank: number
  tied: boolean
  n: number
  /** Midrank percentile on file, 0..1: (beaten + half the ties) / compared. */
  standing: number
}

interface Candidate {
  entry: StandoutEntry
  n: number
  standing: number
  z?: number
  /** Last tiebreak before names, higher first: relative size of a season-over-season gain. */
  strength?: number
  /** For the small-sample note. */
  noteLabel: string
  noun: string
}

interface Ctx {
  league: League
  field: Athlete[]
  /** Seasons ending before this year are too old to be rising or improving now. */
  recentYear: number
  /** athlete:figure pairs left out because they are SIMULATED. */
  simulated: Set<string>
}

function groupOf(a: Athlete): string {
  return a.positionGroup || positionGroupFor(a.league, a.position)
}

function groupLabel(a: Athlete): string {
  const g = groupOf(a)
  return GROUP_LABEL[g] ?? g
}

const NORMED_SET: ReadonlySet<string> = new Set(NORMED_METRICS)

function isNormed(key: MetricKey): key is MetricKey & NormKey {
  return NORMED_SET.has(key)
}

/**
 * Percentile of a z, rounded down (so 95 or more always means an outlier) and kept within 1..99
 * so the page never claims a 0th or 100th.
 */
function percentileOf(z: number): number {
  return Math.max(1, Math.min(99, Math.floor(normalCdf(z) * 100)))
}

/**
 * Rate a value against the athlete's own position-group norm. League fallbacks are not used
 * here: they would grade a kicker against running backs.
 */
function rate(a: Athlete, key: NormKey, value: number, quality: Quality): Rated | undefined {
  const group = groupOf(a)
  if (groupFor(group, a.league) !== group) return undefined
  const norm = normFor(group, a.league, key)
  if (!norm || !(norm.sd > 0)) return undefined
  const z = zScore(norm, value)
  return { z, percentile: percentileOf(z), percentileQuality: weakest(quality, 'ESTIMATED'), outlier: z >= OUTLIER_Z }
}

function usable(m: Measured | undefined): m is Measured {
  return m !== undefined && m.quality !== 'SIMULATED' && Number.isFinite(m.value)
}

/** A current figure that may compete; SIMULATED ones are counted for the notes and dropped. */
function take(ctx: Ctx, a: Athlete, key: MetricKey): Measured | undefined {
  const m = resolveMetric(a, key)
  if (m?.quality === 'SIMULATED') ctx.simulated.add(`${a.id}:${key}`)
  return usable(m) ? m : undefined
}

/** Competition ranking (1, 2, 2, 4) of scores where higher is better. */
function place(scores: readonly number[]): Placed[] {
  const n = scores.length
  const sorted = [...scores].sort((x, y) => y - x)
  const firstAt = new Map<number, number>()
  const count = new Map<number, number>()
  sorted.forEach((s, i) => {
    if (!firstAt.has(s)) firstAt.set(s, i)
    count.set(s, (count.get(s) ?? 0) + 1)
  })
  return scores.map((s) => {
    const above = firstAt.get(s) ?? 0
    const equal = count.get(s) ?? 1
    const below = n - above - equal
    return { rank: above + 1, tied: equal > 1, n, standing: (below + 0.5 * equal) / n }
  })
}

/** Round to the shown precision (so equal-looking figures tie) and point higher-is-better. */
function directed(value: number, decimals: number, higherIsBetter: boolean): number {
  const r = Number(value.toFixed(decimals))
  return higherIsBetter ? r : -r
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

function onFile(league: League, n: number, noun = 'athlete'): string {
  return `${league} ${noun}${n === 1 ? '' : 's'} on file`
}

function rankWording(p: Placed, league: League, noun?: string): string {
  return `${p.tied ? 'tied for ' : ''}${ordinal(p.rank)} of ${p.n} ${onFile(league, p.n, noun)}`
}

/** "Max vertical" -> "max vertical", but "ERA" stays "ERA". */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

function possessive(name: string): string {
  return `${name}'s`
}

function pctClause(a: Athlete, rated: Rated | undefined): string {
  return rated ? `, around the ${ordinal(rated.percentile)} percentile for ${groupLabel(a)} by approximate norms` : ''
}

function signed(value: number, text: string): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}`
}

function signedInches(value: number): string {
  return signed(value, `${Math.abs(value).toFixed(1)} in`)
}

/** The one source behind every input, when there is exactly one. */
function sharedSource(...ms: Measured[]): string | undefined {
  const ids = new Set(ms.map((m) => m.sourceId))
  const [only] = [...ids]
  return ids.size === 1 ? only : undefined
}

interface EntryFields extends Omit<StandoutEntry, 'sourceId' | 'asOf' | 'sourceRank' | 'percentile' | 'percentileQuality'> {
  sourceId?: string | undefined
  asOf?: string | undefined
  sourceRank?: string | undefined
  rated?: Rated | undefined
}

/** Build an entry without undefined-valued keys, so entries compare and serialise cleanly. */
function makeEntry(f: EntryFields): StandoutEntry {
  const { rated, sourceId, asOf, sourceRank, ...rest } = f
  return {
    ...rest,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(asOf !== undefined ? { asOf } : {}),
    ...(sourceRank !== undefined ? { sourceRank } : {}),
    ...(rated ? { percentile: rated.percentile, percentileQuality: rated.percentileQuality } : {}),
  }
}

function base(a: Athlete, section: SectionId): Pick<StandoutEntry, 'section' | 'athleteId' | 'athleteName' | 'league' | 'positionGroup'> {
  return { section, athleteId: a.id, athleteName: a.name, league: a.league, positionGroup: groupOf(a) }
}

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

function zDesc(x: Candidate, y: Candidate): number {
  if (x.z === undefined) return y.z === undefined ? 0 : 1
  if (y.z === undefined) return -1
  return y.z - x.z
}

function tieBreak(x: Candidate, y: Candidate): number {
  return (y.strength ?? 0) - (x.strength ?? 0) || cmp(x.entry.athleteName, y.entry.athleteName) || cmp(x.entry.athleteId, y.entry.athleteId) || cmp(x.entry.metric, y.entry.metric)
}

type Order = (x: Candidate, y: Candidate) => number

/** Leaderboards: standing on file first, then the size of the field, then the position z. */
const byStanding: Order = (x, y) => y.standing - x.standing || y.n - x.n || zDesc(x, y) || tieBreak(x, y)
/** Rarest builds: how far beyond the position norm first, standing on file after. */
const byRarity: Order = (x, y) => zDesc(x, y) || y.standing - x.standing || y.n - x.n || tieBreak(x, y)
/** Hidden gems: the grade itself. */
const byGrade: Order = (x, y) => y.entry.value - x.entry.value || zDesc(x, y) || tieBreak(x, y)

/** Sort, keep each athlete's best entry, cap. */
function finish(candidates: Candidate[], order: Order): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  for (const c of [...candidates].sort(order)) {
    if (seen.has(c.entry.athleteId)) continue
    seen.add(c.entry.athleteId)
    out.push(c)
    if (out.length === SECTION_CAP) break
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Leaderboard sections

function metricCandidate(section: SectionId, a: Athlete, key: MetricKey, m: Measured, p: Placed, league: League, noun?: string): Candidate {
  const def = METRICS[key]
  const rated = isNormed(key) ? rate(a, key, m.value, m.quality) : undefined
  const display = formatMetric(key, m.value)
  const rankText = rankWording(p, league, noun)
  const entry = makeEntry({
    ...base(a, section),
    metric: key,
    label: def.label,
    value: m.value,
    display,
    quality: m.quality,
    sourceId: m.sourceId,
    asOf: m.asOf,
    rankText,
    sourceRank: m.rank,
    rated,
    outlier: rated?.outlier ?? false,
    why: `${possessive(a.name)} ${lowerFirst(def.label)} of ${display} ranks ${rankText}${pctClause(a, rated)}.`,
  })
  return { entry, n: p.n, standing: p.standing, z: rated?.z, noteLabel: lowerFirst(def.label), noun: onFile(league, p.n, noun) }
}

/** Every athlete's figure for one metric, ranked on file. */
function leaderboard(ctx: Ctx, section: SectionId, key: MetricKey, pool: readonly Athlete[], noun?: string): Candidate[] {
  const rows: { a: Athlete; m: Measured }[] = []
  for (const a of pool) {
    const m = take(ctx, a, key)
    if (m) rows.push({ a, m })
  }
  const def = METRICS[key]
  const places = place(rows.map((r) => directed(r.m.value, def.decimals, def.higherIsBetter)))
  return rows.map((r, i) => metricCandidate(section, r.a, key, r.m, places[i]!, ctx.league, noun))
}

function metricSection(ctx: Ctx, id: MetricSectionId): Candidate[] {
  const restrict = RESTRICT[id]?.[ctx.league]
  const pool = restrict ? ctx.field.filter((a) => restrict.groups.includes(groupOf(a))) : ctx.field
  return SECTION_METRICS[id][ctx.league].flatMap((key) => leaderboard(ctx, id, key, pool, restrict?.noun))
}

// ---------------------------------------------------------------------------------------------
// Rarest builds

interface DerivedRow {
  a: Athlete
  value: number
  display: string
  quality: Quality
  sourceId?: string | undefined
  asOf?: string | undefined
  rated?: Rated | undefined
  why: (rankText: string, rated: Rated | undefined) => string
}

function derivedCandidates(ctx: Ctx, metric: string, label: string, noteLabel: string, decimals: number, rows: DerivedRow[]): Candidate[] {
  const places = place(rows.map((r) => directed(r.value, decimals, true)))
  return rows.map((r, i) => {
    const p = places[i]!
    const rankText = rankWording(p, ctx.league)
    const entry = makeEntry({
      ...base(r.a, 'builds'),
      metric,
      label,
      value: r.value,
      display: r.display,
      quality: r.quality,
      sourceId: r.sourceId,
      asOf: r.asOf,
      rankText,
      rated: r.rated,
      outlier: r.rated?.outlier ?? false,
      why: r.why(rankText, r.rated),
    })
    return { entry, n: p.n, standing: p.standing, z: r.rated?.z, noteLabel, noun: onFile(ctx.league, p.n) }
  })
}

/** Speed Score: weight x 200 / 40 time^4, the classic size-adjusted 40 for NFL backs and receivers. */
export function speedScore(weightLb: number, fortyS: number): number {
  return (weightLb * 200) / Math.pow(fortyS, 4)
}

function speedScoreRows(ctx: Ctx): DerivedRow[] {
  const rows: DerivedRow[] = []
  for (const a of ctx.field) {
    const w = take(ctx, a, 'weightLb')
    const f = take(ctx, a, 'fortyS')
    if (!w || !f || !(f.value > 0)) continue
    const value = speedScore(w.value, f.value)
    const quality = weakest(w.quality, f.quality, 'ESTIMATED')
    const rated = rate(a, 'speedScore', value, quality)
    rows.push({
      a,
      value,
      display: `${value.toFixed(1)} (${formatMetric('weightLb', w.value)} at ${formatMetric('fortyS', f.value)})`,
      quality,
      sourceId: sharedSource(w, f),
      asOf: f.asOf,
      rated,
      why: (rankText, r) =>
        `${a.name} ran a ${formatMetric('fortyS', f.value)} 40-yard dash at ${formatMetric('weightLb', w.value)}, a Speed Score of ${value.toFixed(1)} (weight x 200 / 40 time^4) that ranks ${rankText}${pctClause(a, r)}.`,
    })
  }
  return rows
}

function apeIndexRows(ctx: Ctx): DerivedRow[] {
  const rows: DerivedRow[] = []
  for (const a of ctx.field) {
    const span = take(ctx, a, 'wingspanIn')
    const height = take(ctx, a, 'heightIn')
    if (!span || !height) continue
    const value = span.value - height.value
    const quality = weakest(span.quality, height.quality, 'ESTIMATED')
    const rated = rate(a, 'apeIndexIn', value, quality)
    rows.push({
      a,
      value,
      display: signedInches(value),
      quality,
      sourceId: sharedSource(span, height),
      asOf: span.asOf,
      rated,
      why: (rankText, r) =>
        `${possessive(a.name)} wingspan of ${formatMetric('wingspanIn', span.value)} against a height of ${formatMetric('heightIn', height.value)} gives ${signedInches(value)} of wingspan over height, which ranks ${rankText}${pctClause(a, r)}.`,
    })
  }
  return rows
}

function momentumRows(ctx: Ctx): DerivedRow[] {
  const rows: DerivedRow[] = []
  for (const a of ctx.field) {
    const w = take(ctx, a, 'weightLb')
    const s = take(ctx, a, 'sprintSpeedFtS')
    if (!w || !s) continue
    const value = w.value * LB_TO_KG * s.value * FTS_TO_MS
    rows.push({
      a,
      value,
      display: `${Math.round(value)} kg·m/s`,
      quality: weakest(w.quality, s.quality, 'ESTIMATED'),
      sourceId: sharedSource(w, s),
      asOf: s.asOf,
      // No MLB norm exists for momentum, so this build is ranked on file only.
      why: (rankText) =>
        `${a.name} carries ${formatMetric('weightLb', w.value)} at a sprint speed of ${formatMetric('sprintSpeedFtS', s.value)}, about ${Math.round(value)} kg·m/s of momentum (mass x speed), which ranks ${rankText}.`,
    })
  }
  return rows
}

interface Best {
  key: MetricKey
  m: Measured
  rated: Rated
}

function bestRated(ctx: Ctx, a: Athlete, keys: readonly MetricKey[]): Best | undefined {
  let best: Best | undefined
  for (const key of keys) {
    if (!isNormed(key)) continue
    const m = take(ctx, a, key)
    if (!m) continue
    const rated = rate(a, key, m.value, m.quality)
    if (rated && (!best || rated.z > best.rated.z)) best = { key, m, rated }
  }
  return best
}

function sizePhrase(key: MetricKey, value: number): string {
  const text = formatMetric(key, value)
  if (key === 'heightIn') return `at ${text} tall`
  if (key === 'wingspanIn') return `with a ${text} wingspan`
  return `at ${text}`
}

/**
 * Generic rare combination: the athlete's best speed figure and best size figure both at or
 * above the 95th percentile of the position norm. Ranked on file by the weaker of the two z.
 */
function comboCandidates(ctx: Ctx): Candidate[] {
  const rows: { a: Athlete; speed: Best; size: Best; score: number }[] = []
  for (const a of ctx.field) {
    const speed = bestRated(ctx, a, SECTION_METRICS.fastest[ctx.league])
    const size = bestRated(ctx, a, SIZE_METRICS)
    if (speed && size) rows.push({ a, speed, size, score: Math.min(speed.rated.z, size.rated.z) })
  }
  const places = place(rows.map((r) => directed(r.score, 2, true)))
  const out: Candidate[] = []
  rows.forEach((r, i) => {
    if (r.score < OUTLIER_Z) return
    const p = places[i]!
    const { a, speed, size } = r
    const percentile = Math.min(speed.rated.percentile, size.rated.percentile)
    const quality = weakest(speed.m.quality, size.m.quality, 'ESTIMATED')
    const speedDef = METRICS[speed.key]
    const sizeDef = METRICS[size.key]
    const speedText = formatMetric(speed.key, speed.m.value)
    const sizeText = formatMetric(size.key, size.m.value)
    const entry = makeEntry({
      ...base(a, 'builds'),
      metric: 'rareCombo',
      label: `${speedDef.label} + ${sizeDef.label}`,
      value: percentile,
      display: `${speedText} ${lowerFirst(speedDef.label)} ${sizePhrase(size.key, size.m.value)}`,
      quality,
      sourceId: sharedSource(speed.m, size.m),
      asOf: speed.m.asOf,
      rankText: rankWording(p, ctx.league),
      rated: { z: r.score, percentile, percentileQuality: weakest(quality, 'ESTIMATED'), outlier: true },
      outlier: true,
      why: `${possessive(a.name)} ${lowerFirst(speedDef.label)} (${speedText}) and ${lowerFirst(sizeDef.label)} (${sizeText}) both sit at or above the 95th percentile for ${groupLabel(a)} by approximate norms, a rare size-speed pairing.`,
    })
    out.push({ entry, n: p.n, standing: p.standing, z: r.score, noteLabel: 'size-speed combinations', noun: onFile(ctx.league, p.n) })
  })
  return out
}

function buildsSection(ctx: Ctx): Candidate[] {
  const out: Candidate[] = []
  if (ctx.league === 'NFL') {
    out.push(...derivedCandidates(ctx, 'speedScore', 'Speed Score', 'Speed Score', 1, speedScoreRows(ctx)))
  }
  if (ctx.league === 'NBA') {
    out.push(...derivedCandidates(ctx, 'apeIndexIn', 'Wingspan minus height', 'wingspan minus height', 1, apeIndexRows(ctx)))
    out.push(...leaderboard(ctx, 'builds', 'standingReachIn', ctx.field))
  }
  if (ctx.league === 'MLB') {
    out.push(...derivedCandidates(ctx, 'momentum', 'Momentum at sprint speed', 'momentum at sprint speed', 0, momentumRows(ctx)))
  }
  out.push(...comboCandidates(ctx))
  return out
}

// ---------------------------------------------------------------------------------------------
// Rising and Most improved

/**
 * The latest season line and the one before it, by year. Both years must have a single line
 * (a split season cannot be compared honestly), and the latest must be recent.
 */
function lastTwo(ctx: Ctx, a: Athlete): [SeasonLine, SeasonLine] | undefined {
  const years = [...new Set(a.seasons.map((s) => s.year))].sort((x, y) => y - x)
  const [latest, previous] = years
  if (latest === undefined || previous === undefined || latest < ctx.recentYear) return undefined
  const after = a.seasons.filter((s) => s.year === latest)
  const before = a.seasons.filter((s) => s.year === previous)
  if (after.length !== 1 || before.length !== 1) return undefined
  return [before[0]!, after[0]!]
}

/** A season's own figure (yards per carry derived from that season's line), never the profile's. */
function seasonValue(s: SeasonLine, key: MetricKey): Measured | undefined {
  const own = s.metrics[key]
  if (own || key !== 'rushYardsPerCarry') return own
  const yards = s.metrics.rushYards
  const carries = s.metrics.carries
  if (!yards || !carries || !(carries.value > 0)) return undefined
  return { value: yards.value / carries.value, quality: weakest(yards.quality, carries.quality), sourceId: yards.sourceId }
}

function improvedSection(ctx: Ctx): Candidate[] {
  const out: Candidate[] = []
  for (const key of PRODUCTION_METRICS[ctx.league]) {
    const def = METRICS[key]
    const rows: { a: Athlete; before: SeasonLine; after: SeasonLine; was: Measured; now: Measured; delta: number }[] = []
    for (const a of ctx.field) {
      const pair = lastTwo(ctx, a)
      if (!pair) continue
      const [before, after] = pair
      const was = seasonValue(before, key)
      const now = seasonValue(after, key)
      if (!was || !now) continue
      if (was.quality === 'SIMULATED') ctx.simulated.add(`${a.id}:${before.year}:${key}`)
      if (now.quality === 'SIMULATED') ctx.simulated.add(`${a.id}:${after.year}:${key}`)
      if (!usable(was) || !usable(now)) continue
      rows.push({ a, before, after, was, now, delta: now.value - was.value })
    }
    const scores = rows.map((r) => directed(r.delta, def.decimals, def.higherIsBetter))
    const places = place(scores)
    rows.forEach((r, i) => {
      if (!(scores[i]! > 0)) return
      const p = places[i]!
      const rankText = rankWording(p, ctx.league)
      const from = formatMetric(key, r.was.value)
      const to = formatMetric(key, r.now.value)
      const entry = makeEntry({
        ...base(r.a, 'improved'),
        metric: `${key}Gain`,
        label: `${def.label}, ${r.before.season} to ${r.after.season}`,
        value: r.delta,
        display: `${signed(r.delta, formatMetric(key, Math.abs(r.delta)))} (${from} to ${to})`,
        quality: weakest(r.was.quality, r.now.quality, 'ESTIMATED'),
        sourceId: sharedSource(r.was, r.now),
        asOf: r.after.season,
        rankText,
        outlier: false,
        why: `${possessive(r.a.name)} ${lowerFirst(def.label)} went from ${from} in ${r.before.season} to ${to} in ${r.after.season}, an improvement that ranks ${rankText}.`,
      })
      const strength = r.was.value !== 0 ? scores[i]! / Math.abs(r.was.value) : 0
      out.push({ entry, n: p.n, standing: p.standing, strength, noteLabel: `season-over-season ${lowerFirst(def.label)}`, noun: onFile(ctx.league, p.n) })
    })
  }
  return out
}

function risingSection(ctx: Ctx): Candidate[] {
  const rows: { a: Athlete; before: { season: string; overall: number; quality: Quality }; after: { season: string; overall: number; quality: Quality } }[] = []
  for (const a of ctx.field) {
    const pair = lastTwo(ctx, a)
    if (!pair) continue
    // Position groups without overall weights have no overall grade to compare.
    if (overall(a).weights.length === 0) continue
    const history = gradeHistory(a)
    const before = history.find((h) => h.year === pair[0].year)
    const after = history.find((h) => h.year === pair[1].year)
    if (!before || !after) continue
    if (before.quality === 'SIMULATED' || after.quality === 'SIMULATED') {
      ctx.simulated.add(`${a.id}:overall`)
      continue
    }
    rows.push({ a, before, after })
  }
  const scores = rows.map((r) => r.after.overall - r.before.overall)
  const places = place(scores)
  const out: Candidate[] = []
  rows.forEach((r, i) => {
    const gain = scores[i]!
    if (!(gain > 0)) return
    const p = places[i]!
    const rankText = rankWording(p, ctx.league)
    const entry = makeEntry({
      ...base(r.a, 'rising'),
      metric: 'overallGain',
      label: `Overall grade, ${r.before.season} to ${r.after.season}`,
      value: gain,
      display: `${signed(gain, String(gain))} (${r.before.overall} to ${r.after.overall})`,
      quality: weakest(r.before.quality, r.after.quality, 'ESTIMATED'),
      asOf: r.after.season,
      rankText,
      outlier: false,
      why: `${possessive(r.a.name)} overall grade went from ${r.before.overall} in ${r.before.season} to ${r.after.overall} in ${r.after.season}, an improvement that ranks ${rankText}.`,
    })
    out.push({ entry, n: p.n, standing: p.standing, strength: gain, noteLabel: 'season-over-season overall grade', noun: onFile(ctx.league, p.n) })
  })
  return out
}

// ---------------------------------------------------------------------------------------------
// Hidden gems

/**
 * Why an athlete counts as little known, or undefined when he does not or nobody knows. A known
 * All-Star (or Pro Bowler) is never hidden, whatever his draft slot; Legends are never hidden.
 */
export function lowRecognition(a: Athlete): string | undefined {
  if (a.status === 'legend') return undefined
  const r = a.recognition
  if (r?.allStarSelections !== undefined && r.allStarSelections > 0) return undefined
  const honor = a.league === 'NFL' ? 'Pro Bowl' : 'All-Star'
  const reasons: string[] = []
  if (r?.undrafted) reasons.push('went undrafted')
  else if (r?.draftRound !== undefined && r.draftRound >= 4) reasons.push(`was a ${ordinal(r.draftRound)}-round pick`)
  if (a.status === 'practice-squad') reasons.push('is on the practice squad')
  if (a.status === 'two-way') reasons.push('is on a two-way contract')
  if (a.status === 'ten-day') reasons.push('is on a ten-day contract')
  if (r?.allStarSelections === 0) reasons.push(`has no ${honor} selections`)
  return reasons.length ? reasons.slice(0, 2).join(' and ') : undefined
}

function hiddenSection(ctx: Ctx): Candidate[] {
  const def = GRADE_DEFS.find((d) => d.id === 'athleticism')
  if (!def) return []
  const rows: { a: Athlete; value: number; z: number; quality: Quality; normGroup: string }[] = []
  for (const a of ctx.field) {
    const g = computeGrade(def, a)
    if (g.quality === 'SIMULATED') {
      ctx.simulated.add(`${a.id}:athleticism`)
      continue
    }
    rows.push({ a, value: g.value, z: g.z, quality: g.quality, normGroup: g.normGroup })
  }
  const places = place(rows.map((r) => r.value))
  const out: Candidate[] = []
  rows.forEach((r, i) => {
    if (r.value < HIDDEN_GEM_MIN_ATHLETICISM) return
    const reason = lowRecognition(r.a)
    if (!reason) return
    const p = places[i]!
    const quality = weakest(r.quality, 'ESTIMATED')
    const rated: Rated = { z: r.z, percentile: percentileOf(r.z), percentileQuality: quality, outlier: r.z >= OUTLIER_Z }
    const entry = makeEntry({
      ...base(r.a, 'hidden'),
      metric: 'athleticism',
      label: 'Athleticism grade',
      value: r.value,
      display: `${r.value} athleticism`,
      quality,
      rankText: rankWording(p, ctx.league),
      rated,
      outlier: rated.outlier,
      why: `${r.a.name} grades ${r.value} for athleticism, around the ${ordinal(rated.percentile)} percentile for ${r.normGroup} by approximate norms, yet ${reason}.`,
    })
    out.push({ entry, n: p.n, standing: p.standing, z: r.z, noteLabel: 'athleticism grades', noun: onFile(ctx.league, p.n) })
  })
  return out
}

// ---------------------------------------------------------------------------------------------
// Public API

/**
 * The standouts page for one league. Pure: the same athletes and date give the same page, in
 * any input order. `today` sets the week and how recent a season must be to count as rising.
 */
export function buildStandouts(athletes: readonly Athlete[], options: StandoutOptions): Standouts {
  const { league, today } = options
  const generatedWeek = weekOf(today)
  const minSample = Math.max(1, Math.floor(options.minSample ?? DEFAULT_MIN_SAMPLE))
  const field: Athlete[] = []
  const seen = new Set<string>()
  for (const a of athletes) {
    if (a.league !== league || seen.has(a.id)) continue
    seen.add(a.id)
    field.push(a)
  }
  const ctx: Ctx = { league, field, recentYear: today.getUTCFullYear() - 1, simulated: new Set() }

  const chosen: Record<SectionId, Candidate[]> = {
    fastest: finish(metricSection(ctx, 'fastest'), byStanding),
    explosive: finish(metricSection(ctx, 'explosive'), byStanding),
    strongest: finish(metricSection(ctx, 'strongest'), byStanding),
    arms: finish(metricSection(ctx, 'arms'), byStanding),
    builds: finish(buildsSection(ctx), byRarity),
    rising: finish(risingSection(ctx), byStanding),
    improved: finish(improvedSection(ctx), byStanding),
    hidden: finish(hiddenSection(ctx), byGrade),
  }

  const notes: string[] = []
  if (field.length === 0) notes.push(`No ${league} athletes on file.`)
  const small = new Set<string>()
  for (const id of SECTION_IDS) {
    for (const c of chosen[id]) {
      if (c.n >= minSample) continue
      const note = `Ranks for ${c.noteLabel} are among a small sample (${c.n} ${c.noun}).`
      if (!small.has(note)) {
        small.add(note)
        notes.push(note)
      }
    }
  }
  if (SECTION_IDS.some((id) => chosen[id].some((c) => c.entry.percentile !== undefined))) {
    notes.push('Percentiles compare against approximate position norms, so they are ESTIMATED even when the figure itself is VERIFIED.')
  }
  if (field.length > 0) {
    notes.push(`Rising and Most improved compare each athlete's latest season with the one before, and only when the latest ended in ${ctx.recentYear} or later.`)
  }
  if (ctx.simulated.size > 0) {
    const n = ctx.simulated.size
    notes.push(`${n} SIMULATED figure${n === 1 ? ' was' : 's were'} left out: demo values never qualify.`)
  }

  return {
    league,
    generatedWeek,
    sections: SECTION_IDS.map((id) => ({ id, label: sectionLabel(id, league), entries: chosen[id].map((c) => c.entry) })),
    notes,
  }
}

/**
 * Every figure of one athlete at or above the 95th percentile of his position norm, strongest
 * first. Derived builds (Speed Score, wingspan minus height) are included where a norm exists.
 */
export function outliers(a: Athlete): Outlier[] {
  const rows: { metric: string; label: string; value: number; display: string; quality: Quality; inputs: Measured[]; rated: Rated; rank?: string | undefined }[] = []
  for (const key of NORMED_METRICS) {
    const m = resolveMetric(a, key)
    if (!usable(m)) continue
    const rated = rate(a, key, m.value, m.quality)
    if (rated?.outlier) rows.push({ metric: key, label: METRICS[key].label, value: m.value, display: formatMetric(key, m.value), quality: m.quality, inputs: [m], rated, rank: m.rank })
  }
  const w = resolveMetric(a, 'weightLb')
  const f = resolveMetric(a, 'fortyS')
  if (usable(w) && usable(f) && f.value > 0) {
    const value = speedScore(w.value, f.value)
    const quality = weakest(w.quality, f.quality, 'ESTIMATED')
    const rated = rate(a, 'speedScore', value, quality)
    if (rated?.outlier) rows.push({ metric: 'speedScore', label: 'Speed Score', value, display: value.toFixed(1), quality, inputs: [w, f], rated })
  }
  const span = resolveMetric(a, 'wingspanIn')
  const height = resolveMetric(a, 'heightIn')
  if (usable(span) && usable(height)) {
    const value = span.value - height.value
    const quality = weakest(span.quality, height.quality, 'ESTIMATED')
    const rated = rate(a, 'apeIndexIn', value, quality)
    if (rated?.outlier) rows.push({ metric: 'apeIndexIn', label: 'Wingspan minus height', value, display: signedInches(value), quality, inputs: [span, height], rated })
  }
  return rows
    .sort((x, y) => y.rated.z - x.rated.z || cmp(x.metric, y.metric))
    .map((r) => {
      const sourceId = sharedSource(...r.inputs)
      const asOf = r.inputs[0]?.asOf
      return {
        athleteId: a.id,
        athleteName: a.name,
        league: a.league,
        positionGroup: groupOf(a),
        metric: r.metric,
        label: r.label,
        value: r.value,
        display: r.display,
        quality: r.quality,
        ...(sourceId !== undefined ? { sourceId } : {}),
        ...(asOf !== undefined ? { asOf } : {}),
        ...(r.rank !== undefined ? { sourceRank: r.rank } : {}),
        z: r.rated.z,
        percentile: r.rated.percentile,
        percentileQuality: r.rated.percentileQuality,
        why: `${possessive(a.name)} ${lowerFirst(r.label)} of ${r.display} is around the ${ordinal(r.rated.percentile)} percentile for ${groupLabel(a)} by approximate norms.`,
      }
    })
}
