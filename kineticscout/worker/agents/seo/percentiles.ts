import { positionFromDb, type Position } from '@/lib/athletes/positions'
import { db } from '@/lib/db'
import { METRIC_DEFINITIONS, METRIC_TYPES, metricDbValue, metricTypeFromDb, type MetricType } from '@/lib/metrics/definitions'

export type CohortBaseline = {
  cohortKey: string
  metricType: MetricType
  gradYear: number | null
  position: Position | null
  sampleSize: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  mean: number
  stddev: number
}

type Row = {
  metric: string
  grad_year: number | null
  position: string | null
  all_years: number
  all_positions: number
  n: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  mean: number
  stddev: number
}

export function cohortKey(metric: MetricType, gradYear: number | null, position: Position | null): string {
  return `${metric}|${gradYear ?? '*'}|${position ?? '*'}`
}

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function isoWeekStart(date: Date): Date {
  const day = date.getUTCDay() || 7
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (day - 1)))
}

/**
 * Computes cohort percentiles in one pass with GROUPING SETS:
 *   (metric, class, position), (metric, class), (metric, position), (metric).
 *
 * Privacy:
 *   - Each athlete contributes one value per metric (their best in the window), so frequent
 *     loggers cannot dominate and individual entries cannot be isolated.
 *   - Cohorts with fewer than `k` athletes are dropped in SQL; they never leave the database.
 *   - Only aggregates are returned. No identifiers are selected.
 */
export async function computeBaselines(now: Date, k: number, windowMonths = 12): Promise<CohortBaseline[]> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - windowMonths, now.getUTCDate()))
  const lowerIsBetter = METRIC_TYPES.filter((t) => !METRIC_DEFINITIONS[t].higherIsBetter).map(metricDbValue)

  const rows = await db.$queryRaw<Row[]>`
    WITH best AS (
      SELECT m.athlete_id,
             m.metric_type::text AS metric,
             ap.grad_year::int AS grad_year,
             ap.primary_position::text AS position,
             CASE WHEN m.metric_type::text = ANY(${lowerIsBetter}::text[]) THEN MIN(m.value) ELSE MAX(m.value) END AS value
      FROM metrics m
      JOIN athlete_profiles ap ON ap.user_id = m.athlete_id
      WHERE m.date >= ${since} AND ap.sport = 'BASEBALL'
      GROUP BY m.athlete_id, m.metric_type, ap.grad_year, ap.primary_position
    )
    SELECT metric,
           grad_year,
           position,
           GROUPING(grad_year)::int AS all_years,
           GROUPING(position)::int AS all_positions,
           COUNT(*)::int AS n,
           percentile_cont(0.10) WITHIN GROUP (ORDER BY value)::float8 AS p10,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY value)::float8 AS p25,
           percentile_cont(0.50) WITHIN GROUP (ORDER BY value)::float8 AS p50,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY value)::float8 AS p75,
           percentile_cont(0.90) WITHIN GROUP (ORDER BY value)::float8 AS p90,
           AVG(value)::float8 AS mean,
           COALESCE(STDDEV_SAMP(value), 0)::float8 AS stddev
    FROM best
    GROUP BY GROUPING SETS ((metric, grad_year, position), (metric, grad_year), (metric, position), (metric))
    HAVING COUNT(*) >= ${k}
  `

  const baselines: CohortBaseline[] = []
  for (const row of rows) {
    const metricType = metricTypeFromDb(row.metric)
    if (!metricType) continue
    const gradYear = row.all_years ? null : row.grad_year
    const position = row.all_positions ? null : row.position ? positionFromDb(row.position) : null
    if (!row.all_positions && !position) continue
    const round = (v: number) => Math.round(v * 100) / 100
    baselines.push({
      cohortKey: cohortKey(metricType, gradYear, position),
      metricType,
      gradYear,
      position,
      sampleSize: row.n,
      p10: round(row.p10),
      p25: round(row.p25),
      p50: round(row.p50),
      p75: round(row.p75),
      p90: round(row.p90),
      mean: round(row.mean),
      stddev: round(row.stddev),
    })
  }
  return baselines
}

/** Replaces the snapshot for the week atomically so readers never see a half-written week. */
export async function storeBaselines(weekStart: Date, baselines: CohortBaseline[]): Promise<number> {
  await db.$transaction([
    db.percentileBaseline.deleteMany({ where: { computedFor: weekStart } }),
    db.percentileBaseline.createMany({
      data: baselines.map((b) => ({ ...b, computedFor: weekStart })),
    }),
  ])
  return baselines.length
}
