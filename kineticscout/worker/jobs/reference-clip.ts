import { UnrecoverableError, type Job } from 'bullmq'
import type { Prisma } from '@/generated/prisma/client'
import { releaseAiSpend, reserveAiSpend, settleAiSpend, usdToMicros } from '@/lib/ai/budget'
import { encodePoseTrack } from '@/lib/biomechanics/codec'
import { ALGORITHM_VERSION, analyzeKinematicSequence } from '@/lib/biomechanics/kinematics'
import { PoseQualityError } from '@/lib/biomechanics/types'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import type { ReferenceClipJob } from '@/lib/queue/queues'
import { gcsUri } from '@/lib/storage/gcs'
import { VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'
import type { PoseEstimator } from '@worker/pose/google-video-intelligence'

/**
 * Runs a licensed reference clip through the same pose estimation and kinematic analysis as athlete
 * videos, so both sides of a comparison are measured the same way. Clips without a detectable foot
 * strike cannot be synced and are marked FAILED.
 */
export function createReferenceClipProcessor(createEstimator: () => PoseEstimator) {
  let estimator: PoseEstimator | undefined
  return async function processReferenceClip(job: Job<ReferenceClipJob>): Promise<{ status: string }> {
    const clip = await db.referenceClip.findUnique({ where: { id: job.data.clipId }, select: { id: true, status: true, objectKey: true, motionType: true, handedness: true, durationMs: true, widthPx: true, heightPx: true } })
    if (!clip) throw new UnrecoverableError('clip not found')
    if (clip.status !== 'PROCESSING') return { status: clip.status }

    const fail = async (code: string) => {
      await db.referenceClip.update({ where: { id: clip.id }, data: { status: 'FAILED', errorCode: code, active: false } })
      throw new UnrecoverableError(code)
    }
    const minutes = Math.max(1, Math.ceil((clip.durationMs ?? VIDEO_UPLOAD_POLICY.maxDurationMs) / 60_000))
    let reservation
    try {
      reservation = await reserveAiSpend({ feature: 'VIDEO_ANALYSIS', model: 'video-intelligence-person-detection', userId: null, estimatedCostMicros: usdToMicros(minutes * env().VIDEO_ANALYSIS_USD_PER_MINUTE) })
    } catch {
      return fail('BUDGET_EXHAUSTED')
    }
    try {
      estimator ??= createEstimator()
      const aspectRatio = clip.widthPx && clip.heightPx ? clip.widthPx / clip.heightPx : 16 / 9
      const track = await estimator.estimate({ gcsUri: gcsUri(clip.objectKey), aspectRatio })
      await settleAiSpend(reservation, { inputTokens: 0, outputTokens: 0, costMicros: usdToMicros(minutes * env().VIDEO_ANALYSIS_USD_PER_MINUTE) })
      const report = analyzeKinematicSequence({ track, motionType: clip.motionType, handedness: clip.handedness })
      if (report.footStrikeTime === null) return fail('FOOT_STRIKE_NOT_DETECTED')
      await db.referenceClip.update({
        where: { id: clip.id },
        data: { status: 'READY', report: report as unknown as Prisma.InputJsonValue, poseData: encodePoseTrack(track) as unknown as Prisma.InputJsonValue, errorCode: null },
      })
      logger.info({ clipId: clip.id, algorithm: ALGORITHM_VERSION }, 'reference clip ready')
      return { status: 'READY' }
    } catch (error) {
      if (error instanceof UnrecoverableError) throw error
      if (error instanceof PoseQualityError) return fail('POSE_INCOMPLETE')
      await releaseAiSpend(reservation).catch(() => undefined)
      logger.error({ clipId: clip.id, ...errorFields(error) }, 'reference clip processing failed')
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) return fail('PROCESSING_ERROR')
      throw error
    }
  }
}
