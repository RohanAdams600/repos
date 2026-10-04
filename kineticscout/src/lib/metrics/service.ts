import 'server-only'
import { metricLoggingQuota, type SessionUser } from '@/lib/auth/permissions'
import { startOfUtcMonth } from '@/lib/ai/budget'
import { db } from '@/lib/db'
import { isPlausibleMetricValue, METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'
import { percentileRank } from '@/lib/metrics/percentile'

export class MetricQuotaError extends Error {
  constructor(public readonly limit: number) {
    super(`Free accounts can log ${limit} metrics per month`)
    this.name = 'MetricQuotaError'
  }
}

export class MetricValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetricValidationError'
  }
}

/**
 * Logs a metric while enforcing the Free tier's monthly quota.
 *
 * The quota check and insert run in one transaction holding a per-athlete advisory lock, so
 * simultaneous submissions (double clicks, scripted requests, several tabs) cannot exceed the
 * limit. See tests/integration/metric-quota.test.ts.
 */
export async function logMetric(
  user: SessionUser,
  input: { metricType: MetricType; value: number; date: Date },
  now: Date = new Date(),
): Promise<{ id: string; remaining: number | null }> {
  const def = METRIC_DEFINITIONS[input.metricType]
  if (!isPlausibleMetricValue(input.metricType, input.value)) {
    throw new MetricValidationError(`${def.label} must be between ${def.min} and ${def.max} ${def.unit}`)
  }
  const earliest = new Date(now.getTime() - 2 * 365 * 24 * 3600_000)
  if (input.date.getTime() > now.getTime() + 24 * 3600_000 || input.date < earliest) {
    throw new MetricValidationError('Measurement date must be within the last two years and not in the future')
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`metrics:${user.id}`}, 0))`
    const loggedThisMonth = await tx.metric.count({ where: { athleteId: user.id, createdAt: { gte: startOfUtcMonth(now) } } })
    const quota = metricLoggingQuota(user, loggedThisMonth)
    if (!quota.allowed) throw new MetricQuotaError(quota.limit ?? 0)

    const created = await tx.metric.create({
      data: {
        athleteId: user.id,
        metricType: input.metricType,
        value: Number(input.value.toFixed(def.decimals)),
        date: input.date,
      },
      select: { id: true },
    })
    return { id: created.id, remaining: quota.remaining === null ? null : quota.remaining - 1 }
  })
}

/** Best value per metric within the lookback window, honouring each metric's direction. */
export async function bestMetrics(athleteId: string, sinceMonths = 18, now: Date = new Date()): Promise<Partial<Record<MetricType, number>>> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - sinceMonths, now.getUTCDate()))
  const rows = await db.metric.groupBy({
    by: ['metricType'],
    where: { athleteId, date: { gte: since } },
    _max: { value: true },
    _min: { value: true },
  })
  const out: Partial<Record<MetricType, number>> = {}
  for (const row of rows) {
    const value = METRIC_DEFINITIONS[row.metricType].higherIsBetter ? row._max.value : row._min.value
    if (value !== null) out[row.metricType] = Number(value)
  }
  return out
}

export type ClassStanding = { percentile: number; cohortSize: number }

/**
 * Standing of each value within the athlete's graduating class, from the latest weekly snapshot.
 * Snapshots only exist for cohorts of at least 25 athletes, so small groups return nothing.
 */
export async function classStandings(gradYear: number, values: Partial<Record<MetricType, number>>): Promise<Partial<Record<MetricType, ClassStanding>>> {
  const types = Object.keys(values) as MetricType[]
  if (types.length === 0) return {}
  const baselines = await db.percentileBaseline.findMany({
    where: { metricType: { in: types }, gradYear, position: null },
    orderBy: { computedFor: 'desc' },
    distinct: ['metricType'],
    select: { metricType: true, sampleSize: true, p10: true, p25: true, p50: true, p75: true, p90: true },
  })
  const out: Partial<Record<MetricType, ClassStanding>> = {}
  for (const b of baselines) {
    const value = values[b.metricType]
    if (value === undefined) continue
    out[b.metricType] = {
      percentile: percentileRank(b.metricType, value, { p10: Number(b.p10), p25: Number(b.p25), p50: Number(b.p50), p75: Number(b.p75), p90: Number(b.p90) }),
      cohortSize: b.sampleSize,
    }
  }
  return out
}

export type MetricSummaryItem = {
  metricType: MetricType
  best: number
  latest: { value: number; date: string; verified: boolean }
  /** Better than this % of the athlete's graduating class on KineticScout, or null if the cohort is too small. */
  classPercentile: number | null
  cohortSize: number | null
}

export async function metricSummary(user: SessionUser, now: Date = new Date()) {
  const profile = await db.athleteProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { gradYear: true } })
  const best = await bestMetrics(user.id, 18, now)
  const types = Object.keys(best) as MetricType[]

  const latestRows = await Promise.all(
    types.map((metricType) =>
      db.metric.findFirst({
        where: { athleteId: user.id, metricType },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: { value: true, date: true, verified: true },
      }),
    ),
  )

  // Latest weekly snapshot for the athlete's class, one cohort per metric.
  const standings = await classStandings(profile.gradYear, best)

  const items: MetricSummaryItem[] = types.map((metricType, i) => {
    const latest = latestRows[i]!
    return {
      metricType,
      best: best[metricType]!,
      latest: { value: Number(latest.value), date: latest.date.toISOString().slice(0, 10), verified: latest.verified },
      classPercentile: standings[metricType]?.percentile ?? null,
      cohortSize: standings[metricType]?.cohortSize ?? null,
    }
  })

  const loggedThisMonth = await db.metric.count({ where: { athleteId: user.id, createdAt: { gte: startOfUtcMonth(now) } } })
  return { gradYear: profile.gradYear, items, quota: metricLoggingQuota(user, loggedThisMonth) }
}
