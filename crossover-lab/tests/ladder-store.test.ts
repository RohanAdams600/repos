import { describe, expect, it } from 'vitest'
import { allAthletes, BUILT_IN, getAthlete } from '../src/data/roster'
import type { Athlete, League } from '../src/data/types'
import {
  byCoverage,
  createEventLadder,
  createLadderStore,
  defaultEntrants,
  EVENTS,
  expectedMark,
  HISTORY_CAP,
  heatRng,
  isLeagueEvent,
  LADDER_HASH_PREFIX,
  ladderHash,
  ladderKey,
  LEAGUE_EVENTS,
  MAX_ENTRANTS,
  parseLadderHash,
  playHeat,
  playLadderChallenge,
  runEventBracket,
  seedEntrants,
  SHARE_HISTORY_CAP,
  trimHistory,
  type BracketEvent,
  type StorageLike,
} from '../src/data/ladder-store'
import { canChallenge, createLadder, serializeLadder, type Ladder } from '../src/sim/brackets'
import { createRng } from '../src/sim/rng'

const taylor = BUILT_IN.find((a) => a.id === 'jonathan-taylor')!

/** The same athlete with nothing on file, so every mark falls back to defaults. */
const blank = (a: Athlete, id: string): Athlete => ({ ...a, id, name: `Blank ${id}`, metrics: {}, seasons: [] })

/** A copy of an athlete with a given 40 time (as a verified figure). */
const withForty = (id: string, forty: number): Athlete => ({ ...taylor, id, name: id, metrics: { ...taylor.metrics, fortyS: { value: forty, quality: 'VERIFIED', sourceId: 'x' } } })

const league = (l: League) => allAthletes().filter((a) => a.league === l)

class MemoryStorage implements StorageLike {
  data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
}

/** Storage that refuses everything, like a private window with storage blocked. */
const broken: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('events', () => {
  it('offers every league its signature tests plus the overall grade', () => {
    expect(LEAGUE_EVENTS.NFL).toEqual(['forty', 'overall'])
    expect(LEAGUE_EVENTS.MLB).toEqual(['homeToFirst', 'overall'])
    expect(LEAGUE_EVENTS.NBA).toEqual(['maxVertical', 'laneAgility', 'overall'])
    expect(isLeagueEvent('NBA', 'laneAgility')).toBe(true)
    expect(isLeagueEvent('NFL', 'laneAgility')).toBe(false)
    expect(isLeagueEvent('MLB', 7)).toBe(false)
  })

  it('reads the 40 back from a measured 40 through the sprint model, labelled ESTIMATED at best', () => {
    const e = expectedMark(taylor, 'forty')
    expect(e.value).toBeCloseTo(4.39, 2)
    expect(e.quality).toBe('ESTIMATED')
    expect(e.thin).toBe(false)
    expect(expectedMark(taylor, 'forty')).toBe(e)
    expect(expectedMark({ ...taylor }, 'forty')).toEqual(e)
  })

  it('marks events with no data behind them as thin and SIMULATED', () => {
    const nobody = blank(taylor, 'nobody')
    for (const event of ['forty', 'maxVertical', 'laneAgility', 'overall'] as BracketEvent[]) {
      const e = expectedMark(nobody, event)
      expect(e.thin, event).toBe(true)
      expect(e.quality, event).toBe('SIMULATED')
    }
  })

  it('gives every athlete a finite mark in each league event, and never a VERIFIED modelled 40', () => {
    for (const a of allAthletes()) {
      for (const event of LEAGUE_EVENTS[a.league]) {
        const e = expectedMark(a, event)
        expect(Number.isFinite(e.value), `${a.id} ${event}`).toBe(true)
        expect(e.value).toBeGreaterThan(0)
        if (event === 'forty') expect(e.quality).not.toBe('VERIFIED')
      }
    }
  })
})

describe('playHeat', () => {
  const a = withForty('quick', 4.3)
  const b = withForty('slow', 4.6)
  const ea = expectedMark(a, 'forty')
  const eb = expectedMark(b, 'forty')

  it('replays the same heat from the same generator and labels it SIMULATED', () => {
    const x = playHeat('forty', a, ea, b, eb, createRng(7))
    const y = playHeat('forty', a, ea, b, eb, createRng(7))
    expect(x).toEqual(y)
    expect(x.quality).toBe('SIMULATED')
    expect(x.a.athleteId).toBe('quick')
    expect(x.b.athleteId).toBe('slow')
    expect(x.score).toMatch(/^\d\.\d{2,4} v \d\.\d{2,4} s$/)
    expect(x.a.display).toMatch(/ s$/)
  })

  it('gives the win to the better mark: lower times, higher jumps', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const heat = playHeat('forty', a, ea, b, eb, createRng(seed))
      expect(heat.winner).toBe(heat.a.mark < heat.b.mark ? 'quick' : 'slow')
    }
    const hi = { value: 40, quality: 'ESTIMATED' as const, basis: '', thin: false }
    const lo = { value: 30, quality: 'ESTIMATED' as const, basis: '', thin: false }
    for (let seed = 1; seed <= 20; seed++) {
      const heat = playHeat('maxVertical', a, lo, b, hi, createRng(seed))
      expect(heat.winner).toBe(heat.a.mark > heat.b.mark ? 'quick' : 'slow')
    }
  })

  it('lets the clearly faster athlete win nearly every heat, but not by decree', () => {
    let wins = 0
    for (let seed = 1; seed <= 200; seed++) if (playHeat('forty', a, ea, b, eb, createRng(seed)).winner === 'quick') wins++
    expect(wins).toBeGreaterThan(190)
    const even = withForty('even', 4.3)
    const ee = expectedMark(even, 'forty')
    let evenWins = 0
    for (let seed = 1; seed <= 200; seed++) if (playHeat('forty', a, ea, even, ee, createRng(seed)).winner === 'quick') evenWins++
    expect(evenWins).toBeGreaterThan(60)
    expect(evenWins).toBeLessThan(140)
  })

  it('settles an exact tie with a coin flip and shows more decimals', () => {
    const constant = () => 0.3
    const heat = playHeat('forty', a, ea, withForty('twin', 4.3), ea, constant)
    expect(heat.a.mark).toBe(heat.b.mark)
    expect(heat.winner).toBe('quick')
    expect(heat.score).toMatch(/^\d\.\d{4} v \d\.\d{4} s$/)
  })

  it('derives a separate generator per event and pairing', () => {
    const x = heatRng(1, 'forty', '0:0:a:b')()
    expect(heatRng(1, 'forty', '0:0:a:b')()).toBe(x)
    expect(heatRng(1, 'overall', '0:0:a:b')()).not.toBe(x)
    expect(heatRng(2, 'forty', '0:0:a:b')()).not.toBe(x)
  })
})

describe('fields and seeding', () => {
  it('defaults to the top N of the league, athletes with event data first, no repeats', () => {
    const ids = defaultEntrants(allAthletes(), 'NFL', 'forty', 8)
    expect(ids).toHaveLength(8)
    expect(new Set(ids).size).toBe(8)
    for (const id of ids) {
      const a = getAthlete(id)!
      expect(a.league).toBe('NFL')
      expect(expectedMark(a, 'forty').thin).toBe(false)
    }
    expect(ids[0]).toBe('jonathan-taylor')
  })

  it('caps the default field at 16 and at the athletes available', () => {
    expect(defaultEntrants(allAthletes(), 'NBA', 'overall', 99).length).toBe(Math.min(MAX_ENTRANTS, league('NBA').length))
    expect(defaultEntrants([taylor, taylor], 'NFL', 'forty', 8)).toEqual(['jonathan-taylor'])
    expect(defaultEntrants(allAthletes(), 'NFL', 'forty', 0)).toEqual([])
  })

  it('orders by coverage with thin marks last', () => {
    const order = byCoverage([blank(taylor, 'b1'), taylor, withForty('fast', 4.3)], 'forty')
    expect(order.map((a) => a.id).at(-1)).toBe('b1')
  })

  it('seeds the best expected mark first and defaults last', () => {
    const field = [withForty('mid', 4.45), blank(taylor, 'none'), withForty('fast', 4.3), withForty('slow', 4.6)]
    expect(seedEntrants(field, 'forty').map((a) => a.id)).toEqual(['fast', 'mid', 'slow', 'none'])
    const jumpers = league('NBA').filter((a) => !expectedMark(a, 'maxVertical').thin)
    const marks = seedEntrants(jumpers, 'maxVertical').map((a) => expectedMark(a, 'maxVertical').value)
    expect(marks).toEqual([...marks].sort((x, y) => y - x))
  })
})

describe('runEventBracket', () => {
  const field = league('NFL').slice(0, 11)

  it('replays the same bracket from the same seed', () => {
    const x = runEventBracket(field, 'forty', 42)
    const y = runEventBracket([...field].reverse(), 'forty', 42)
    expect(y.bracket).toEqual(x.bracket)
    expect([...y.heats]).toEqual([...x.heats])
  })

  it('labels every played match SIMULATED and records both marks with the winner ahead', () => {
    for (const event of LEAGUE_EVENTS.NFL) {
      const { bracket, heats, seeds } = runEventBracket(field, event, 9)
      expect(bracket.quality).toBe('SIMULATED')
      expect(seeds.size).toBe(11)
      expect(field.map((a) => a.id)).toContain(bracket.champion)
      bracket.rounds.forEach((round, r) =>
        round.matches.forEach((m, i) => {
          const heat = heats.get(`${r}:${i}`)
          if (m.bye) {
            expect(heat).toBeUndefined()
            expect(m.quality).toBeNull()
            return
          }
          expect(m.quality).toBe('SIMULATED')
          expect(heat!.a.athleteId).toBe(m.a)
          expect(heat!.b.athleteId).toBe(m.b)
          const [win, lose] = m.winner === m.a ? [heat!.a, heat!.b] : [heat!.b, heat!.a]
          if (EVENTS[event].lowerWins) expect(win.mark).toBeLessThanOrEqual(lose.mark)
          else expect(win.mark).toBeGreaterThanOrEqual(lose.mark)
        }),
      )
    }
  })

  it('gives the byes to the top seeds', () => {
    const { bracket, seeds } = runEventBracket(field, 'forty', 3)
    const byes = bracket.rounds[0]!.matches.filter((m) => m.bye).map((m) => seeds.get(m.a ?? m.b ?? '')!)
    expect(byes.sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('crowns a lone entrant without playing and plays two as a final', () => {
    expect(runEventBracket([taylor], 'forty', 1).bracket).toMatchObject({ rounds: [], champion: 'jonathan-taylor', quality: null })
    const two = runEventBracket([withForty('a', 4.4), withForty('b', 4.5)], 'forty', 1)
    expect(two.bracket.rounds.map((r) => r.name)).toEqual(['Final'])
  })

  it('runs a full 16 for each NBA event', () => {
    const nba = league('NBA').slice(0, 16)
    for (const event of LEAGUE_EVENTS.NBA) {
      const { bracket } = runEventBracket(nba, event, 5)
      expect(bracket.rounds.map((r) => r.name)).toEqual(['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'])
    }
  })
})

describe('ladders', () => {
  const field = [withForty('l1', 4.3), withForty('l2', 4.35), withForty('l3', 4.4), withForty('l4', 4.45)]
  const byId = new Map(field.map((a) => [a.id, a]))

  it('starts a ladder with the best expected mark on top', () => {
    expect(createEventLadder([...field].reverse(), 'forty').order).toEqual(['l1', 'l2', 'l3', 'l4'])
  })

  it('plays a challenge into the history, labelled SIMULATED, and moves a winning challenger up', () => {
    let ladder: Ladder = createEventLadder(field, 'forty')
    for (let at = 1; at <= 30; at++) {
      const challenger = ladder.order[3]!
      const defender = ladder.order[1]!
      expect(canChallenge(ladder, challenger, defender)).toBe(true)
      const before = ladder.order
      const { ladder: next, heat } = playLadderChallenge(ladder, 'forty', byId.get(challenger)!, byId.get(defender)!, at)
      const last = next.history.at(-1)!
      expect(last).toMatchObject({ challenger, defender, winner: heat.winner, score: heat.score, at, quality: 'SIMULATED' })
      if (heat.winner === challenger) expect(next.order.indexOf(challenger)).toBe(before.indexOf(defender))
      else expect(next.order).toEqual(before)
      ladder = next
    }
    expect(ladder.history).toHaveLength(30)
  })

  it('refuses a challenge beyond reach', () => {
    const ladder = createEventLadder(field, 'forty')
    expect(() => playLadderChallenge(ladder, 'forty', byId.get('l4')!, byId.get('l1')!, 1)).toThrow()
    expect(() => playLadderChallenge(ladder, 'forty', byId.get('l1')!, byId.get('l2')!, 1)).toThrow()
  })

  it('keeps at most HISTORY_CAP results', () => {
    let ladder: Ladder = createLadder(['l1', 'l2'])
    for (let at = 1; at <= HISTORY_CAP + 5; at++) {
      const top = ladder.order[0]!
      const bottom = ladder.order[1]!
      ladder = playLadderChallenge(ladder, 'forty', byId.get(bottom)!, byId.get(top)!, at).ladder
    }
    expect(ladder.history).toHaveLength(HISTORY_CAP)
    expect(ladder.history.at(-1)!.at).toBe(HISTORY_CAP + 5)
    expect(trimHistory(ladder, 3).history.map((r) => r.at)).toEqual([HISTORY_CAP + 3, HISTORY_CAP + 4, HISTORY_CAP + 5])
  })
})

describe('ladder store', () => {
  const sample = (): Ladder => {
    const field = [withForty('s1', 4.3), withForty('s2', 4.4), withForty('s3', 4.5)]
    return playLadderChallenge(createEventLadder(field, 'forty'), 'forty', field[2]!, field[1]!, 1000).ladder
  }

  it('saves, loads and resets a ladder per league and event', () => {
    const storage = new MemoryStorage()
    const store = createLadderStore(() => storage)
    const ladder = sample()
    expect(store.load('NFL', 'forty')).toBeNull()
    store.save('NFL', 'forty', ladder)
    expect(storage.data.get(ladderKey('NFL', 'forty'))).toBe(serializeLadder(ladder))
    expect(store.load('NFL', 'forty')).toEqual(ladder)
    expect(store.load('NFL', 'overall')).toBeNull()
    expect(createLadderStore(() => storage).load('NFL', 'forty')).toEqual(ladder)
    store.reset('NFL', 'forty')
    expect(store.load('NFL', 'forty')).toBeNull()
    expect(storage.data.has(ladderKey('NFL', 'forty'))).toBe(false)
  })

  it('falls back to memory when storage throws or is missing', () => {
    for (const source of [() => broken, () => null, () => undefined, (): StorageLike => { throw new Error('SecurityError') }]) {
      const store = createLadderStore(source)
      const ladder = sample()
      expect(store.load('MLB', 'homeToFirst')).toBeNull()
      store.save('MLB', 'homeToFirst', ladder)
      expect(store.load('MLB', 'homeToFirst')).toEqual(ladder)
      store.reset('MLB', 'homeToFirst')
      expect(store.load('MLB', 'homeToFirst')).toBeNull()
    }
  })

  it('does not bring back a stored copy after a reset whose delete failed', () => {
    const storage = new MemoryStorage()
    storage.setItem(ladderKey('NBA', 'maxVertical'), serializeLadder(sample()))
    const store = createLadderStore(() => ({ ...broken, getItem: (k: string) => storage.getItem(k) }))
    expect(store.load('NBA', 'maxVertical')).not.toBeNull()
    store.reset('NBA', 'maxVertical')
    expect(store.load('NBA', 'maxVertical')).toBeNull()
  })

  it('reads malformed or tampered storage as no ladder', () => {
    const storage = new MemoryStorage()
    const store = createLadderStore(() => storage)
    storage.setItem(ladderKey('NFL', 'forty'), '{not json')
    expect(store.load('NFL', 'forty')).toBeNull()
    const doc = JSON.parse(serializeLadder(sample())) as { history: { quality: string }[] }
    doc.history[0]!.quality = 'VERIFIED'
    storage.setItem(ladderKey('NFL', 'forty'), JSON.stringify(doc))
    expect(store.load('NFL', 'forty')).toBeNull()
  })
})

describe('share links', () => {
  const ladder = (): Ladder => {
    const field = [withForty('h1', 4.3), withForty('h2', 4.4), withForty('h3', 4.5)]
    let l = createEventLadder(field, 'forty')
    for (let at = 1; at <= SHARE_HISTORY_CAP + 10; at++) l = playLadderChallenge(l, 'forty', field.find((a) => a.id === l.order[2])!, field.find((a) => a.id === l.order[1])!, at).ladder
    return l
  }

  it('round-trips league, event and ladder through #ladder.<base64url>', () => {
    const l = ladder()
    const hash = ladderHash('NFL', 'forty', l)
    expect(hash.startsWith(LADDER_HASH_PREFIX)).toBe(true)
    expect(hash.slice(LADDER_HASH_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/)
    const parsed = parseLadderHash(hash)!
    expect(parsed.league).toBe('NFL')
    expect(parsed.event).toBe('forty')
    expect(parsed.ladder.order).toEqual(l.order)
    expect(parsed.ladder.history).toEqual(l.history.slice(-SHARE_HISTORY_CAP))
    expect(parseLadderHash(hash.slice(1))).toEqual(parsed)
  })

  it('keeps text that is not ASCII intact', () => {
    const l: Ladder = { order: ['é1', 'ü2'], history: [{ challenger: 'ü2', defender: 'é1', winner: 'ü2', score: '4.40 – 4.41 s', at: 5, quality: 'SIMULATED' }] }
    expect(parseLadderHash(ladderHash('NBA', 'laneAgility', l))).toEqual({ league: 'NBA', event: 'laneAgility', ladder: l })
  })

  it('rejects anything malformed', () => {
    const good = ladderHash('MLB', 'homeToFirst', ladder())
    const encode = (doc: unknown) => `${LADDER_HASH_PREFIX}${btoa(JSON.stringify(doc)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
    const base = { v: 1, order: ['a', 'b'], history: [] }
    for (const bad of [
      '',
      '#ladder.',
      '#roster',
      good.replace('#ladder.', '#ladders.'),
      `${good}!`,
      '#ladder.a',
      `${LADDER_HASH_PREFIX}${btoa('not json')}`,
      encode({ ...base, league: 'NHL', event: 'forty' }),
      encode({ ...base, league: 'MLB', event: 'forty' }),
      encode({ ...base, league: 'NFL' }),
      encode({ ...base, v: 2, league: 'NFL', event: 'forty' }),
      encode({ ...base, order: ['a', 'a'], league: 'NFL', event: 'forty' }),
      encode([1, 2]),
    ]) {
      expect(parseLadderHash(bad), bad).toBeNull()
    }
    expect(parseLadderHash(encode({ ...base, league: 'NFL', event: 'overall' }))).toEqual({ league: 'NFL', event: 'overall', ladder: { order: ['a', 'b'], history: [] } })
  })
})
