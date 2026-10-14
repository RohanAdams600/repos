import type { Quality } from '../data/types'
import { weakest } from '../data/types'

/**
 * Single-elimination brackets and a challenge ladder for running many head-to-heads. Neither
 * decides a result itself: the caller's play function does (usually a seeded sim), so the
 * structures stay pure and every result keeps that function's quality label, floored at
 * ESTIMATED because a head-to-head is always a model output, never a measurement.
 */

export interface MatchResult {
  winner: string
  score: string
  /** How the result was decided. Omitted means SIMULATED (random draws). */
  quality?: Quality
}

/** Decides one bracket match. round and match are 0-based indexes into Bracket.rounds. */
export type PlayFn = (a: string, b: string, round: number, match: number) => MatchResult

export interface BracketMatch {
  a: string | null
  b: string | null
  winner: string | null
  /** The play function's score; '' for a bye. */
  score: string
  bye: boolean
  /** null for a bye: nothing was contested, so there is no result to label. */
  quality: Quality | null
}

export interface BracketRound {
  name: string
  matches: BracketMatch[]
}

export interface Bracket {
  rounds: BracketRound[]
  champion: string | null
  /** Weakest label over the played matches; null when nothing was played. */
  quality: Quality | null
}

/** Slot order for a power-of-two field, so seeds 1 and 2 can only meet in the final. */
export function seedOrder(size: number): number[] {
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(Math.log2(size))) {
    throw new RangeError(`bracket size must be a power of two, got ${size}`)
  }
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

/** Broadcast-style name for a round with this many matches. */
export function roundName(matches: number): string {
  if (matches === 1) return 'Final'
  if (matches === 2) return 'Semifinals'
  if (matches === 4) return 'Quarterfinals'
  return `Round of ${matches * 2}`
}

/** Ids key every result, so a blank or repeated id would make winners ambiguous. */
function assertUnique(ids: readonly string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || id === '') throw new TypeError('ids must be non-empty strings')
    if (seen.has(id)) throw new Error(`duplicate id: ${id}`)
    seen.add(id)
  }
}

function decide(a: string, b: string, r: MatchResult): { winner: string; score: string; quality: Quality } {
  if (r.winner !== a && r.winner !== b) throw new Error(`play returned winner "${r.winner}", expected "${a}" or "${b}"`)
  return { winner: r.winner, score: r.score, quality: weakest(r.quality ?? 'SIMULATED', 'ESTIMATED') }
}

function playMatch(a: string | null, b: string | null, round: number, match: number, play: PlayFn): BracketMatch {
  if (a !== null && b !== null) {
    const r = decide(a, b, play(a, b, round, match))
    return { a, b, winner: r.winner, score: r.score, bye: false, quality: r.quality }
  }
  return { a, b, winner: a ?? b, score: '', bye: true, quality: null }
}

/**
 * Seeds entrants in the given order (1 v N, 2 v N-1 ...) and plays every match. A field that is
 * not a power of two is padded with byes, and the byes go to the top seeds. Round 0 lists matches
 * in bracket order, and match i of round r+1 is fed by matches 2i and 2i+1 of round r. Fewer than
 * two entrants plays nothing, and a lone entrant is the champion.
 */
export function singleElimination(entrants: readonly string[], play: PlayFn): Bracket {
  assertUnique(entrants)
  if (entrants.length < 2) return { rounds: [], champion: entrants[0] ?? null, quality: null }
  const size = 2 ** Math.ceil(Math.log2(entrants.length))
  let field: (string | null)[] = seedOrder(size).map((seed) => entrants[seed - 1] ?? null)
  const rounds: BracketRound[] = []
  while (field.length > 1) {
    const round = rounds.length
    const matches: BracketMatch[] = []
    for (let m = 0; m < field.length / 2; m++) matches.push(playMatch(field[2 * m] ?? null, field[2 * m + 1] ?? null, round, m, play))
    rounds.push({ name: roundName(matches.length), matches })
    field = matches.map((m) => m.winner)
  }
  const played = rounds.flatMap((r) => r.matches.flatMap((m) => (m.quality ? [m.quality] : [])))
  return { rounds, champion: field[0] ?? null, quality: played.length > 0 ? weakest(...played) : null }
}

export interface LadderResult {
  challenger: string
  defender: string
  winner: string
  score: string
  /** The caller's clock (for example Date.now()), passed in so the module stays pure. */
  at: number
  quality: Quality
}

/** order[0] is the top rung. Read-only: challenge returns a new ladder instead of editing this one. */
export interface Ladder {
  readonly order: readonly string[]
  readonly history: readonly LadderResult[]
}

export type LadderPlay = (challenger: string, defender: string) => MatchResult

/** How many rungs up a challenge may reach, so nobody vaults from the bottom to the top. */
export const LADDER_REACH = 2

export function createLadder(ids: readonly string[]): Ladder {
  assertUnique(ids)
  return { order: [...ids], history: [] }
}

/** True when both are on the ladder and the defender sits one or two places above the challenger. */
export function canChallenge(ladder: Ladder, challenger: string, defender: string): boolean {
  const c = ladder.order.indexOf(challenger)
  const d = ladder.order.indexOf(defender)
  return c >= 0 && d >= 0 && d < c && c - d <= LADDER_REACH
}

/**
 * Plays one challenge and returns a new ladder. A winning challenger takes the defender's spot
 * and everyone from there down to the challenger's old spot shifts down one. A defence leaves the
 * order alone. Either way the result is appended to the history. Throws when canChallenge is false.
 */
export function challenge(ladder: Ladder, challenger: string, defender: string, play: LadderPlay, at: number): Ladder {
  if (!canChallenge(ladder, challenger, defender)) throw new Error(`"${challenger}" cannot challenge "${defender}"`)
  if (!Number.isFinite(at)) throw new RangeError('at must be a finite number')
  const r = decide(challenger, defender, play(challenger, defender))
  const order = [...ladder.order]
  if (r.winner === challenger) {
    order.splice(order.indexOf(challenger), 1)
    order.splice(order.indexOf(defender), 0, challenger)
  }
  return { order, history: [...ladder.history, { challenger, defender, winner: r.winner, score: r.score, at, quality: r.quality }] }
}

/** Versioned so a saved ladder from an older build is rejected rather than misread. */
export function serializeLadder(ladder: Ladder): string {
  const history = ladder.history.map(({ challenger, defender, winner, score, at, quality }) => ({ challenger, defender, winner, score, at, quality }))
  return JSON.stringify({ v: 1, order: ladder.order, history })
}

/** A ladder result is a model output, so a saved VERIFIED label means the data was tampered with. */
const RESULT_QUALITIES: readonly Quality[] = ['ESTIMATED', 'SIMULATED']

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Reads serializeLadder output. Returns null for anything malformed instead of a half-valid ladder. */
export function parseLadder(text: string): Ladder | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.order) || !Array.isArray(raw.history)) return null
  const order: string[] = []
  for (const id of raw.order as unknown[]) {
    if (typeof id !== 'string' || id === '' || order.includes(id)) return null
    order.push(id)
  }
  const history: LadderResult[] = []
  for (const h of raw.history as unknown[]) {
    if (!isRecord(h)) return null
    const { challenger, defender, winner, score, at, quality } = h
    if (typeof challenger !== 'string' || typeof defender !== 'string' || typeof winner !== 'string' || typeof score !== 'string') return null
    if (challenger === defender || !order.includes(challenger) || !order.includes(defender)) return null
    if (winner !== challenger && winner !== defender) return null
    if (typeof at !== 'number' || !Number.isFinite(at)) return null
    if (!RESULT_QUALITIES.includes(quality as Quality)) return null
    history.push({ challenger, defender, winner, score, at, quality: quality as Quality })
  }
  return { order, history }
}
