import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { YD_TO_M } from '../data/metrics'
import { agilityValue, jumpValue, liftValue } from './events'
import { normalizeStrength } from './normalize'
import { createRng, hashString } from './rng'
import { freeThrowContest, threePointContest } from './shooting'
import { runSprint, sprintProfile } from './sprint'
import { throwContest } from './throwing'

/**
 * Multi-event "decathlon". Each event turns a performance into points with the decathlon form
 * points = a·(b − T)^c for times and a·(M − b)^c for marks. The 100 m uses the official
 * decathlon table and the 200 m the official heptathlon table; the rest are calibrated so an
 * elite pro athlete scores about 900.
 */
export type EventId = 'dash40' | 'dash100' | 'dash200' | 'vertical' | 'broad' | 'bench' | 'squat' | 'throwBaseball' | 'throwFootball' | 'shuttle' | 'freeThrows' | 'threePoint'

export interface TournamentEvent {
  id: EventId
  label: string
  unit: string
  kind: 'time' | 'mark'
  a: number
  b: number
  c: number
  perform: (a: Athlete, seed: number) => { value: number; quality: Quality; display: string }
}

const time = (v: number, unit = 's') => `${v.toFixed(2)} ${unit}`

export const EVENTS: Record<EventId, TournamentEvent> = {
  dash40: {
    id: 'dash40',
    label: '40-yard dash',
    unit: 's',
    kind: 'time',
    a: 177.4,
    b: 7,
    c: 1.81,
    perform: (a) => {
      const p = sprintProfile(a)
      const t = runSprint(p, 40 * YD_TO_M).time
      return { value: t, quality: p.quality, display: time(t) }
    },
  },
  dash100: {
    id: 'dash100',
    label: '100 m',
    unit: 's',
    kind: 'time',
    a: 25.4347,
    b: 18,
    c: 1.81,
    perform: (a) => {
      const p = sprintProfile(a)
      const t = runSprint(p, 100).time
      return { value: t, quality: weakest(p.quality, 'ESTIMATED'), display: time(t) }
    },
  },
  dash200: {
    id: 'dash200',
    label: '200 m (straight)',
    unit: 's',
    kind: 'time',
    a: 4.99087,
    b: 42.5,
    c: 1.81,
    perform: (a) => {
      const p = sprintProfile(a)
      const t = runSprint(p, 200).time
      return { value: t, quality: 'SIMULATED', display: time(t) }
    },
  },
  vertical: {
    id: 'vertical',
    label: 'Max vertical',
    unit: 'cm',
    kind: 'mark',
    a: 2.35,
    b: 20,
    c: 1.4,
    perform: (a) => {
      const r = jumpValue(a, 'maxVertical')
      return { value: r.value * 2.54, quality: r.quality, display: `${r.value.toFixed(1)} in` }
    },
  },
  broad: {
    id: 'broad',
    label: 'Broad jump',
    unit: 'cm',
    kind: 'mark',
    a: 0.7725,
    b: 150,
    c: 1.4,
    perform: (a) => {
      const r = jumpValue(a, 'broadJump')
      return { value: r.value * 2.54, quality: r.quality, display: `${r.value.toFixed(0)} in` }
    },
  },
  bench: {
    id: 'bench',
    label: 'Bench press (size-adjusted)',
    unit: 'lb',
    kind: 'mark',
    a: 0.6865,
    b: 100,
    c: 1.3,
    perform: (a) => {
      const r = liftValue(a, 'bench')
      const n = normalizeStrength(a, r.value, r.quality)
      const v = n?.value ?? r.value
      return { value: v, quality: n?.quality ?? r.quality, display: `${r.value.toFixed(0)} lb (${v.toFixed(0)} at 200 lb)` }
    },
  },
  squat: {
    id: 'squat',
    label: 'Back squat (size-adjusted)',
    unit: 'lb',
    kind: 'mark',
    a: 0.444,
    b: 150,
    c: 1.3,
    perform: (a) => {
      const r = liftValue(a, 'squat')
      const n = normalizeStrength(a, r.value, r.quality)
      const v = n?.value ?? r.value
      return { value: v, quality: n?.quality ?? r.quality, display: `${r.value.toFixed(0)} lb (${v.toFixed(0)} at 200 lb)` }
    },
  },
  throwBaseball: {
    id: 'throwBaseball',
    label: 'Baseball throw velocity',
    unit: 'mph',
    kind: 'mark',
    a: 2.545,
    b: 40,
    c: 1.5,
    perform: (a) => {
      const r = throwContest(a, 'baseball')
      return { value: r.velocityMph, quality: r.quality, display: `${r.velocityMph.toFixed(1)} mph` }
    },
  },
  throwFootball: {
    id: 'throwFootball',
    label: 'Football throw distance',
    unit: 'yd',
    kind: 'mark',
    a: 5.14,
    b: 20,
    c: 1.4,
    perform: (a) => {
      const r = throwContest(a, 'football')
      return { value: r.distanceYd, quality: r.quality, display: `${r.distanceYd.toFixed(0)} yd` }
    },
  },
  shuttle: {
    id: 'shuttle',
    label: '5-10-5 shuttle',
    unit: 's',
    kind: 'time',
    a: 326.8,
    b: 6,
    c: 1.81,
    perform: (a) => {
      const r = agilityValue(a, 'shuttle')
      return { value: r.value, quality: r.quality, display: time(r.value) }
    },
  },
  freeThrows: {
    id: 'freeThrows',
    label: 'Free throws (of 10)',
    unit: 'made',
    kind: 'mark',
    a: 100,
    b: 0,
    c: 1,
    perform: (a, seed) => {
      const r = freeThrowContest(a, createRng(seed ^ hashString(a.id + 'ft')))
      return { value: r.made, quality: 'SIMULATED', display: `${r.made} of 10` }
    },
  },
  threePoint: {
    id: 'threePoint',
    label: 'Three-point contest (of 30)',
    unit: 'pts',
    kind: 'mark',
    a: 33.3,
    b: 0,
    c: 1,
    perform: (a, seed) => {
      const r = threePointContest(a, createRng(seed ^ hashString(a.id + '3pt')))
      return { value: r.score, quality: 'SIMULATED', display: `${r.score} pts` }
    },
  },
}

export function points(event: TournamentEvent, value: number): number {
  const gap = event.kind === 'time' ? event.b - value : value - event.b
  if (gap <= 0) return 0
  return Math.floor(event.a * Math.pow(gap, event.c))
}

export interface Standing {
  athlete: Athlete
  total: number
  results: { event: EventId; display: string; points: number; quality: Quality }[]
  quality: Quality
}

export function runTournament(athletes: Athlete[], events: EventId[], seed: number): Standing[] {
  const standings = athletes.map((athlete) => {
    const results = events.map((id) => {
      const e = EVENTS[id]
      const r = e.perform(athlete, seed)
      return { event: id, display: r.display, points: points(e, r.value), quality: r.quality }
    })
    return { athlete, results, total: results.reduce((s, r) => s + r.points, 0), quality: weakest(...results.map((r) => r.quality)) }
  })
  return standings.sort((x, y) => y.total - x.total)
}

export const DEFAULT_EVENTS: EventId[] = ['dash40', 'dash100', 'vertical', 'broad', 'bench', 'throwBaseball', 'shuttle', 'freeThrows', 'threePoint', 'dash200']
