import { METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'
import { percentileRank, type Quantiles } from '@/lib/metrics/percentile'

/**
 * Cross-sport projectability as percentile equivalence.
 *
 * Metrics are grouped by the physical quality they mostly express. For a target metric the
 * athlete has not measured, we take their standing (percentile within a cohort) on the measured
 * metrics of the same group and read off the target value at that same standing in the target
 * metric's cohort. "Your 40-yard dash puts you at the 80th percentile; the 80th percentile 60-yard
 * dash in your class is 6.85 s." It is an equivalence between distributions, not a prediction of
 * what the athlete would measure, and every result says so.
 */
export type Trait = 'SPEED' | 'ARM' | 'ROTATIONAL_POWER'

export const TRAIT_GROUPS: Record<Trait, readonly MetricType[]> = {
  SPEED: ['SIXTY_YARD_DASH', 'FORTY_YARD_DASH'],
  ARM: ['PITCH_VELO', 'INFIELD_VELO', 'OUTFIELD_VELO', 'THROW_VELOCITY', 'THROW_DISTANCE'],
  ROTATIONAL_POWER: ['EXIT_VELOCITY', 'BAT_SPEED', 'SLAPSHOT_SPEED', 'WRIST_SHOT_SPEED'],
}

export const TRAIT_LABELS: Record<Trait, string> = { SPEED: 'Speed', ARM: 'Arm strength', ROTATIONAL_POWER: 'Rotational power' }

export function traitOf(type: MetricType): Trait | null {
  for (const [trait, types] of Object.entries(TRAIT_GROUPS) as [Trait, readonly MetricType[]][]) if (types.includes(type)) return trait
  return null
}

/**
 * Raw value at a "better than X%" standing, the inverse of percentileRank. Only standings between
 * the 10th and 90th percentile are resolved; beyond that we report the p10 or p90 value as a bound.
 */
export function valueAtStanding(type: MetricType, standing: number, q: Quantiles): { value: number; bound: 'exact' | 'at-least' | 'at-most' } {
  const def = METRIC_DEFINITIONS[type]
  // Convert "better than X%" into a position in the raw ascending distribution.
  const rawPct = def.higherIsBetter ? standing : 100 - standing
  const points: [number, number][] = [
    [10, q.p10],
    [25, q.p25],
    [50, q.p50],
    [75, q.p75],
    [90, q.p90],
  ]
  // rawPct already accounts for direction, so the low tail is always "at most p10" and the high tail
  // "at least p90" (for a timed event, a top standing means a time at most the p10 value).
  if (rawPct <= 10) return { value: q.p10, bound: 'at-most' }
  if (rawPct >= 90) return { value: q.p90, bound: 'at-least' }
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, v0] = points[i]!
    const [p1, v1] = points[i + 1]!
    if (rawPct >= p0 && rawPct <= p1) {
      const value = v0 + ((rawPct - p0) / (p1 - p0)) * (v1 - v0)
      return { value: Number(value.toFixed(def.decimals)), bound: 'exact' }
    }
  }
  return { value: q.p50, bound: 'exact' }
}

export type SourceStanding = { metricType: MetricType; value: number; standing: number }

export type Projection = {
  target: MetricType
  trait: Trait
  standing: number
  value: number
  bound: 'exact' | 'at-least' | 'at-most'
  sources: SourceStanding[]
}

/**
 * Builds projections for every metric in a trait group that the athlete has not logged, from the
 * metrics they have logged in that group. `quantiles` gives the cohort distribution per metric.
 */
export function projectAcrossSports(best: Partial<Record<MetricType, number>>, quantiles: Partial<Record<MetricType, Quantiles>>): Projection[] {
  const out: Projection[] = []
  for (const [trait, group] of Object.entries(TRAIT_GROUPS) as [Trait, readonly MetricType[]][]) {
    const sources: SourceStanding[] = []
    for (const type of group) {
      const value = best[type]
      const q = quantiles[type]
      if (value !== undefined && q) sources.push({ metricType: type, value, standing: percentileRank(type, value, q) })
    }
    if (sources.length === 0) continue
    const standing = Math.round(sources.reduce((sum, s) => sum + s.standing, 0) / sources.length)
    for (const target of group) {
      if (best[target] !== undefined) continue
      const q = quantiles[target]
      if (!q) continue
      out.push({ target, trait, standing, ...valueAtStanding(target, standing, q), sources })
    }
  }
  return out
}
