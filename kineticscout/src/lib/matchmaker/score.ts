import { z } from 'zod'
import { metricWeightsForPosition, type Position } from '@/lib/athletes/positions'
import { METRIC_DEFINITIONS, METRIC_TYPES, type MetricType } from '@/lib/metrics/definitions'

/**
 * College Matchmaker scoring.
 *
 * For each program we compare the athlete's best recent numbers with the program's typical recruit
 * (mean and standard deviation per metric, from CollegeProgram.averageRecruitingMetrics):
 *
 *   z = (athlete - mean) / sd, sign-flipped for timed events where lower is better
 *
 * The position-weighted average z gives a composite. Bands translate the composite into plain
 * language; they describe how the athlete's measurables compare with recent recruits and are never
 * presented as a prediction of an offer.
 */

export const programMetricsSchema = z.partialRecord(
  z.enum(METRIC_TYPES as [MetricType, ...MetricType[]]),
  z.object({ mean: z.number().positive(), sd: z.number().positive() }),
)

export type ProgramMetrics = z.infer<typeof programMetricsSchema>

export type ProgramInput = {
  id: string
  schoolName: string
  division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO'
  state: string | null
  conference: string | null
  minGpa: number | null
  metrics: unknown
}

export type AthleteInput = {
  position: Position
  gpa: number | null
  /** Best value per metric over the lookback window. */
  bestMetrics: Partial<Record<MetricType, number>>
}

export type FitBand = 'STRONG' | 'REALISTIC' | 'REACH' | 'LONG_SHOT'

export type MetricComparison = {
  metric: MetricType
  athleteValue: number
  programMean: number
  /** Positive means better than the program's typical recruit. */
  z: number
  /** Share of the program's recruits the athlete out-performs on this metric (0 to 100). */
  standing: number
  weight: number
}

export type MatchResult = {
  programId: string
  schoolName: string
  division: ProgramInput['division']
  state: string | null
  conference: string | null
  compositeZ: number
  /** 0 to 100. Highest where the athlete sits at or slightly above the typical recruit. */
  fitScore: number
  band: FitBand
  /** Share of the position's weighted metrics that both sides have data for (0 to 1). */
  coverage: number
  academic: 'MEETS' | 'BELOW' | 'UNKNOWN'
  comparisons: MetricComparison[]
}

const MIN_COVERAGE = 0.5

/** Standard normal CDF via the Abramowitz and Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

export function bandFor(compositeZ: number): FitBand {
  if (compositeZ >= 0.5) return 'STRONG'
  if (compositeZ >= -0.5) return 'REALISTIC'
  if (compositeZ >= -1.25) return 'REACH'
  return 'LONG_SHOT'
}

/** Gaussian preference centred slightly above the typical recruit (z = 0.25). */
export function fitScoreFor(compositeZ: number): number {
  return Math.round(100 * Math.exp(-((compositeZ - 0.25) ** 2) / (2 * 0.75 ** 2)))
}

export function scoreProgram(athlete: AthleteInput, program: ProgramInput): MatchResult | null {
  const parsed = programMetricsSchema.safeParse(program.metrics)
  if (!parsed.success) return null
  const programMetrics = parsed.data

  const weights = metricWeightsForPosition(athlete.position)
  const totalWeight = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0)
  if (totalWeight === 0) return null

  const comparisons: MetricComparison[] = []
  for (const [metric, weight] of Object.entries(weights) as [MetricType, number][]) {
    const athleteValue = athlete.bestMetrics[metric]
    const target = programMetrics[metric]
    if (athleteValue === undefined || !target) continue
    const direction = METRIC_DEFINITIONS[metric].higherIsBetter ? 1 : -1
    const z = (direction * (athleteValue - target.mean)) / target.sd
    comparisons.push({
      metric,
      athleteValue,
      programMean: target.mean,
      z: Math.round(z * 100) / 100,
      standing: Math.round(normalCdf(z) * 100),
      weight,
    })
  }

  const coveredWeight = comparisons.reduce((sum, c) => sum + c.weight, 0)
  const coverage = coveredWeight / totalWeight
  if (coverage < MIN_COVERAGE) return null

  const compositeZ = comparisons.reduce((sum, c) => sum + c.z * c.weight, 0) / coveredWeight
  let band = bandFor(compositeZ)

  let academic: MatchResult['academic'] = 'UNKNOWN'
  if (program.minGpa !== null && athlete.gpa !== null) academic = athlete.gpa >= program.minGpa ? 'MEETS' : 'BELOW'
  // Below a program's academic floor, measurables alone cannot make it more than a reach.
  if (academic === 'BELOW' && (band === 'STRONG' || band === 'REALISTIC')) band = 'REACH'

  return {
    programId: program.id,
    schoolName: program.schoolName,
    division: program.division,
    state: program.state,
    conference: program.conference,
    compositeZ: Math.round(compositeZ * 100) / 100,
    fitScore: academic === 'BELOW' ? Math.min(fitScoreFor(compositeZ), 40) : fitScoreFor(compositeZ),
    band,
    coverage: Math.round(coverage * 100) / 100,
    academic,
    comparisons,
  }
}

export type MatchQuery = {
  divisions?: ProgramInput['division'][]
  bands?: FitBand[]
  state?: string
  page: number
  pageSize: number
}

export function rankPrograms(
  athlete: AthleteInput,
  programs: readonly ProgramInput[],
  query: MatchQuery,
): { results: MatchResult[]; total: number; page: number; pageCount: number; scoredPrograms: number } {
  const scored = programs.map((p) => scoreProgram(athlete, p)).filter((r): r is MatchResult => r !== null)
  const filtered = scored
    .filter((r) => !query.divisions?.length || query.divisions.includes(r.division))
    .filter((r) => !query.bands?.length || query.bands.includes(r.band))
    .filter((r) => !query.state || r.state === query.state)
    .sort((a, b) => b.fitScore - a.fitScore || b.compositeZ - a.compositeZ || a.schoolName.localeCompare(b.schoolName))

  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize))
  const page = Math.min(Math.max(1, query.page), pageCount)
  const start = (page - 1) * query.pageSize
  return { results: filtered.slice(start, start + query.pageSize), total: filtered.length, page, pageCount, scoredPrograms: scored.length }
}
