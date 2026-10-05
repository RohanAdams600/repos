import 'server-only'
import { Prisma, type VerificationRejection } from '@/generated/prisma/client'
import { startOfUtcMonth } from '@/lib/ai/budget'
import { audit } from '@/lib/audit'
import type { SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderLocalizedEmail } from '@/lib/email/localized'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { formatMetric } from '@/lib/metrics/definitions'
import { notify } from '@/lib/notifications/service'
import { enqueueEvidenceCheck } from '@/lib/queue/queues'
import { createSignedUpload, deleteObject, getObjectInfo, readObjectHead, type SignedUpload } from '@/lib/storage/gcs'
import { extensionFor, isAllowedVideoType, sniffVideoContainer } from '@/lib/storage/video-files'
import { isLocale } from '@/i18n/config'
import { metricName } from '@/i18n/messages/domain'
import { translateServerText } from '@/i18n/messages/server-text'
import { textIn, type Text } from '@/i18n/recipient'
import { EVIDENCE_POLICY, REJECTION_LABELS } from '@/lib/verification/policy'

export class VerificationError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'ALREADY_VERIFIED' | 'IN_PROGRESS' | 'LIMIT' | 'INVALID_FILE' | 'NOT_UPLOADED',
    message: string,
  ) {
    super(message)
    this.name = 'VerificationError'
  }
}

/** Step 1: a signed upload URL for a clip showing one measurement. Resubmitting after a rejection is allowed. */
export async function createEvidenceUpload(
  user: SessionUser,
  input: { metricId: string; contentType: string; sizeBytes: number },
  now: Date = new Date(),
): Promise<{ upload: SignedUpload }> {
  if (!isAllowedVideoType(input.contentType)) throw new VerificationError('INVALID_FILE', 'Upload an MP4 or MOV video.')
  if (input.sizeBytes > EVIDENCE_POLICY.maxBytes) throw new VerificationError('INVALID_FILE', 'Evidence clips must be 60 MB or smaller.')

  const metric = await db.metric.findFirst({
    where: { id: input.metricId, athleteId: user.id },
    select: { id: true, verified: true, verification: { select: { status: true, objectKey: true } } },
  })
  if (!metric) throw new VerificationError('NOT_FOUND', 'Measurement not found.')
  if (metric.verified) throw new VerificationError('ALREADY_VERIFIED', 'This measurement is already verified.')
  const status = metric.verification?.status
  if (status === 'CHECKING' || status === 'IN_REVIEW') throw new VerificationError('IN_PROGRESS', 'This measurement is already being reviewed.')

  const used = await db.metricVerification.count({ where: { athleteId: user.id, createdAt: { gte: startOfUtcMonth(now) }, status: { not: 'AWAITING_UPLOAD' } } })
  if (used >= EVIDENCE_POLICY.monthlyRequests) {
    throw new VerificationError('LIMIT', `You can submit ${EVIDENCE_POLICY.monthlyRequests} measurements for verification each month.`)
  }

  // Server-generated key under the athlete's prefix, so account deletion removes it with their videos.
  const objectKey = `videos/${user.id}/evidence/${metric.id}-${crypto.randomUUID()}.${extensionFor(input.contentType)}`
  if (metric.verification?.objectKey) await deleteObject(metric.verification.objectKey).catch(() => undefined)
  const data = {
    athleteId: user.id,
    status: 'AWAITING_UPLOAD' as const,
    objectKey,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sha256: null,
    durationMs: null,
    recordedAt: null,
    rejectionReason: null,
    reviewerNote: null,
    reviewedById: null,
    reviewedAt: null,
    videoDeletedAt: null,
    createdAt: now,
  }
  await db.metricVerification.upsert({ where: { metricId: metric.id }, create: { metricId: metric.id, ...data }, update: { ...data, checks: Prisma.DbNull } })
  return { upload: await createSignedUpload(objectKey, input.contentType, input.sizeBytes) }
}

/** Step 2: confirm the object landed and is a real video, then queue the automated checks. */
export async function completeEvidenceUpload(user: SessionUser, metricId: string): Promise<'CHECKING'> {
  const row = await db.metricVerification.findFirst({ where: { metricId, athleteId: user.id }, select: { status: true, objectKey: true, sizeBytes: true } })
  if (!row?.objectKey) throw new VerificationError('NOT_FOUND', 'Upload not found.')
  if (row.status !== 'AWAITING_UPLOAD') return 'CHECKING'
  const info = await getObjectInfo(row.objectKey)
  if (!info.exists) throw new VerificationError('NOT_UPLOADED', 'The upload has not finished yet.')
  if (info.sizeBytes > Math.min(row.sizeBytes, EVIDENCE_POLICY.maxBytes) || !sniffVideoContainer(await readObjectHead(row.objectKey))) {
    await deleteObject(row.objectKey)
    await db.metricVerification.delete({ where: { metricId } })
    throw new VerificationError('INVALID_FILE', 'That file is not a valid MP4 or MOV video.')
  }
  await db.metricVerification.update({ where: { metricId }, data: { status: 'CHECKING', sizeBytes: info.sizeBytes } })
  await audit('verification.requested', { actorId: user.id, targetType: 'metric', targetId: metricId })
  try {
    await enqueueEvidenceCheck(metricId)
  } catch (error) {
    // The sweep re-enqueues submissions stuck in CHECKING.
    logger.error({ metricId, ...errorFields(error) }, 'evidence enqueue failed; sweep will retry')
  }
  return 'CHECKING'
}

async function emailAthlete(athleteId: string, subject: Text, paragraphs: Text[], key: string) {
  const user = await db.user.findUnique({ where: { id: athleteId }, select: { email: true, locale: true } })
  if (!user) return
  const locale = isLocale(user.locale) ? user.locale : 'en'
  const { text, html } = renderLocalizedEmail({ subject, paragraphs, action: { label: { en: 'Open your measurements', es: 'Abrir tus mediciones' }, url: `${env().APP_URL}/dashboard/metrics` } }, locale)
  try {
    await sendEmail({ to: user.email, subject: textIn(subject, locale), text, html, idempotencyKey: key })
  } catch (error) {
    logger.error(errorFields(error), 'verification email failed')
  }
}

/** Reviewer decision. Only IN_REVIEW submissions can be decided, so a double click cannot flip a decision. */
export async function decideEvidence(
  reviewerId: string,
  metricId: string,
  decision: { approve: true } | { approve: false; reason: VerificationRejection; note?: string },
  now: Date = new Date(),
): Promise<boolean> {
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.metricVerification.updateMany({
      where: { metricId, status: 'IN_REVIEW' },
      data: decision.approve
        ? { status: 'VERIFIED', reviewedById: reviewerId, reviewedAt: now, rejectionReason: null, reviewerNote: null }
        : { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: now, rejectionReason: decision.reason, reviewerNote: decision.note?.slice(0, 500) ?? null },
    })
    if (result.count === 0) return null
    const metric = await tx.metric.update({
      where: { id: metricId },
      data: decision.approve ? { verified: true } : { verified: false },
      select: { athleteId: true, metricType: true, value: true, date: true, videoUrl: true },
    })
    if (decision.approve) {
      const evidence = await tx.metricVerification.findUniqueOrThrow({ where: { metricId }, select: { objectKey: true } })
      // Metric.video_url (from the brief) records the evidence clip behind a verified value.
      await tx.metric.update({ where: { id: metricId }, data: { videoUrl: evidence.objectKey } })
    }
    return metric
  })
  if (!updated) return false

  const name = metricName(updated.metricType)
  const value = formatMetric(updated.metricType, Number(updated.value))
  const label = { en: `${name.en} ${value}`, es: `${name.es} ${value}` }
  if (decision.approve) {
    await audit('verification.approved', { actorId: reviewerId, targetType: 'metric', targetId: metricId })
    await notify({
      userId: updated.athleteId,
      kind: 'METRIC_VERIFIED',
      title: { en: `${label.en} is verified`, es: `${label.es}: verificado` },
      body: {
        en: 'A reviewer confirmed this measurement from your video. It now shows a Verified badge on your profile and PDF.',
        es: 'Un revisor confirmó esta medición con tu video. Ahora muestra una insignia de Verificado en tu perfil y en tu PDF.',
      },
      href: '/dashboard/metrics',
      dedupeKey: `verified:${metricId}:${now.getTime()}`,
    })
    await emailAthlete(
      updated.athleteId,
      { en: `Your ${name.en.toLowerCase()} is verified`, es: `Se verificó tu medición de ${name.es.toLowerCase()}` },
      [
        {
          en: `A KineticScout reviewer confirmed your ${label.en} from the video you sent. It now shows a Verified badge on your profile and PDF.`,
          es: `Un revisor de KineticScout confirmó tu ${label.es} con el video que enviaste. Ahora muestra una insignia de Verificado en tu perfil y en tu PDF.`,
        },
      ],
      `verified-${metricId}-${now.getTime()}`,
    )
  } else {
    const reason = { en: REJECTION_LABELS[decision.reason], es: translateServerText(REJECTION_LABELS[decision.reason], 'es') }
    const note = decision.note
    await audit('verification.rejected', { actorId: reviewerId, targetType: 'metric', targetId: metricId, metadata: { reason: decision.reason } })
    await notify({
      userId: updated.athleteId,
      kind: 'METRIC_REJECTED',
      title: { en: `${label.en} could not be verified`, es: `No se pudo verificar: ${label.es}` },
      body: { en: `${reason.en}${note ? ` Reviewer note: ${note}` : ''} You can send a new clip.`, es: `${reason.es}${note ? ` Nota del revisor: ${note}` : ''} Puedes enviar un clip nuevo.` },
      href: '/dashboard/metrics',
      dedupeKey: `rejected:${metricId}:${now.getTime()}`,
    })
    await emailAthlete(
      updated.athleteId,
      { en: `We could not verify your ${name.en.toLowerCase()}`, es: `No pudimos verificar tu medición de ${name.es.toLowerCase()}` },
      [
        { en: `We could not verify your ${label.en}. ${reason.en}`, es: `No pudimos verificar tu ${label.es}. ${reason.es}` },
        ...(note ? [{ en: `Reviewer note: ${note}`, es: `Nota del revisor: ${note}` }] : []),
        {
          en: 'You can send a new clip from your measurements page. The measurement stays on your profile as self-reported.',
          es: 'Puedes enviar un clip nuevo desde tu página de mediciones. La medición sigue en tu perfil como registrada por ti.',
        },
      ],
      `rejected-${metricId}-${now.getTime()}`,
    )
  }
  return true
}

/** Sweep: removes evidence videos after the retention period and abandoned uploads after a day. */
export async function purgeEvidence(now: Date = new Date()): Promise<{ purged: number; abandoned: number }> {
  const cutoff = new Date(now.getTime() - EVIDENCE_POLICY.retentionDaysAfterDecision * 86_400_000)
  const decided = await db.metricVerification.findMany({
    where: { reviewedAt: { lt: cutoff }, objectKey: { not: null }, videoDeletedAt: null },
    select: { metricId: true, objectKey: true },
    take: 200,
  })
  for (const row of decided) {
    try {
      await deleteObject(row.objectKey!)
      await db.$transaction([
        db.metricVerification.update({ where: { metricId: row.metricId }, data: { objectKey: null, videoDeletedAt: now } }),
        db.metric.updateMany({ where: { id: row.metricId, videoUrl: row.objectKey }, data: { videoUrl: null } }),
      ])
    } catch (error) {
      logger.warn({ metricId: row.metricId, ...errorFields(error) }, 'evidence purge failed')
    }
  }
  const stale = await db.metricVerification.findMany({
    where: { status: 'AWAITING_UPLOAD', createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
    select: { metricId: true, objectKey: true },
    take: 200,
  })
  for (const row of stale) {
    if (row.objectKey) await deleteObject(row.objectKey).catch(() => undefined)
    await db.metricVerification.delete({ where: { metricId: row.metricId } }).catch(() => undefined)
  }
  return { purged: decided.length, abandoned: stale.length }
}
