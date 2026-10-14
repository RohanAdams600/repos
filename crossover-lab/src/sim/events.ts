import type { Athlete, MetricKey, Quality } from '../data/types'
import { weakest } from '../data/types'
import { resolveMetric } from '../data/resolve'
import { METRICS } from '../data/metrics'
import { gradesFor } from '../grades/grades'
import { normalizeJump, normalizeStrength } from './normalize'

/**
 * Single-number events (jumps, lifts, agility drills, flexibility). Each returns the athlete's
 * figure with its label, falling back to a documented estimate when the profile has no figure.
 */
export interface EventValue {
  value: number
  quality: Quality
  basis: string
  sourceId?: string
}

export type JumpEvent = 'standingVertical' | 'maxVertical' | 'broadJump'
export type LiftEvent = 'bench' | 'squat' | 'deadlift' | 'clean'
export type AgilityEvent = 'shuttle' | 'threeCone' | 'laneAgility' | 'sitReach'

const JUMP_KEY: Record<JumpEvent, MetricKey> = { standingVertical: 'standingVerticalIn', maxVertical: 'maxVerticalIn', broadJump: 'broadJumpIn' }
const LIFT_KEY: Record<LiftEvent, MetricKey> = { bench: 'bench1RmLb', squat: 'squat1RmLb', deadlift: 'deadlift1RmLb', clean: 'clean1RmLb' }
const AGILITY_KEY: Record<AgilityEvent, MetricKey> = { shuttle: 'shuttleS', threeCone: 'threeConeS', laneAgility: 'laneAgilityS', sitReach: 'sitReachIn' }

export const JUMP_LABEL: Record<JumpEvent, string> = { standingVertical: 'Standing vertical', maxVertical: 'Running vertical', broadJump: 'Broad jump' }
export const LIFT_LABEL: Record<LiftEvent, string> = { bench: 'Bench press', squat: 'Back squat', deadlift: 'Deadlift', clean: 'Power clean' }
export const AGILITY_LABEL: Record<AgilityEvent, string> = { shuttle: '5-10-5 shuttle', threeCone: '3-cone drill', laneAgility: 'Lane agility', sitReach: 'Sit and reach' }

function fromMetric(a: Athlete, key: MetricKey): EventValue | undefined {
  const m = resolveMetric(a, key)
  if (!m) return undefined
  return { value: m.value, quality: m.quality, basis: m.note ?? `${METRICS[key].label} from the profile.`, sourceId: m.sourceId }
}

export function jumpValue(a: Athlete, event: JumpEvent): EventValue {
  const direct = fromMetric(a, JUMP_KEY[event])
  if (direct) return direct
  const max = resolveMetric(a, 'maxVerticalIn')
  const standing = resolveMetric(a, 'standingVerticalIn')
  if (event === 'maxVertical' && standing) return { value: standing.value + 5, quality: weakest(standing.quality, 'ESTIMATED'), basis: 'Standing vertical plus 5 inches.' }
  if (event === 'standingVertical' && max) return { value: max.value - 5, quality: weakest(max.quality, 'ESTIMATED'), basis: 'Max vertical minus 5 inches.' }
  if (event === 'broadJump' && (max || standing)) {
    const v = max ? max.value : standing!.value + 5
    const h = resolveMetric(a, 'heightIn')?.value ?? 74
    return { value: 2.1 * v + 0.7 * h, quality: 'ESTIMATED', basis: 'Estimated from vertical and height (2.1 × vertical + 0.7 × height).' }
  }
  return { value: event === 'broadJump' ? 110 : event === 'maxVertical' ? 30 : 25, quality: 'SIMULATED', basis: 'No jump data; demo default.' }
}

export function liftValue(a: Athlete, event: LiftEvent): EventValue {
  return fromMetric(a, LIFT_KEY[event]) ?? { value: 225, quality: 'SIMULATED', basis: 'No lift data; demo default.' }
}

export function agilityValue(a: Athlete, event: AgilityEvent): EventValue {
  const direct = fromMetric(a, AGILITY_KEY[event])
  if (direct) return direct
  const agility = gradesFor(a).find((g) => g.id === 'agility')
  const z = agility?.z ?? 0
  const base: Record<AgilityEvent, [number, number]> = { shuttle: [4.35, 0.15], threeCone: [7.15, 0.2], laneAgility: [11.3, 0.35], sitReach: [13, 3] }
  const [mean, sd] = base[event]
  const value = event === 'sitReach' ? mean : mean - sd * z
  return { value, quality: 'SIMULATED', basis: 'No measured time; from the agility grade.' }
}

/** Reps at a given load from a one-rep max (Epley, inverted). */
export function repsAt(oneRepMax: number, load: number): number {
  if (load > oneRepMax) return 0
  return Math.max(0, Math.floor(30 * (oneRepMax / load - 1) + 1e-9) + 1)
}

export interface Ranked<T> {
  athlete: Athlete
  result: T
  display: string
  sortValue: number
  quality: Quality
  normalized?: { value: number; display: string; quality: Quality; method: string }
}

export function rankDescending<T>(rows: Ranked<T>[], useNormalized = false): Ranked<T>[] {
  return [...rows].sort((x, y) => (useNormalized && x.normalized && y.normalized ? y.normalized.value - x.normalized.value : y.sortValue - x.sortValue))
}

export function jumpContest(athletes: Athlete[], event: JumpEvent): Ranked<EventValue>[] {
  return athletes.map((a) => {
    const r = jumpValue(a, event)
    const n = event === 'broadJump' ? undefined : normalizeJump(a, r.value, r.quality)
    return {
      athlete: a,
      result: r,
      sortValue: r.value,
      quality: r.quality,
      display: event === 'broadJump' ? `${Math.floor(r.value / 12)}'${Math.round(r.value % 12)}" (${r.value.toFixed(0)} in)` : `${r.value.toFixed(1)} in`,
      ...(n ? { normalized: { value: n.value, display: `${n.value.toFixed(1)} W/kg`, quality: n.quality, method: n.method } } : {}),
    }
  })
}

export function liftContest(athletes: Athlete[], event: LiftEvent, repLoad?: number): Ranked<EventValue>[] {
  return athletes.map((a) => {
    const r = liftValue(a, event)
    const n = normalizeStrength(a, r.value, r.quality)
    const reps = repLoad ? repsAt(r.value, repLoad) : undefined
    return {
      athlete: a,
      result: r,
      sortValue: reps ?? r.value,
      quality: r.quality,
      display: reps !== undefined ? `${reps} reps at ${repLoad} lb` : `${r.value.toFixed(0)} lb`,
      ...(n ? { normalized: { value: n.value, display: `${n.value.toFixed(0)} lb at 200 lb bodyweight`, quality: n.quality, method: n.method } } : {}),
    }
  })
}

export function agilityContest(athletes: Athlete[], event: AgilityEvent): Ranked<EventValue>[] {
  return athletes.map((a) => {
    const r = agilityValue(a, event)
    return {
      athlete: a,
      result: r,
      // Lower is better for timed drills; sit and reach is higher-better, so negate the times.
      sortValue: event === 'sitReach' ? r.value : -r.value,
      quality: r.quality,
      display: event === 'sitReach' ? `${r.value.toFixed(1)} in` : `${r.value.toFixed(2)} s`,
    }
  })
}
