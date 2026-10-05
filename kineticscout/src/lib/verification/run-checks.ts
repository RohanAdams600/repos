import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { formatMetric } from '@/lib/metrics/definitions'
import { notify } from '@/lib/notifications/service'
import { deleteObject, getObjectInfo, objectSha256, readObjectRange } from '@/lib/storage/gcs'
import { sniffVideoContainer } from '@/lib/storage/video-files'
import { evaluateEvidence } from '@/lib/verification/checks'
import { findMoovBox, parseMovieHeader } from '@/lib/verification/mp4'
import { metricName } from '@/i18n/messages/domain'
import { translateServerText } from '@/i18n/messages/server-text'
import { REJECTION_LABELS } from '@/lib/verification/policy'

export type EvidenceStorage = {
  info: (key: string) => Promise<{ exists: boolean; sizeBytes: number }>
  readRange: (key: string, start: number, length: number) => Promise<Uint8Array>
  sha256: (key: string) => Promise<string>
  remove: (key: string) => Promise<void>
}

export const gcsEvidenceStorage: EvidenceStorage = {
  info: getObjectInfo,
  readRange: readObjectRange,
  sha256: objectSha256,
  remove: deleteObject,
}

const MAX_MOOV_BYTES = 8 * 1024 * 1024

/** Runs the automated checks for one submission and moves it to review (or rejects it). Idempotent. */
export async function runEvidenceChecks(metricId: string, storage: EvidenceStorage = gcsEvidenceStorage, now: Date = new Date()): Promise<'IN_REVIEW' | 'REJECTED' | 'SKIPPED'> {
  const row = await db.metricVerification.findUnique({
    where: { metricId },
    select: { metricId: true, athleteId: true, status: true, objectKey: true, metric: { select: { date: true, metricType: true, value: true } } },
  })
  if (!row || row.status !== 'CHECKING' || !row.objectKey) return 'SKIPPED'
  const key = row.objectKey

  const info = await storage.info(key)
  let container: 'mp4' | 'quicktime' | null = null
  let header: ReturnType<typeof parseMovieHeader> = null
  let sha256: string | null = null
  if (info.exists) {
    container = sniffVideoContainer(await storage.readRange(key, 0, 64))
    if (container) {
      const moov = await findMoovBox((start, length) => storage.readRange(key, start, length), info.sizeBytes)
      if (moov && moov.size <= MAX_MOOV_BYTES) header = parseMovieHeader(await storage.readRange(key, moov.start + moov.headerSize, moov.size - moov.headerSize), now)
      sha256 = await storage.sha256(key)
    }
  }

  const [otherAthlete, otherMetric] = sha256
    ? await Promise.all([
        db.metricVerification.count({ where: { sha256, athleteId: { not: row.athleteId } } }),
        db.metricVerification.count({ where: { sha256, athleteId: row.athleteId, metricId: { not: metricId } } }),
      ])
    : [0, 0]

  const outcome = evaluateEvidence({
    container,
    sizeBytes: info.sizeBytes,
    durationMs: header?.durationMs ?? null,
    recordedAt: header?.createdAt ?? null,
    metricDate: row.metric.date,
    usedByOtherAthlete: otherAthlete > 0,
    usedForOtherMetric: otherMetric > 0,
  })
  const common = { sha256, durationMs: header?.durationMs ?? null, recordedAt: header?.createdAt ?? null, checks: outcome.checks as unknown as Prisma.InputJsonValue }

  if (outcome.decision === 'review') {
    const moved = await db.metricVerification.updateMany({ where: { metricId, status: 'CHECKING' }, data: { ...common, status: 'IN_REVIEW' } })
    return moved.count ? 'IN_REVIEW' : 'SKIPPED'
  }

  // Automatic rejection: the file can never be valid evidence, so it is deleted right away.
  if (info.exists) await storage.remove(key)
  const moved = await db.metricVerification.updateMany({
    where: { metricId, status: 'CHECKING' },
    data: { ...common, status: 'REJECTED', rejectionReason: outcome.reason, reviewedAt: now, objectKey: null, videoDeletedAt: now },
  })
  if (moved.count) {
    const name = metricName(row.metric.metricType)
    const value = formatMetric(row.metric.metricType, Number(row.metric.value))
    const reason = REJECTION_LABELS[outcome.reason]
    await notify({
      userId: row.athleteId,
      kind: 'METRIC_REJECTED',
      title: { en: `${name.en} ${value} could not be verified`, es: `No se pudo verificar: ${name.es} ${value}` },
      body: { en: `${reason} You can send a different clip.`, es: `${translateServerText(reason, 'es')} Puedes enviar otro clip.` },
      href: '/dashboard/metrics',
      dedupeKey: `auto-rejected:${metricId}:${now.getTime()}`,
    })
  }
  return moved.count ? 'REJECTED' : 'SKIPPED'
}
