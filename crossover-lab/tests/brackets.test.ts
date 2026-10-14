import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Quality } from '../src/data/types'
import {
  canChallenge,
  challenge,
  createLadder,
  LADDER_REACH,
  parseLadder,
  roundName,
  seedOrder,
  serializeLadder,
  singleElimination,
} from '../src/sim/brackets'
import type { Bracket, Ladder, LadderPlay, PlayFn } from '../src/sim/brackets'
import { createRng, hashString } from '../src/sim/rng'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`)
const seedOf = (id: string) => Number(id.slice(1))

/** The better (lower) seed always wins, so outcomes are easy to predict. */
const chalk: PlayFn = (a, b) => (seedOf(a) < seedOf(b) ? { winner: a, score: '1-0' } : { winner: b, score: '0-1' })

/** A seeded coin per match, the way a UI would wire a sim into the bracket. */
const seeded = (seed: number): PlayFn => (a, b, round, match) => {
  const rng = createRng(seed ^ hashString(`${round}:${match}:${a}:${b}`))
  const winner = rng() < 0.5 ? a : b
  return { winner, score: `${Math.floor(rng() * 10)}-${Math.floor(rng() * 10)}` }
}

const allMatches = (b: Bracket) => b.rounds.flatMap((r) => r.matches)

describe('seedOrder and roundName', () => {
  it('keeps seeds 1 and 2 apart until the final', () => {
    expect(seedOrder(1)).toEqual([1])
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('pairs every slot to sum to size + 1', () => {
    const order = seedOrder(32)
    expect([...order].sort((x, y) => x - y)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1))
    for (let i = 0; i < 32; i += 2) expect(order[i]! + order[i + 1]!).toBe(33)
  })

  it('rejects sizes that are not powers of two', () => {
    for (const bad of [0, 3, 6, -4, 2.5, Number.NaN]) expect(() => seedOrder(bad)).toThrow(RangeError)
  })

  it('names rounds by match count', () => {
    expect([1, 2, 4, 8, 16].map(roundName)).toEqual(['Final', 'Semifinals', 'Quarterfinals', 'Round of 16', 'Round of 32'])
  })
})

describe('singleElimination', () => {
  it('plays 2 entrants as a single final', () => {
    const b = singleElimination(['e1', 'e2'], chalk)
    expect(b.rounds).toHaveLength(1)
    expect(b.rounds[0]!.name).toBe('Final')
    expect(b.rounds[0]!.matches).toEqual([{ a: 'e1', b: 'e2', winner: 'e1', score: '1-0', bye: false, quality: 'SIMULATED' }])
    expect(b.champion).toBe('e1')
    expect(b.quality).toBe('SIMULATED')
  })

  it('gives the top seed the bye with 3 entrants', () => {
    const b = singleElimination(ids(3), chalk)
    expect(b.rounds.map((r) => r.name)).toEqual(['Semifinals', 'Final'])
    const [bye, played] = b.rounds[0]!.matches
    expect(bye).toEqual({ a: 'e1', b: null, winner: 'e1', score: '', bye: true, quality: null })
    expect(played).toMatchObject({ a: 'e2', b: 'e3', winner: 'e2', bye: false })
    expect(b.rounds[1]!.matches[0]).toMatchObject({ a: 'e1', b: 'e2', winner: 'e1' })
    expect(b.champion).toBe('e1')
  })

  it('gives byes to seeds 1-3 with 5 entrants and only plays 4 v 5 in the first round', () => {
    const calls: string[] = []
    const b = singleElimination(ids(5), (a, x, round, match) => {
      calls.push(`${round}.${match}:${a}v${x}`)
      return chalk(a, x, round, match)
    })
    expect(b.rounds.map((r) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final'])
    const first = b.rounds[0]!.matches
    expect(first.map((m) => [m.a, m.b, m.bye])).toEqual([
      ['e1', null, true],
      ['e4', 'e5', false],
      ['e2', null, true],
      ['e3', null, true],
    ])
    expect(calls).toEqual(['0.1:e4ve5', '1.0:e1ve4', '1.1:e2ve3', '2.0:e1ve2'])
    expect(b.champion).toBe('e1')
  })

  it('seeds 8 entrants 1 v 8, 4 v 5, 2 v 7, 3 v 6 with no byes', () => {
    const b = singleElimination(ids(8), chalk)
    expect(b.rounds.map((r) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final'])
    expect(b.rounds[0]!.matches.map((m) => `${m.a}v${m.b}`)).toEqual(['e1ve8', 'e4ve5', 'e2ve7', 'e3ve6'])
    expect(allMatches(b).some((m) => m.bye)).toBe(false)
    expect(b.rounds[1]!.matches.map((m) => `${m.a}v${m.b}`)).toEqual(['e1ve4', 'e2ve3'])
    expect(b.rounds[2]!.matches[0]).toMatchObject({ a: 'e1', b: 'e2', winner: 'e1' })
  })

  it('names a 16-field opening round and pads 20 entrants to a Round of 32', () => {
    expect(singleElimination(ids(16), chalk).rounds[0]!.name).toBe('Round of 16')
    const b = singleElimination(ids(20), chalk)
    expect(b.rounds[0]!.name).toBe('Round of 32')
    expect(b.rounds[0]!.matches.filter((m) => m.bye).map((m) => m.a)).toEqual(['e1', 'e8', 'e9', 'e4', 'e5', 'e12', 'e2', 'e7', 'e10', 'e3', 'e6', 'e11'])
  })

  it('holds the bracket invariants for every field size from 2 to 40', () => {
    for (let n = 2; n <= 40; n++) {
      let calls = 0
      const play: PlayFn = (a, b, round, match) => {
        calls++
        return seeded(n)(a, b, round, match)
      }
      const b = singleElimination(ids(n), play)
      const size = 2 ** Math.ceil(Math.log2(n))
      const first = b.rounds[0]!.matches
      expect(first).toHaveLength(size / 2)
      expect(first.flatMap((m) => [m.a, m.b]).filter((x) => x !== null).sort()).toEqual(ids(n).sort())
      const byes = first.filter((m) => m.bye)
      expect(byes).toHaveLength(size - n)
      expect(byes.map((m) => seedOf(m.a!)).every((s) => s <= size - n)).toBe(true)
      expect(calls).toBe(n - 1)
      for (let r = 1; r < b.rounds.length; r++) {
        const prev = b.rounds[r - 1]!.matches
        b.rounds[r]!.matches.forEach((m, i) => {
          expect(m.a).toBe(prev[2 * i]!.winner)
          expect(m.b).toBe(prev[2 * i + 1]!.winner)
        })
      }
      for (const m of allMatches(b)) if (!m.bye) expect([m.a, m.b]).toContain(m.winner)
      const final = b.rounds.at(-1)!
      expect(final.name).toBe('Final')
      expect(final.matches).toHaveLength(1)
      expect(b.champion).toBe(final.matches[0]!.winner)
      expect([final.matches[0]!.a, final.matches[0]!.b]).toContain(b.champion)
    }
  })

  it('handles empty and one-entrant fields without playing', () => {
    const never: PlayFn = () => {
      throw new Error('should not play')
    }
    expect(singleElimination([], never)).toEqual({ rounds: [], champion: null, quality: null })
    expect(singleElimination(['solo'], never)).toEqual({ rounds: [], champion: 'solo', quality: null })
  })

  it('rejects duplicate or blank entrants and impossible winners', () => {
    expect(() => singleElimination(['a', 'b', 'a'], chalk)).toThrow(/duplicate/)
    expect(() => singleElimination(['a', ''], chalk)).toThrow(TypeError)
    expect(() => singleElimination(['e1', 'e2'], () => ({ winner: 'e9', score: '' }))).toThrow(/winner/)
  })

  it('never labels a result VERIFIED and reports the weakest label', () => {
    const labelled = (q: Quality): PlayFn => (a, b, round, match) => ({ ...chalk(a, b, round, match), quality: q })
    const verified = singleElimination(ids(4), labelled('VERIFIED'))
    expect(allMatches(verified).map((m) => m.quality)).toEqual(['ESTIMATED', 'ESTIMATED', 'ESTIMATED'])
    expect(verified.quality).toBe('ESTIMATED')
    const mixed = singleElimination(ids(4), (a, b, round, match) => ({ ...chalk(a, b, round, match), quality: round === 0 ? 'ESTIMATED' : 'SIMULATED' }))
    expect(mixed.quality).toBe('SIMULATED')
  })

  it('does not touch the entrants array', () => {
    const field = ids(6)
    const copy = [...field]
    singleElimination(field, chalk)
    expect(field).toEqual(copy)
  })

  it('is deterministic for a seeded play function', () => {
    const field = BUILT_IN.map((a) => a.id).concat(['x1', 'x2', 'x3'])
    expect(singleElimination(field, seeded(42))).toEqual(singleElimination(field, seeded(42)))
    const champions = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => singleElimination(ids(8), seeded(s)).champion))
    expect(champions.size).toBeGreaterThan(1)
  })
})

/** Challenger always wins / defender always holds. */
const upset: LadderPlay = (c) => ({ winner: c, score: 'W' })
const hold: LadderPlay = (_, d) => ({ winner: d, score: 'L' })

describe('challenge ladder', () => {
  const base = () => createLadder(['a', 'b', 'c', 'd', 'e'])

  it('starts in the given order with no history', () => {
    const src = ['a', 'b', 'c']
    const l = createLadder(src)
    expect(l).toEqual({ order: ['a', 'b', 'c'], history: [] })
    expect(l.order).not.toBe(src)
    expect(() => createLadder(['a', 'a'])).toThrow(/duplicate/)
    expect(() => createLadder([''])).toThrow(TypeError)
    expect(createLadder([])).toEqual({ order: [], history: [] })
  })

  it('allows challenges one or two places up only', () => {
    const l = base()
    expect(LADDER_REACH).toBe(2)
    expect(canChallenge(l, 'd', 'c')).toBe(true)
    expect(canChallenge(l, 'd', 'b')).toBe(true)
    expect(canChallenge(l, 'd', 'a')).toBe(false)
    expect(canChallenge(l, 'b', 'd')).toBe(false)
    expect(canChallenge(l, 'c', 'c')).toBe(false)
    expect(canChallenge(l, 'z', 'a')).toBe(false)
    expect(canChallenge(l, 'b', 'z')).toBe(false)
  })

  it('moves a winning challenger into the defender spot and shifts the rest down one', () => {
    const two = challenge(base(), 'd', 'b', upset, 100)
    expect(two.order).toEqual(['a', 'd', 'b', 'c', 'e'])
    expect(two.history).toEqual([{ challenger: 'd', defender: 'b', winner: 'd', score: 'W', at: 100, quality: 'SIMULATED' }])
    expect(challenge(base(), 'b', 'a', upset, 1).order).toEqual(['b', 'a', 'c', 'd', 'e'])
  })

  it('keeps the order when the defender holds but still records the result', () => {
    const l = challenge(base(), 'e', 'c', hold, 7)
    expect(l.order).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(l.history).toEqual([{ challenger: 'e', defender: 'c', winner: 'c', score: 'L', at: 7, quality: 'SIMULATED' }])
  })

  it('never edits the ladder it was given', () => {
    const l = base()
    const before = structuredClone(l)
    const next = challenge(l, 'c', 'a', upset, 1)
    const after = challenge(next, 'e', 'd', hold, 2)
    expect(l).toEqual(before)
    expect(next.order).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(next.history).toHaveLength(1)
    expect(after.history).toHaveLength(2)
    expect(next.order).not.toBe(l.order)
    expect(next.history).not.toBe(l.history)
  })

  it('throws on illegal challenges, impossible winners and a bad clock', () => {
    expect(() => challenge(base(), 'e', 'a', upset, 1)).toThrow(/cannot challenge/)
    expect(() => challenge(base(), 'a', 'b', upset, 1)).toThrow(/cannot challenge/)
    expect(() => challenge(base(), 'b', 'a', () => ({ winner: 'c', score: '' }), 1)).toThrow(/winner/)
    expect(() => challenge(base(), 'b', 'a', upset, Number.NaN)).toThrow(RangeError)
  })

  it('floors a VERIFIED label to ESTIMATED', () => {
    const l = challenge(base(), 'b', 'a', () => ({ winner: 'a', score: '2-1', quality: 'VERIFIED' }), 1)
    expect(l.history[0]!.quality).toBe('ESTIMATED')
  })

  it('replays a seeded season identically', () => {
    const season = (seed: number): Ladder => {
      const rng = createRng(seed)
      let l = createLadder(BUILT_IN.map((a) => a.id).concat(['p4', 'p5', 'p6']))
      for (let t = 0; t < 40; t++) {
        const c = 1 + Math.floor(rng() * (l.order.length - 1))
        const d = Math.max(0, c - 1 - Math.floor(rng() * LADDER_REACH))
        const challenger = l.order[c]!
        const defender = l.order[d]!
        l = challenge(l, challenger, defender, (x, y) => ({ winner: rng() < 0.5 ? x : y, score: `${t}` }), t)
      }
      return l
    }
    expect(season(9)).toEqual(season(9))
    expect(season(9).history).toHaveLength(40)
  })
})

describe('serializeLadder and parseLadder', () => {
  const played = () => challenge(challenge(createLadder(['a', 'b', 'c', 'd']), 'c', 'a', upset, 1), 'd', 'b', hold, 2)
  const valid = () => JSON.parse(serializeLadder(played())) as { v: number; order: unknown[]; history: Record<string, unknown>[] }
  const mutate = (fn: (raw: ReturnType<typeof valid>) => void) => {
    const raw = valid()
    fn(raw)
    return parseLadder(JSON.stringify(raw))
  }

  it('round-trips a played ladder', () => {
    const l = played()
    expect(parseLadder(serializeLadder(l))).toEqual(l)
    expect(parseLadder(serializeLadder(createLadder([])))).toEqual({ order: [], history: [] })
  })

  it('drops fields it does not know', () => {
    const raw = valid()
    raw.history[0]!.extra = 'x'
    const parsed = parseLadder(JSON.stringify({ ...raw, extra: true }))
    expect(parsed).toEqual(played())
  })

  it('rejects text that is not a saved ladder', () => {
    for (const text of ['', 'not json', 'null', '[]', '42', '"ladder"', '{}', '{"v":2,"order":[],"history":[]}', '{"v":1,"order":[]}', '{"v":1,"history":[]}']) {
      expect(parseLadder(text)).toBeNull()
    }
  })

  it('rejects bad orders', () => {
    expect(mutate((r) => (r.order = ['a', 'b', 'a', 'd']))).toBeNull()
    expect(mutate((r) => (r.order = ['a', 'b', '', 'd']))).toBeNull()
    expect(mutate((r) => (r.order = ['a', 'b', 3, 'd']))).toBeNull()
    expect(mutate((r) => ((r as Record<string, unknown>).order = 'abcd'))).toBeNull()
  })

  it('rejects bad history entries', () => {
    expect(mutate((r) => (r.history = [null as unknown as Record<string, unknown>]))).toBeNull()
    expect(mutate((r) => (r.history[0]!.challenger = 'z'))).toBeNull()
    expect(mutate((r) => (r.history[0]!.defender = r.history[0]!.challenger))).toBeNull()
    expect(mutate((r) => (r.history[0]!.winner = 'b'))).toBeNull()
    expect(mutate((r) => (r.history[0]!.score = 3))).toBeNull()
    expect(mutate((r) => (r.history[0]!.at = '1'))).toBeNull()
    expect(mutate((r) => (r.history[0]!.at = null))).toBeNull()
    expect(mutate((r) => (r.history[0]!.quality = 'VERIFIED'))).toBeNull()
    expect(mutate((r) => (r.history[0]!.quality = 'GREAT'))).toBeNull()
    expect(mutate((r) => delete r.history[0]!.quality)).toBeNull()
  })
})
