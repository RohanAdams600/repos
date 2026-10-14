import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { allAthletes } from '../src/data/roster'
import type { League } from '../src/data/types'
import {
  allowsCrossLeague,
  createEventStage,
  defaultPicks,
  EVENTS,
  eventPool,
  eventsHash,
  LEAGUE_EVENTS,
  LEAGUES,
  pairNames,
  parseEventsHash,
  parseSeed,
  resolvePicks,
  runEvent,
  type EventId,
} from '../src/stage/event-stages'

const roster = allAthletes()

function pairFor(id: EventId, league: League) {
  const pool = eventPool(id, league, false, roster)
  return defaultPicks(id, pool)
}

describe('event registry', () => {
  it('lists events per league and opens only races, jumps, lifts and arm events across leagues', () => {
    for (const l of LEAGUES) expect(LEAGUE_EVENTS[l].length).toBeGreaterThanOrEqual(4)
    expect(allowsCrossLeague('forty')).toBe(true)
    expect(allowsCrossLeague('lift-off')).toBe(true)
    expect(allowsCrossLeague('tackle-break')).toBe(false)
    expect(allowsCrossLeague('at-bat')).toBe(false)
    expect(allowsCrossLeague('dunk-contest')).toBe(false)
  })

  it('keeps the pool to one league unless cross-league applies', () => {
    expect(eventPool('tackle-break', 'NFL', true, roster).every((a) => a.league === 'NFL')).toBe(true)
    const open = eventPool('forty', 'NFL', true, roster)
    expect(new Set(open.map((a) => a.league)).size).toBeGreaterThan(1)
  })
})

describe('links and seeds', () => {
  it('round-trips an events link', () => {
    const route = { league: 'NBA' as League, eventId: 'dunk-contest' as EventId, ids: ['a-1', 'b-2'], seed: 42 }
    expect(parseEventsHash(eventsHash(route))).toEqual(route)
    expect(parseEventsHash('#events')).toEqual({ league: 'NFL' })
    expect(parseEventsHash('#events.MLB')).toEqual({ league: 'MLB' })
    expect(parseEventsHash('#eventsx')).toBeUndefined()
  })

  it('drops an event that does not belong to the league', () => {
    expect(parseEventsHash('#events.NFL.dunk-contest')?.eventId).toBeUndefined()
    expect(parseEventsHash('#events.NBA.forty')?.eventId).toBe('forty')
  })

  it('parses seeds in range only', () => {
    expect(parseSeed('123')).toBe(123)
    expect(parseSeed('-1')).toBeUndefined()
    expect(parseSeed('abc')).toBeUndefined()
    expect(parseSeed('4294967296')).toBeUndefined()
  })
})

describe('picks', () => {
  it('replaces a requested id that does not qualify and says so', () => {
    const pool = eventPool('forty', 'NFL', false, roster)
    const r = resolvePicks('forty', pool, ['no-such-athlete'])
    expect(r?.changed).toBe(true)
    expect(r?.picks[0].id).not.toBe(r?.picks[1].id)
  })

  it('uses short names unless they collide', () => {
    const [a, b] = roster
    const names = pairNames(a!, b!)
    expect(names[0].length).toBeGreaterThan(0)
    expect(pairNames(a!, { ...a!, id: 'twin', name: `${a!.name} Jr.` })).toEqual([a!.name, `${a!.name} Jr.`])
  })
})

describe('every league event', () => {
  for (const league of LEAGUES) {
    for (const id of LEAGUE_EVENTS[league]) {
      it(`${league} ${id}: runs, is deterministic, labels the outcome SIMULATED and builds a stage`, () => {
        const pair = pairFor(id, league)
        if (!pair) return // not enough athletes on file for this league
        const a = runEvent(id, pair, 7)
        const b = runEvent(id, pair, 7)
        expect(JSON.stringify(a.card)).toBe(JSON.stringify(b.card))
        expect(a.card.quality).toBe('SIMULATED')
        expect(a.card.headline.length).toBeGreaterThan(0)
        expect(a.card.lines.length).toBeGreaterThan(0)
        expect(a.card.why).toHaveLength(2)
        for (const w of a.card.why) for (const input of w.inputs) if (input.quality) expect(['VERIFIED', 'ESTIMATED', 'SIMULATED']).toContain(input.quality)
        // No outcome may present itself as VERIFIED.
        for (const line of a.card.lines) for (const c of line.cells) if (c.quality && /win|probab|outcome/i.test(line.label)) expect(c.quality).not.toBe('VERIFIED')

        const scene = new THREE.Scene()
        for (const layout of EVENTS[id].layouts) {
          const built = createEventStage(scene, a, layout, [0xff0000, 0x0000ff])
          expect(built.stage.duration).toBeGreaterThan(0)
          for (const t of [0, built.stage.duration * 0.3, built.stage.duration * 0.7, built.stage.duration]) {
            built.stage.seek(t)
            const box = built.stage.bounds(new THREE.Box3())
            expect(Number.isFinite(box.min.x) && Number.isFinite(box.max.y)).toBe(true)
            const cells = built.live?.(t) ?? []
            for (const c of cells) expect(c.quality).not.toBe('VERIFIED')
          }
          built.stage.dispose()
        }
      })
    }
  }

  it('changes a random event with the seed and leaves a fixed one alone', () => {
    const pair = pairFor('forty', 'NFL')
    if (!pair) return
    expect(JSON.stringify(runEvent('forty', pair, 1).card.score)).toBe(JSON.stringify(runEvent('forty', pair, 2).card.score))
    const shoot = pairFor('shootout', 'NBA')
    if (!shoot) return
    const seen = new Set<string>()
    for (let s = 1; s <= 8; s++) seen.add(runEvent('shootout', shoot, s).card.score.join('-'))
    expect(seen.size).toBeGreaterThan(1)
  })

  it('adds the cross-league note only across leagues and only where allowed', () => {
    const nfl = roster.find((a) => a.league === 'NFL')!
    const mlb = roster.find((a) => a.league === 'MLB')!
    const run = runEvent('forty', [nfl, mlb], 3, {}, true)
    expect(run.cross).toBe(true)
    expect(run.card.notes.join(' ')).toMatch(/estimat/i)
    const same = runEvent('forty', [nfl, roster.find((a) => a.league === 'NFL' && a.id !== nfl.id)!], 3, {}, true)
    expect(same.cross).toBe(false)
  })
})
