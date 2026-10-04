import 'server-only'
import { cached, invalidate } from '@/lib/cache'
import { db } from '@/lib/db'
import type { BuildInput } from '@/lib/insights/build-cohort'
import { describeNormBand, nationalStanding, selectNormRow, type NormBand } from '@/lib/insights/norms'
import { METRIC_TYPES, type MetricType } from '@/lib/metrics/definitions'
import type { Quantiles } from '@/lib/metrics/percentile'

/** Shown next to every national figure, so the athlete can see whose numbers they are compared with. */
export type NormSource = { datasetId: string; name: string; publisher: string; edition: string; population: string; sourceUrl: string }

export type NationalResult = { percentile: number; sampleSize: number; bandLabel: string; source: NormSource }

type ActiveRow = NormBand & { datasetId: string; sampleSize: number; quantiles: Quantiles }
type ActiveNorms = { datasets: NormSource[]; rows: ActiveRow[] }

const CACHE_SECONDS = 600

function dayKey(today: Date): string {
  return today.toISOString().slice(0, 10)
}

function cacheKey(metricType: MetricType, today: Date): string {
  return `norms:active:${metricType}:${dayKey(today)}`
}

/**
 * Rows for one metric from ACTIVE datasets whose licence has not expired, with datasets ordered
 * newest activation first (that order decides which edition wins when several cover an athlete).
 * The day is part of the cache key, so a licence that expires stops being used the next day.
 */
async function activeNorms(metricType: MetricType, today: Date): Promise<ActiveNorms> {
  return cached(cacheKey(metricType, today), CACHE_SECONDS, async () => {
    const startOfDay = new Date(`${dayKey(today)}T00:00:00.000Z`)
    const datasets = await db.normDataset.findMany({
      where: { status: 'ACTIVE', OR: [{ licenceExpiresAt: null }, { licenceExpiresAt: { gte: startOfDay } }], rows: { some: { metricType } } },
      orderBy: { activatedAt: 'desc' },
      select: { id: true, name: true, publisher: true, edition: true, population: true, sourceUrl: true },
    })
    if (datasets.length === 0) return { datasets: [], rows: [] }
    const rows = await db.normRow.findMany({
      where: { metricType, datasetId: { in: datasets.map((d) => d.id) } },
      select: { datasetId: true, metricType: true, ageMin: true, ageMax: true, heightMin: true, heightMax: true, weightMin: true, weightMax: true, sampleSize: true, p10: true, p25: true, p50: true, p75: true, p90: true },
    })
    return {
      datasets: datasets.map((d) => ({ datasetId: d.id, name: d.name, publisher: d.publisher, edition: d.edition, population: d.population, sourceUrl: d.sourceUrl })),
      rows: rows.map((r) => ({
        datasetId: r.datasetId,
        metricType: r.metricType as MetricType,
        age: r.ageMin !== null && r.ageMax !== null ? { min: r.ageMin, max: r.ageMax } : null,
        height: r.heightMin !== null && r.heightMax !== null ? { min: r.heightMin, max: r.heightMax } : null,
        weight: r.weightMin !== null && r.weightMax !== null ? { min: r.weightMin, max: r.weightMax } : null,
        sampleSize: r.sampleSize,
        quantiles: { p10: Number(r.p10), p25: Number(r.p25), p50: Number(r.p50), p75: Number(r.p75), p90: Number(r.p90) },
      })),
    }
  })
}

/** The covering band from the most recently activated dataset that has one. */
async function coveringRow(input: BuildInput & { metricType: MetricType }, today: Date): Promise<{ row: ActiveRow; source: NormSource } | null> {
  const { datasets, rows } = await activeNorms(input.metricType, today)
  for (const source of datasets) {
    const row = selectNormRow(
      rows.filter((r) => r.datasetId === source.datasetId),
      input,
    )
    if (row) return { row, source }
  }
  return null
}

export async function nationalPercentile(input: BuildInput & { metricType: MetricType; value: number }, today: Date = new Date()): Promise<NationalResult | null> {
  const found = await coveringRow(input, today)
  if (!found) return null
  return {
    percentile: nationalStanding(input.metricType, input.value, found.row.quantiles),
    sampleSize: found.row.sampleSize,
    bandLabel: describeNormBand(found.row),
    source: found.source,
  }
}

/** National quantiles for the athlete's build, per metric that a national table covers. */
export async function nationalQuantiles(input: BuildInput, metricTypes: readonly MetricType[], today: Date = new Date()): Promise<Partial<Record<MetricType, { quantiles: Quantiles; source: NormSource }>>> {
  const out: Partial<Record<MetricType, { quantiles: Quantiles; source: NormSource }>> = {}
  await Promise.all(
    metricTypes.map(async (metricType) => {
      const found = await coveringRow({ ...input, metricType }, today)
      if (found) out[metricType] = { quantiles: found.row.quantiles, source: found.source }
    }),
  )
  return out
}

/** Called after a dataset is activated or retired so results change at once, not after the cache expires. */
export async function invalidateNormCache(today: Date = new Date()): Promise<void> {
  await Promise.all(METRIC_TYPES.map((t) => invalidate(cacheKey(t, today))))
}
