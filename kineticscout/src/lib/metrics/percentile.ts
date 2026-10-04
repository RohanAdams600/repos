import { METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'

/** Quantiles of the raw value distribution for a cohort (as stored in percentile_baselines). */
export type Quantiles = { p10: number; p25: number; p50: number; p75: number; p90: number }

/**
 * "Better than X% of the cohort", interpolated linearly between stored quantiles and clamped to
 * 1 to 99 (the tails beyond p10 and p90 are not resolved precisely, so we never claim 0 or 100).
 * For timed events lower values are better, so the ranking is mirrored.
 */
export function percentileRank(type: MetricType, value: number, q: Quantiles): number {
  const points: [number, number][] = [
    [q.p10, 10],
    [q.p25, 25],
    [q.p50, 50],
    [q.p75, 75],
    [q.p90, 90],
  ]
  let rank: number
  if (value <= points[0]![0]) {
    const spread = Math.max(1e-9, points[1]![0] - points[0]![0])
    rank = 10 - (10 * (points[0]![0] - value)) / (spread * 1.5)
  } else if (value >= points[4]![0]) {
    const spread = Math.max(1e-9, points[4]![0] - points[3]![0])
    rank = 90 + (10 * (value - points[4]![0])) / (spread * 1.5)
  } else {
    rank = 50
    for (let i = 0; i < points.length - 1; i++) {
      const [v0, r0] = points[i]!
      const [v1, r1] = points[i + 1]!
      if (value >= v0 && value <= v1) {
        rank = v1 > v0 ? r0 + ((value - v0) / (v1 - v0)) * (r1 - r0) : (r0 + r1) / 2
        break
      }
    }
  }
  const directional = METRIC_DEFINITIONS[type].higherIsBetter ? rank : 100 - rank
  return Math.round(Math.min(99, Math.max(1, directional)))
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
