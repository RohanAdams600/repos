import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'
import { enqueueVideoAnalysis } from '@/lib/queue/queues'
import { deleteObject } from '@/lib/storage/gcs'
import { workerEnv } from '@worker/env'

/**
 * Reconciliation sweep (every 10 minutes):
 *   - re-enqueues analyses stuck in QUEUED (e.g. the web app's enqueue failed after the DB write);
 *   - expires uploads that were never completed and removes their objects;
 *   - deletes raw videos past the retention window, keeping the derived report;
 *   - purges security logs and billing bookkeeping rows past their retention period.
 * Every step is idempotent, so overlapping sweeps on several replicas are harmless.
 */
export async function sweepStuckWork(now: Date = new Date()): Promise<{ requeued: number; expired: number; purged: number; logsPurged: number }> {
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
    db.checkoutSession.deleteMany({ where: { status: { not: 'OPEN' }, createdAt: { lt: new Date(now.getTime() - 90 * day) } } }),
  ])

  return { requeued: stuck.length, expired: abandoned.length, purged: expiredVideos.length, logsPurged: logs.count }
}
