import 'server-only'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { parseDateOnly } from '@/lib/auth/age'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import type { BuildInput } from '@/lib/insights/build-cohort'
import { invalidateNormCache } from '@/lib/insights/national'
import { describeNormBand, nationalStanding, parseNormCsv, selectNormRow, type NormIssue } from '@/lib/insights/norms'
import { METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'
import { sanitizeText } from '@/lib/security/sanitize'

/** Dataset details entered with the upload. The licence confirmation mirrors reference clips. */
export const normDatasetMetaSchema = z.object({
  name: z.string().trim().min(3, 'Name the table').max(160),
  publisher: z.string().trim().min(2, 'Who published it?').max(160),
  edition: z.string().trim().min(1, 'Which edition or year?').max(40),
  population: z.string().trim().min(10, 'Describe who was measured, as the publisher does').max(400),
  sourceUrl: z.url({ protocol: /^https$/, error: 'Link to the published source (https)' }).max(512),
  licence: z.string().trim().min(10, 'Summarise the licence terms').max(1000),
  licenceExpiresAt: z.string().trim().max(10).optional().default(''),
  licenceConfirmed: z.literal('on', { error: 'Confirm that the licence allows showing these figures to users' }),
})
export type NormDatasetMeta = z.infer<typeof normDatasetMetaSchema>

export type NormImportResult =
  | { ok: true; datasetId: string; rowCount: number; metrics: MetricType[] }
  | { ok: false; issues: NormIssue[]; fieldErrors?: Partial<Record<string, string>> }

/** Validates the whole table first; nothing is stored unless every row is acceptable. */
export async function importNormDataset(adminId: string, meta: NormDatasetMeta, csv: string): Promise<NormImportResult> {
  const expires = meta.licenceExpiresAt ? parseDateOnly(meta.licenceExpiresAt) : null
  if (meta.licenceExpiresAt && !expires) return { ok: false, issues: [], fieldErrors: { licenceExpiresAt: 'Enter the licence end date as YYYY-MM-DD.' } }
  if (expires && expires.getTime() <= Date.now()) return { ok: false, issues: [], fieldErrors: { licenceExpiresAt: 'That licence has already expired.' } }

  const parsed = parseNormCsv(csv)
  if (parsed.issues.length) return { ok: false, issues: parsed.issues }

  try {
    const dataset = await db.$transaction(async (tx) => {
      const created = await tx.normDataset.create({
        data: {
          name: sanitizeText(meta.name),
          publisher: sanitizeText(meta.publisher),
          edition: sanitizeText(meta.edition),
          population: sanitizeText(meta.population),
          sourceUrl: meta.sourceUrl,
          licence: sanitizeText(meta.licence),
          licenceExpiresAt: expires,
          rowCount: parsed.rows.length,
          importedById: adminId,
        },
        select: { id: true },
      })
      await tx.normRow.createMany({
        data: parsed.rows.map((r) => ({
          datasetId: created.id,
          metricType: r.metricType,
          ageMin: r.age?.min ?? null,
          ageMax: r.age?.max ?? null,
          heightMin: r.height?.min ?? null,
          heightMax: r.height?.max ?? null,
          weightMin: r.weight?.min ?? null,
          weightMax: r.weight?.max ?? null,
          sampleSize: r.sampleSize,
          ...r.quantiles,
        })),
      })
      return created
    })
    const metrics = [...new Set(parsed.rows.map((r) => r.metricType))]
    await audit('norms.imported', { actorId: adminId, targetType: 'norm_dataset', targetId: dataset.id, metadata: { rows: parsed.rows.length, metrics } })
    return { ok: true, datasetId: dataset.id, rowCount: parsed.rows.length, metrics }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, issues: [], fieldErrors: { edition: 'A table with this publisher, name and edition already exists. Import a correction as a new edition.' } }
    }
    throw error
  }
}

export class NormAdminError extends Error {}

/** Draft or retired to active. Activation makes this edition win for every band it covers. */
export async function activateNormDataset(adminId: string, datasetId: string, now: Date = new Date()): Promise<void> {
  const dataset = await db.normDataset.findUnique({ where: { id: datasetId }, select: { status: true, licenceExpiresAt: true } })
  if (!dataset) throw new NormAdminError('Dataset not found.')
  if (dataset.licenceExpiresAt && dataset.licenceExpiresAt.getTime() < new Date(now.toISOString().slice(0, 10)).getTime()) throw new NormAdminError('The licence for this table has expired.')
  const result = await db.normDataset.updateMany({ where: { id: datasetId, status: { in: ['DRAFT', 'RETIRED'] } }, data: { status: 'ACTIVE', activatedAt: now, retiredAt: null } })
  if (result.count === 0) throw new NormAdminError('This table is already active.')
  await invalidateNormCache(now)
  await audit('norms.activated', { actorId: adminId, targetType: 'norm_dataset', targetId: datasetId })
}

export async function retireNormDataset(adminId: string, datasetId: string, now: Date = new Date()): Promise<void> {
  const result = await db.normDataset.updateMany({ where: { id: datasetId, status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: now } })
  if (result.count === 0) throw new NormAdminError('Only an active table can be retired.')
  await invalidateNormCache(now)
  await audit('norms.retired', { actorId: adminId, targetType: 'norm_dataset', targetId: datasetId })
}

/** Only drafts can be deleted; a table that was ever shown to users stays on record as retired. */
export async function deleteDraftNormDataset(adminId: string, datasetId: string): Promise<void> {
  const result = await db.normDataset.deleteMany({ where: { id: datasetId, status: 'DRAFT' } })
  if (result.count === 0) throw new NormAdminError('Only a draft can be deleted. Retire an active table instead.')
  await audit('norms.deleted', { actorId: adminId, targetType: 'norm_dataset', targetId: datasetId })
}

export async function listNormDatasets() {
  const [datasets, coverage] = await Promise.all([
    db.normDataset.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: { id: true, name: true, publisher: true, edition: true, population: true, sourceUrl: true, licence: true, licenceExpiresAt: true, status: true, rowCount: true, activatedAt: true, retiredAt: true, createdAt: true },
    }),
    db.normRow.groupBy({ by: ['datasetId', 'metricType'], _count: { _all: true } }),
  ])
  return datasets.map((d) => ({
    ...d,
    metrics: coverage.filter((c) => c.datasetId === d.id).map((c) => ({ metricType: c.metricType as MetricType, label: METRIC_DEFINITIONS[c.metricType as MetricType].label, rows: c._count._all })),
  }))
}

/** What this table (in any status) would say for a given athlete, so staff can check it before activating. */
export async function previewNorm(datasetId: string, input: BuildInput & { metricType: MetricType; value: number }) {
  const rows = await db.normRow.findMany({ where: { datasetId, metricType: input.metricType } })
  const bands = rows.map((r) => ({
    metricType: r.metricType as MetricType,
    age: r.ageMin !== null && r.ageMax !== null ? { min: r.ageMin, max: r.ageMax } : null,
    height: r.heightMin !== null && r.heightMax !== null ? { min: r.heightMin, max: r.heightMax } : null,
    weight: r.weightMin !== null && r.weightMax !== null ? { min: r.weightMin, max: r.weightMax } : null,
    sampleSize: r.sampleSize,
    quantiles: { p10: Number(r.p10), p25: Number(r.p25), p50: Number(r.p50), p75: Number(r.p75), p90: Number(r.p90) },
  }))
  const row = selectNormRow(bands, input)
  if (!row) return { covered: false as const }
  return { covered: true as const, percentile: nationalStanding(input.metricType, input.value, row.quantiles), bandLabel: describeNormBand(row), sampleSize: row.sampleSize, quantiles: row.quantiles }
}
