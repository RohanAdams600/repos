import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { ageOn } from '@/lib/auth/age'
import { cached } from '@/lib/cache'
import { db } from '@/lib/db'
import { birthDateWindow, cohortBands, describeBands, K_MIN, rankInCohort, type BuildInput, type CohortBands } from '@/lib/insights/build-cohort'
import { nationalPercentile, nationalQuantiles, type NationalResult, type NormSource } from '@/lib/insights/national'
import { projectAcrossSports, type Projection } from '@/lib/insights/projection'
import { METRIC_DEFINITIONS, METRIC_TYPES, metricDbValue, type MetricType } from '@/lib/metrics/definitions'
import type { Quantiles } from '@/lib/metrics/percentile'
import { bestMetrics } from '@/lib/metrics/service'

const LOOKBACK_MONTHS = 18
const CACHE_SECONDS = 6 * 3600

type CohortRow = [athleteId: string, value: number]

/** Best value per athlete in the build cohort (accounts pending deletion excluded). Cached for six hours. */
async function loadCohort(type: MetricType, bands: CohortBands, today: Date): Promise<CohortRow[]> {
  const key = `bio:${type}:${today.toISOString().slice(0, 10)}:${bands.ageMin}-${bands.ageMax}:${bands.heightMin}-${bands.heightMax}:${bands.weightMin}-${bands.weightMax}`
  return cached(key, CACHE_SECONDS, async () => {
    const since = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - LOOKBACK_MONTHS, today.getUTCDate()))
    const { bornAfter, bornOnOrBefore } = birthDateWindow(bands.ageMin, bands.ageMax, today)
    const aggregate = METRIC_DEFINITIONS[type].higherIsBetter ? Prisma.sql`MAX(m.value)` : Prisma.sql`MIN(m.value)`
    const rows = await db.$queryRaw<{ athlete_id: string; best: Prisma.Decimal }[]>`
      SELECT m.athlete_id, ${aggregate} AS best
      FROM metrics m
      JOIN athlete_profiles p ON p.user_id = m.athlete_id
      JOIN users u ON u.id = p.user_id
      WHERE m.metric_type = ${metricDbValue(type)}::"MetricType"
        AND m.date >= ${since}
        AND p.height BETWEEN ${bands.heightMin} AND ${bands.heightMax}
        AND p.weight BETWEEN ${bands.weightMin} AND ${bands.weightMax}
        AND u.date_of_birth > ${bornAfter} AND u.date_of_birth <= ${bornOnOrBefore}
        AND u.deletion_scheduled_for IS NULL
      GROUP BY m.athlete_id`
    return rows.map((r) => [r.athlete_id, Number(r.best)] as CohortRow)
  })
}

export type BiometricResult =
  | { status: 'ok'; metricType: MetricType; value: number; percentile: number; cohortSize: number; bands: CohortBands; bandsLabel: string }
  | { status: 'insufficient'; metricType: MetricType; value: number; largestCohort: number }

/** Narrowest build cohort with at least K_MIN other athletes. The athlete is never compared with themselves. */
export async function biometricPercentile(
  input: BuildInput & { metricType: MetricType; value: number; excludeAthleteId?: string },
  today: Date = new Date(),
): Promise<BiometricResult> {
  let largest = 0
  for (const bands of cohortBands(input)) {
    const rows = (await loadCohort(input.metricType, bands, today)).filter(([id]) => id !== input.excludeAthleteId)
    largest = Math.max(largest, rows.length)
    if (rows.length >= K_MIN) {
      const sorted = rows.map(([, v]) => v).sort((a, b) => a - b)
      return {
        status: 'ok',
        metricType: input.metricType,
        value: input.value,
        percentile: rankInCohort(input.value, sorted, METRIC_DEFINITIONS[input.metricType].higherIsBetter),
        cohortSize: rows.length,
        bands,
        bandsLabel: describeBands(bands),
      }
    }
  }
  return { status: 'insufficient', metricType: input.metricType, value: input.value, largestCohort: largest }
}

/** KineticScout build cohort, plus the national figure when a licensed table covers the athlete. */
export type AthleteMetricInsight = BiometricResult & { national: NationalResult | null }

export type AthleteInsights =
  | { status: 'needs-build'; missing: ('height' | 'weight')[] }
  | { status: 'ok'; age: number; heightInches: number; weightLbs: number; results: AthleteMetricInsight[] }

export async function athleteBiometrics(athleteId: string, today: Date = new Date()): Promise<AthleteInsights> {
  const profile = await db.athleteProfile.findUniqueOrThrow({
    where: { userId: athleteId },
    select: { heightInches: true, weightLbs: true, user: { select: { dateOfBirth: true } } },
  })
  const missing = [...(profile.heightInches ? [] : ['height' as const]), ...(profile.weightLbs ? [] : ['weight' as const])]
  if (missing.length) return { status: 'needs-build', missing }
  const age = ageOn(profile.user.dateOfBirth, today)
  const best = await bestMetrics(athleteId, LOOKBACK_MONTHS, today)
  const build = { age, heightInches: profile.heightInches!, weightLbs: profile.weightLbs! }
  const results = await Promise.all(
    (Object.entries(best) as [MetricType, number][]).map(async ([metricType, value]) => {
      const [cohort, national] = await Promise.all([
        biometricPercentile({ metricType, value, ...build, excludeAthleteId: athleteId }, today),
        nationalPercentile({ metricType, value, ...build }, today),
      ])
      return { ...cohort, national }
    }),
  )
  return { status: 'ok', age, heightInches: profile.heightInches!, weightLbs: profile.weightLbs!, results }
}

export type CohortScope = 'class' | 'all-classes' | 'national'
export type ProjectionWithScope = Projection & { scope: CohortScope; gradYear: number; source: NormSource | null }

/** Latest weekly snapshot per metric: the athlete's class when that cohort exists, otherwise all classes. */
async function latestQuantiles(gradYear: number, today: Date): Promise<{ quantiles: Partial<Record<MetricType, Quantiles>>; scope: Partial<Record<MetricType, CohortScope>> }> {
  // Snapshots older than eight weeks are ignored rather than presented as current.
  const freshSince = new Date(today.getTime() - 56 * 86_400_000)
  const rows = await db.percentileBaseline.findMany({
    where: { position: null, computedFor: { gte: freshSince }, OR: [{ gradYear }, { gradYear: null }] },
    orderBy: { computedFor: 'desc' },
    select: { metricType: true, gradYear: true, p10: true, p25: true, p50: true, p75: true, p90: true },
    take: 500,
  })
  const quantiles: Partial<Record<MetricType, Quantiles>> = {}
  const scope: Partial<Record<MetricType, CohortScope>> = {}
  for (const preferClass of [true, false]) {
    for (const row of rows) {
      if (quantiles[row.metricType] || (row.gradYear !== null) !== preferClass) continue
      quantiles[row.metricType] = { p10: Number(row.p10), p25: Number(row.p25), p50: Number(row.p50), p75: Number(row.p75), p90: Number(row.p90) }
      scope[row.metricType] = preferClass ? 'class' : 'all-classes'
    }
  }
  return { quantiles, scope }
}

/**
 * Projections into sports other than the athlete's own, from their measured metrics. When licensed
 * national tables cover the athlete's build for the target metric, the projection is read entirely
 * from national tables (never mixing a national source with a KineticScout target); otherwise it
 * uses the weekly KineticScout snapshots.
 */
export async function athleteProjections(athleteId: string, today: Date = new Date()): Promise<ProjectionWithScope[]> {
  const profile = await db.athleteProfile.findUniqueOrThrow({
    where: { userId: athleteId },
    select: { gradYear: true, sport: true, heightInches: true, weightLbs: true, user: { select: { dateOfBirth: true } } },
  })
  const [best, { quantiles, scope }] = await Promise.all([bestMetrics(athleteId, LOOKBACK_MONTHS, today), latestQuantiles(profile.gradYear, today)])
  const otherSport = (p: Projection) => METRIC_DEFINITIONS[p.target].sport !== profile.sport

  const national = new Map<MetricType, ProjectionWithScope>()
  if (profile.heightInches && profile.weightLbs) {
    const norms = await nationalQuantiles({ age: ageOn(profile.user.dateOfBirth, today), heightInches: profile.heightInches, weightLbs: profile.weightLbs }, METRIC_TYPES, today)
    const nationalMap = Object.fromEntries(Object.entries(norms).map(([type, n]) => [type, n.quantiles])) as Partial<Record<MetricType, Quantiles>>
    for (const p of projectAcrossSports(best, nationalMap).filter(otherSport)) {
      national.set(p.target, { ...p, scope: 'national', gradYear: profile.gradYear, source: norms[p.target]!.source })
    }
  }
  const local = projectAcrossSports(best, quantiles)
    .filter(otherSport)
    .filter((p) => !national.has(p.target))
    .map((p): ProjectionWithScope => ({ ...p, scope: scope[p.target] ?? 'all-classes', gradYear: profile.gradYear, source: null }))
  return [...national.values(), ...local]
}
