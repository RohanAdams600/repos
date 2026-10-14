import type { Athlete, League, Quality } from './types'
import { weakest } from './types'
import { YD_TO_M } from './metrics'
import { gradesFor, overall, OVERALL_MIN_COVERAGE } from '../grades/grades'
import { challenge, createLadder, parseLadder, serializeLadder, singleElimination, type Bracket, type Ladder, type MatchResult } from '../sim/brackets'
import { agilityValue, jumpValue } from '../sim/events'
import { homeToFirst } from '../sim/mlb-events'
import { createRng, gaussian, hashString } from '../sim/rng'
import { runSprint, sprintProfile } from '../sim/sprint'

/**
 * State and match logic behind the Brackets page: the events a bracket or ladder match can be
 * decided by, ladders kept per league and event in this browser, and the #ladder.<code> share
 * link. Free of the DOM so all of it is unit-tested.
 *
 * Every match is one seeded attempt each: the athlete's expected mark (a model on the figures
 * on file, at best ESTIMATED) plus a random draw, so every result is SIMULATED.
 */

export type BracketEvent = 'forty' | 'homeToFirst' | 'maxVertical' | 'laneAgility' | 'overall'

export interface EventDef {
  id: BracketEvent
  label: string
  /** Unit after a mark; 'pts' for the overall-grade game score. */
  unit: string
  decimals: number
  lowerWins: boolean
  /** Spread of one attempt around the expected mark. A model setting, not a league statistic. */
  noise: number
}

export const EVENTS: Record<BracketEvent, EventDef> = {
  forty: { id: 'forty', label: '40-yard dash', unit: 's', decimals: 2, lowerWins: true, noise: 0.04 },
  homeToFirst: { id: 'homeToFirst', label: 'Home-to-first sprint', unit: 's', decimals: 2, lowerWins: true, noise: 0.06 },
  maxVertical: { id: 'maxVertical', label: 'Max vertical', unit: 'in', decimals: 1, lowerWins: false, noise: 1.2 },
  laneAgility: { id: 'laneAgility', label: 'Lane agility', unit: 's', decimals: 2, lowerWins: true, noise: 0.15 },
  overall: { id: 'overall', label: 'Overall grade', unit: 'pts', decimals: 1, lowerWins: false, noise: 4 },
}

export const LEAGUES: readonly League[] = ['NFL', 'MLB', 'NBA']

/** Events offered per league: each league's signature test, plus the overall grade. */
export const LEAGUE_EVENTS: Record<League, readonly BracketEvent[]> = {
  NFL: ['forty', 'overall'],
  MLB: ['homeToFirst', 'overall'],
  NBA: ['maxVertical', 'laneAgility', 'overall'],
}

export const MIN_ENTRANTS = 2
export const MAX_ENTRANTS = 16
export const DEFAULT_FIELD = 8

export function isLeague(x: unknown): x is League {
  return typeof x === 'string' && (LEAGUES as readonly string[]).includes(x)
}

export function isLeagueEvent(league: League, x: unknown): x is BracketEvent {
  return typeof x === 'string' && (LEAGUE_EVENTS[league] as readonly string[]).includes(x)
}

// ---------------------------------------------------------------------------------------------
// Expected marks and attempts

export interface Expected {
  value: number
  quality: Quality
  basis: string
  /** True when the mark rests on defaults rather than the athlete's own figures. */
  thin: boolean
}

/**
 * Athletes are immutable values (saving one makes a new object), so marks and coverage are cached
 * per object: sorting and seeding a large imported roster would otherwise grade everyone again
 * on every click.
 */
const markCache = new WeakMap<Athlete, Map<BracketEvent, Expected>>()
const coverageCache = new WeakMap<Athlete, number>()

/** The athlete's expected mark in an event, from the figures on file. Never better than its inputs. */
export function expectedMark(a: Athlete, event: BracketEvent): Expected {
  let marks = markCache.get(a)
  if (!marks) markCache.set(a, (marks = new Map()))
  let e = marks.get(event)
  if (!e) marks.set(event, (e = computeMark(a, event)))
  return e
}

function computeMark(a: Athlete, event: BracketEvent): Expected {
  switch (event) {
    case 'forty': {
      const p = sprintProfile(a)
      return { value: runSprint(p, 40 * YD_TO_M).time, quality: weakest(p.quality, 'ESTIMATED'), basis: `${p.basis} 40 yards from a standstill on the sprint model.`, thin: p.quality === 'SIMULATED' }
    }
    case 'homeToFirst': {
      const r = homeToFirst(a)
      return { value: r.time, quality: r.quality, basis: r.basis, thin: r.quality === 'SIMULATED' }
    }
    case 'maxVertical': {
      const r = jumpValue(a, 'maxVertical')
      return { value: r.value, quality: r.quality, basis: r.basis, thin: r.quality === 'SIMULATED' }
    }
    case 'laneAgility': {
      const r = agilityValue(a, 'laneAgility')
      return { value: r.value, quality: r.quality, basis: r.basis, thin: r.quality === 'SIMULATED' }
    }
    case 'overall': {
      const o = overall(a, gradesFor(a))
      const basis = o.enough ? o.formula : `Under ${Math.round(OVERALL_MIN_COVERAGE * 100)}% of this overall rests on measured grades; position baselines fill the rest. ${o.formula}`
      return { value: o.value, quality: o.quality, basis, thin: !o.enough }
    }
  }
}

/** Mark with its unit, e.g. "4.38 s". */
export function formatMark(event: BracketEvent, value: number, decimals = EVENTS[event].decimals): string {
  return `${value.toFixed(decimals)} ${EVENTS[event].unit}`
}

/** One seeded attempt: the expected mark plus a normal draw of the event's spread. */
export function attempt(expected: Expected, event: BracketEvent, rng: () => number): number {
  return Math.max(0, expected.value + gaussian(rng) * EVENTS[event].noise)
}

export interface EventRun {
  athleteId: string
  mark: number
  display: string
}

export interface EventMatch extends MatchResult {
  quality: Quality
  a: EventRun
  b: EventRun
}

/**
 * One heat: a draws first, then b, from the same generator. The better mark wins; an exact tie
 * goes to a coin flip. Marks that look equal at the usual precision get more decimals.
 */
export function playHeat(event: BracketEvent, a: Athlete, ea: Expected, b: Athlete, eb: Expected, rng: () => number): EventMatch {
  const def = EVENTS[event]
  const ma = attempt(ea, event, rng)
  const mb = attempt(eb, event, rng)
  const aWins = ma === mb ? rng() < 0.5 : def.lowerWins ? ma < mb : ma > mb
  let decimals = def.decimals
  while (decimals < def.decimals + 2 && ma.toFixed(decimals) === mb.toFixed(decimals)) decimals++
  return {
    winner: aWins ? a.id : b.id,
    score: `${ma.toFixed(decimals)} v ${mb.toFixed(decimals)} ${def.unit}`,
    quality: 'SIMULATED',
    a: { athleteId: a.id, mark: ma, display: formatMark(event, ma, decimals) },
    b: { athleteId: b.id, mark: mb, display: formatMark(event, mb, decimals) },
  }
}

/** Per-match generator: the same seed, event and pairing always replay the same heat. */
export function heatRng(seed: number, event: BracketEvent, key: string): () => number {
  return createRng((seed ^ hashString(`${event}:${key}`)) >>> 0)
}

// ---------------------------------------------------------------------------------------------
// Fields, seeding and brackets

/** Share of the overall grade's weight on measured grades (0..1). */
export function coverageOf(a: Athlete): number {
  let c = coverageCache.get(a)
  if (c === undefined) coverageCache.set(a, (c = overall(a, gradesFor(a)).coverage))
  return c
}

/**
 * Data coverage order for an event: athletes with their own figures for the event first, then
 * by overall-grade coverage, then by how many figures are on file, then by name.
 */
export function byCoverage(athletes: readonly Athlete[], event: BracketEvent): Athlete[] {
  const rows = athletes.map((a) => ({ a, thin: expectedMark(a, event).thin, cov: coverageOf(a), n: Object.keys(a.metrics).length }))
  rows.sort((x, y) => Number(x.thin) - Number(y.thin) || y.cov - x.cov || y.n - x.n || x.a.name.localeCompare(y.a.name) || cmp(x.a.id, y.a.id))
  return rows.map((r) => r.a)
}

/** The default field: the league's top `n` athletes by data coverage for the event. */
export function defaultEntrants(athletes: readonly Athlete[], league: League, event: BracketEvent, n = DEFAULT_FIELD): string[] {
  const size = Math.max(0, Math.min(MAX_ENTRANTS, Math.floor(n)))
  return byCoverage(unique(athletes.filter((a) => a.league === league)), event)
    .slice(0, size)
    .map((a) => a.id)
}

/** Seeds by expected mark, best first; marks resting on defaults go to the bottom. */
export function seedEntrants(athletes: readonly Athlete[], event: BracketEvent): Athlete[] {
  const def = EVENTS[event]
  const rows = unique(athletes).map((a) => ({ a, e: expectedMark(a, event) }))
  rows.sort((x, y) => Number(x.e.thin) - Number(y.e.thin) || (def.lowerWins ? x.e.value - y.e.value : y.e.value - x.e.value) || x.a.name.localeCompare(y.a.name) || cmp(x.a.id, y.a.id))
  return rows.map((r) => r.a)
}

export interface EventBracket {
  bracket: Bracket
  /** Seed numbers (1 = top seed) by athlete id. */
  seeds: Map<string, number>
  /** Each entrant's mark in each played match, keyed `${round}:${match}`. */
  heats: Map<string, { a: EventRun; b: EventRun }>
}

/** Seeds the athletes for the event and plays a single-elimination bracket with seeded heats. */
export function runEventBracket(athletes: readonly Athlete[], event: BracketEvent, seed: number): EventBracket {
  const seeded = seedEntrants(athletes, event)
  const byId = new Map(seeded.map((a) => [a.id, a]))
  const expected = new Map(seeded.map((a) => [a.id, expectedMark(a, event)]))
  const heats = new Map<string, { a: EventRun; b: EventRun }>()
  const bracket = singleElimination(
    seeded.map((a) => a.id),
    (a, b, round, match) => {
      const heat = playHeat(event, byId.get(a)!, expected.get(a)!, byId.get(b)!, expected.get(b)!, heatRng(seed, event, `${round}:${match}:${a}:${b}`))
      heats.set(`${round}:${match}`, { a: heat.a, b: heat.b })
      return heat
    },
  )
  return { bracket, seeds: new Map(seeded.map((a, i) => [a.id, i + 1])), heats }
}

// ---------------------------------------------------------------------------------------------
// Ladders

/** Results kept per stored ladder: enough history to read, small enough for local storage. */
export const HISTORY_CAP = 100
/** Results carried in a share link, so the link stays short enough to paste anywhere. */
export const SHARE_HISTORY_CAP = 25

export function trimHistory(ladder: Ladder, cap: number): Ladder {
  return ladder.history.length <= cap ? ladder : { order: ladder.order, history: ladder.history.slice(-cap) }
}

/** A new ladder for the event, top rung to the best expected mark. */
export function createEventLadder(athletes: readonly Athlete[], event: BracketEvent): Ladder {
  return createLadder(seedEntrants(athletes, event).map((a) => a.id))
}

/**
 * Plays one challenge at time `at` and returns the new ladder (history capped) and the heat.
 * Throws when canChallenge is false, like challenge() itself.
 */
export function playLadderChallenge(ladder: Ladder, event: BracketEvent, challenger: Athlete, defender: Athlete, at: number): { ladder: Ladder; heat: EventMatch } {
  let heat: EventMatch | undefined
  const rng = heatRng(hashString(`${at}:${ladder.history.length}`), event, `${challenger.id}:${defender.id}`)
  const next = challenge(
    ladder,
    challenger.id,
    defender.id,
    () => {
      heat = playHeat(event, challenger, expectedMark(challenger, event), defender, expectedMark(defender, event), rng)
      return heat
    },
    at,
  )
  return { ladder: trimHistory(next, HISTORY_CAP), heat: heat! }
}

/** The minimal Web Storage surface the store needs, so tests can pass a fake or a broken one. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LadderStore {
  load(league: League, event: BracketEvent): Ladder | null
  save(league: League, event: BracketEvent, ladder: Ladder): void
  reset(league: League, event: BracketEvent): void
}

export function ladderKey(league: League, event: BracketEvent): string {
  return `crossover-lab:ladder:v1:${league}:${event}`
}

/**
 * Ladders in Web Storage, mirrored in memory. Private windows and blocked or full storage throw;
 * then the ladder lasts for this visit only. Memory is read first so a failed write or delete
 * never brings back an older stored copy; null in memory marks a reset.
 */
export function createLadderStore(storage: () => StorageLike | null | undefined): LadderStore {
  const memory = new Map<string, string | null>()
  const get = (): StorageLike | null => {
    try {
      return storage() ?? null
    } catch {
      return null
    }
  }
  return {
    load(league, event) {
      const key = ladderKey(league, event)
      let text: string | null | undefined = memory.get(key)
      if (text === undefined) {
        try {
          text = get()?.getItem(key) ?? null
        } catch {
          text = null
        }
      }
      return text ? parseLadder(text) : null
    },
    save(league, event, ladder) {
      const key = ladderKey(league, event)
      const text = serializeLadder(trimHistory(ladder, HISTORY_CAP))
      memory.set(key, text)
      try {
        get()?.setItem(key, text)
      } catch {
        // Storage blocked or full: memory keeps it for this visit.
      }
    },
    reset(league, event) {
      const key = ladderKey(league, event)
      memory.set(key, null)
      try {
        get()?.removeItem(key)
      } catch {
        // Storage blocked: the memory tombstone hides any stored copy for this visit.
      }
    },
  }
}

/** The app's store, on this browser's local storage. */
export const ladderStore: LadderStore = createLadderStore(() => globalThis.localStorage)

export function loadLadder(league: League, event: BracketEvent): Ladder | null {
  return ladderStore.load(league, event)
}

export function saveLadder(league: League, event: BracketEvent, ladder: Ladder): void {
  ladderStore.save(league, event, ladder)
}

export function resetLadder(league: League, event: BracketEvent): void {
  ladderStore.reset(league, event)
}

// ---------------------------------------------------------------------------------------------
// Share links

export const LADDER_HASH_PREFIX = '#ladder.'

export interface SharedLadder {
  league: League
  event: BracketEvent
  ladder: Ladder
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/**
 * '#ladder.<base64url>' for a ladder. The payload is serializeLadder's JSON with the league and
 * event added, so parseLadder reads it as it is. Only the latest SHARE_HISTORY_CAP results go.
 */
export function ladderHash(league: League, event: BracketEvent, ladder: Ladder): string {
  const doc = JSON.parse(serializeLadder(trimHistory(ladder, SHARE_HISTORY_CAP))) as Record<string, unknown>
  return `${LADDER_HASH_PREFIX}${toBase64Url(JSON.stringify({ ...doc, league, event }))}`
}

/** Reads a '#ladder.<code>' hash (the '#' is optional). Null for anything malformed. */
export function parseLadderHash(hash: string): SharedLadder | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash
  const prefix = LADDER_HASH_PREFIX.slice(1)
  if (!text.startsWith(prefix)) return null
  const json = fromBase64Url(text.slice(prefix.length))
  if (json === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { league, event } = raw as Record<string, unknown>
  if (!isLeague(league) || !isLeagueEvent(league, event)) return null
  const ladder = parseLadder(json)
  return ladder ? { league, event, ladder } : null
}

// ---------------------------------------------------------------------------------------------

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

/** First of each id: brackets and ladders key results by id, so a repeat would be ambiguous. */
function unique(athletes: readonly Athlete[]): Athlete[] {
  const seen = new Set<string>()
  return athletes.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
}
