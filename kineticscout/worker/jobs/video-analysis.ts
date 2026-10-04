import { UnrecoverableError, type Job } from 'bullmq'
import type { Prisma } from '@/generated/prisma/client'
import { releaseAiSpend, reserveAiSpend, settleAiSpend, usdToMicros } from '@/lib/ai/budget'
import { encodePoseTrack } from '@/lib/biomechanics/codec'
import { estimateProjectile, type ObjectTrackCandidate } from '@/lib/biomechanics/projectile'
import { ALGORITHM_VERSION, analyzeKinematicSequence } from '@/lib/biomechanics/kinematics'
import { PoseQualityError } from '@/lib/biomechanics/types'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import type { VideoAnalysisJob } from '@/lib/queue/queues'
import { deleteObject, gcsUri, getObjectInfo, readObjectHead } from '@/lib/storage/gcs'
import { sniffVideoContainer, VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'
import { NoPersonDetectedError, type PoseEstimator } from '@worker/pose/google-video-intelligence'

/** User-facing failure codes; the dashboard maps each to plain guidance. */
export type AnalysisFailure =
  | 'FILE_MISSING'
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'NO_PERSON'
  | 'POSE_INCOMPLETE'
  | 'BUDGET_EXHAUSTED'
  | 'PROCESSING_ERROR'

async function fail(analysisId: string, code: AnalysisFailure): Promise<never> {
  await db.videoAnalysis.update({ where: { id: analysisId }, data: { status: 'FAILED', errorCode: code, completedAt: new Date() } })
  throw new UnrecoverableError(code)
}

/** The estimator is created on first use so the worker can boot (and run agents) before storage is configured. */
export function createVideoAnalysisProcessor(createEstimator: () => PoseEstimator) {
  let estimator: PoseEstimator | undefined
  return async function processVideoAnalysis(job: Job<VideoAnalysisJob>): Promise<{ status: 'COMPLETE' }> {
    const { analysisId } = job.data
    const analysis = await db.videoAnalysis.findUnique({
      where: { id: analysisId },
      select: { id: true, athleteId: true, status: true, objectKey: true, motionType: true, handedness: true, durationMs: true, widthPx: true, heightPx: true, trackObject: true, athlete: { select: { heightInches: true } } },
    })
    if (!analysis) throw new UnrecoverableError('analysis not found')
    if (analysis.status === 'COMPLETE') return { status: 'COMPLETE' }
    if (analysis.status !== 'QUEUED' && analysis.status !== 'PROCESSING') throw new UnrecoverableError(`unexpected status ${analysis.status}`)

    await db.videoAnalysis.update({ where: { id: analysisId }, data: { status: 'PROCESSING', startedAt: new Date() } })

    // Re-verify the stored object: size cap and container magic bytes, independent of the upload step.
    const info = await getObjectInfo(analysis.objectKey)
    if (!info.exists) return fail(analysisId, 'FILE_MISSING')
    if (info.sizeBytes > VIDEO_UPLOAD_POLICY.maxBytes) {
      await deleteObject(analysis.objectKey)
      return fail(analysisId, 'FILE_TOO_LARGE')
    }
    if (!sniffVideoContainer(await readObjectHead(analysis.objectKey))) {
      await deleteObject(analysis.objectKey)
      return fail(analysisId, 'UNSUPPORTED_FILE')
    }

    // Video Intelligence bills per started minute and per feature. Reserve before calling.
    const minutes = Math.max(1, Math.ceil((analysis.durationMs ?? VIDEO_UPLOAD_POLICY.maxDurationMs) / 60_000))
    const usdPerMinute = env().VIDEO_ANALYSIS_USD_PER_MINUTE + (analysis.trackObject ? env().OBJECT_TRACKING_USD_PER_MINUTE : 0)
    let reservation
    try {
      reservation = await reserveAiSpend({
        feature: 'VIDEO_ANALYSIS',
        model: 'video-intelligence-person-detection',
        userId: analysis.athleteId,
        estimatedCostMicros: usdToMicros(minutes * usdPerMinute),
      })
    } catch {
      return fail(analysisId, 'BUDGET_EXHAUSTED')
    }

    try {
      const aspectRatio = analysis.widthPx && analysis.heightPx ? analysis.widthPx / analysis.heightPx : 16 / 9
      estimator ??= createEstimator()
      const input = { gcsUri: gcsUri(analysis.objectKey), aspectRatio }
      let track
      let objects: ObjectTrackCandidate[] | null = null
      if (analysis.trackObject && estimator.estimateWithObjects) {
        ;({ track, objects } = await estimator.estimateWithObjects(input))
      } else {
        track = await estimator.estimate(input)
      }
      await settleAiSpend(reservation, { inputTokens: 0, outputTokens: 0, costMicros: usdToMicros(minutes * usdPerMinute) })

      const report = analyzeKinematicSequence({ track, motionType: analysis.motionType, handedness: analysis.handedness })
      // Beta tracking never fails the analysis: any problem is recorded as warnings on the estimate.
      const releaseTime = report.peaks.find((p) => p.segment === 'hand')?.time ?? null
      const projectile =
        objects && releaseTime !== null
          ? estimateProjectile({ candidates: objects, motion: analysis.motionType, releaseTime, pose: track, athleteHeightInches: analysis.athlete.heightInches })
          : null
      await db.videoAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'COMPLETE',
          report: report as unknown as Prisma.InputJsonValue,
          poseData: encodePoseTrack(track) as unknown as Prisma.InputJsonValue,
          ...(projectile ? { projectile: projectile as unknown as Prisma.InputJsonValue } : {}),
          algorithm: ALGORITHM_VERSION,
          errorCode: null,
          completedAt: new Date(),
        },
      })
      return { status: 'COMPLETE' }
    } catch (error) {
      if (error instanceof NoPersonDetectedError) return fail(analysisId, 'NO_PERSON')
      if (error instanceof PoseQualityError) return fail(analysisId, 'POSE_INCOMPLETE')
      if (error instanceof UnrecoverableError) throw error
      await releaseAiSpend(reservation).catch(() => undefined)
      logger.error({ analysisId, attempt: job.attemptsMade + 1, ...errorFields(error) }, 'video analysis attempt failed')
      // Final attempt: record a failure the athlete can see; otherwise let BullMQ retry with backoff.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) return fail(analysisId, 'PROCESSING_ERROR')
      await db.videoAnalysis.update({ where: { id: analysisId }, data: { status: 'QUEUED' } })
      throw error
    }
  }
}
