import { processDueDeletions } from '@/lib/account/deletion'
import { expireContactRequests } from '@/lib/coach/contact'
import { expireTeamRequests } from '@/lib/teams/service'
import { purgeClosedThreads } from '@/lib/messaging/service'
import { purgeOldEvents } from '@/lib/events/service'
import { archiveFinishedPlans } from '@/lib/training/service'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'
import { enqueueEvidenceCheck, enqueueProgramChange, enqueueVideoAnalysis } from '@/lib/queue/queues'
import { purgeEvidence } from '@/lib/verification/service'
import { deleteObject } from '@/lib/storage/gcs'
import { workerEnv } from '@worker/env'

/**
 * Reconciliation sweep (every 10 minutes):
 *   - re-enqueues analyses stuck in QUEUED (e.g. the web app's enqueue failed after the DB write);
 *   - expires uploads that were never completed and removes their objects;
 *   - deletes raw videos past the retention window, keeping the derived report;
 *   - purges security logs and billing bookkeeping rows past their retention period;
 *   - carries out account deletions whose 7-day cancellation window has ended;
 *   - re-enqueues stuck verification checks and deletes evidence clips past their retention;
 *   - re-enqueues program changes Agent 3 has not processed (an enqueue that failed at write time);
 *   - expires unanswered coach contact requests;
 *   - deletes event attendance a year after the event, and old events;
 *   - archives training plans two weeks after they end.
 * Every step is idempotent, so overlapping sweeps on several replicas are harmless.
 */
export async function sweepStuckWork(
  now: Date = new Date(),
): Promise<{
  requeued: number
  expired: number
  purged: number
  logsPurged: number
  accountsDeleted: number
  deletionFailures: number
  evidenceRequeued: number
  evidencePurged: number
  changesRequeued: number
  contactRequestsExpired: number
  teamRequestsExpired: number
  conversationsPurged: number
  eventsPurged: number
  plansArchived: number
}> {
  const stuck = await db.videoAnalysis.findMany({
    where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    select: { id: true },
    take: 100,
  })
  for (const { id } of stuck) await enqueueVideoAnalysis(id)

  const abandoned = await db.videoAnalysis.findMany({
    where: { status: 'AWAITING_UPLOAD', createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } },
    select: { id: true, objectKey: true },
    take: 200,
  })
  for (const row of abandoned) {
    try {
      await deleteObject(row.objectKey)
      await db.videoAnalysis.update({ where: { id: row.id }, data: { status: 'FAILED', errorCode: 'UPLOAD_EXPIRED' } })
    } catch (error) {
      logger.warn({ analysisId: row.id, ...errorFields(error) }, 'failed to expire abandoned upload')
    }
  }

  const cutoff = new Date(now.getTime() - workerEnv().VIDEO_RETENTION_DAYS * 24 * 3600_000)
  const expiredVideos = await db.videoAnalysis.findMany({
    where: { createdAt: { lt: cutoff }, errorCode: { not: 'VIDEO_PURGED' }, status: { in: ['COMPLETE', 'FAILED'] } },
    select: { id: true, objectKey: true },
    take: 200,
  })
  for (const row of expiredVideos) {
    try {
      await deleteObject(row.objectKey)
      await db.videoAnalysis.update({ where: { id: row.id }, data: { errorCode: 'VIDEO_PURGED' } })
    } catch (error) {
      logger.warn({ analysisId: row.id, ...errorFields(error) }, 'failed to purge expired video')
    }
  }

  // Retention promised in the Privacy Policy: security logs 24 months. Webhook dedupe rows are only
  // needed while Stripe may redeliver (3 days); 90 days leaves room for investigation.
  const day = 24 * 3600_000
  const [logs] = await Promise.all([
    db.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 730 * day) } } }),
    db.stripeEvent.deleteMany({ where: { processedAt: { lt: new Date(now.getTime() - 90 * day) } } }),
    // Contact form messages: 12 months, as stated on the contact page and in the Privacy Policy.
    db.contactMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 365 * day) } } }),
    db.checkoutSession.deleteMany({ where: { status: { not: 'OPEN' }, createdAt: { lt: new Date(now.getTime() - 90 * day) } } }),
  ])

  const deletions = await processDueDeletions(now)

  const stuckEvidence = await db.metricVerification.findMany({
    where: { status: 'CHECKING', updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    select: { metricId: true },
    take: 100,
  })
  for (const { metricId } of stuckEvidence) await enqueueEvidenceCheck(metricId)
  const evidence = await purgeEvidence(now)

  const pendingChanges = await db.programChange.findMany({
    where: { processedAt: null, detectedAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
    select: { id: true },
    take: 100,
  })
  const attemptKey = `sweep-${Math.floor(now.getTime() / 600_000)}`
  for (const { id } of pendingChanges) await enqueueProgramChange(id, attemptKey)

  return {
    requeued: stuck.length,
    expired: abandoned.length,
    purged: expiredVideos.length,
    logsPurged: logs.count,
    accountsDeleted: deletions.deleted,
    deletionFailures: deletions.failed,
    evidenceRequeued: stuckEvidence.length,
    evidencePurged: evidence.purged + evidence.abandoned,
    changesRequeued: pendingChanges.length,
    contactRequestsExpired: await expireContactRequests(now),
    teamRequestsExpired: await expireTeamRequests(now),
    conversationsPurged: await purgeClosedThreads(now),
    eventsPurged: await purgeOldEvents(now),
    plansArchived: await archiveFinishedPlans(now),
  }
}
