import type { Athlete } from '../data/types'
import { latestSeason } from '../data/resolve'
import { overall } from '../grades/grades'
import { createRng, gaussian, hashString } from './rng'

/**
 * Dynasty cards refresh once a week. Production would rebuild them from the stats feed every
 * Monday; until that feed is connected, week-to-week movement is SIMULATED (a small seeded
 * random walk around the current overall) and labeled so.
 */
export interface CardWeek {
  weekStart: string
  overall: number
}

export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
  return d
}

export function weeklyCard(a: Athlete, today: Date, weeks = 8): { weeks: CardWeek[]; delta: number; latestStats: string } {
  const base = overall(a).value
  const monday = mondayOf(today)
  const rng = createRng(hashString(`${a.id}:${monday.toISOString().slice(0, 10)}`))
  const list: CardWeek[] = []
  let v = base
  // Walk backwards from this week's overall so the newest point is the real current value.
  for (let i = 0; i < weeks; i++) {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() - 7 * i)
    list.unshift({ weekStart: d.toISOString().slice(0, 10), overall: Math.max(40, Math.min(99, Math.round(v))) })
    v -= gaussian(rng) * 0.9
  }
  const n = list.length
  return { weeks: list, delta: n > 1 ? list[n - 1]!.overall - list[n - 2]!.overall : 0, latestStats: latestSeason(a)?.season ?? 'none on file' }
}
