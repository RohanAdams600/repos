import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usdToMicros } from '@/lib/ai/budget'
import type { ObjectTrackCandidate } from '@/lib/biomechanics/projectile'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import type { VideoAnalysisJob } from '@/lib/queue/queues'
import { createVideoAnalysisProcessor } from '@worker/jobs/video-analysis'
import type { PoseEstimator } from '@worker/pose/google-video-intelligence'
import { createAthlete, resetDb } from '../helpers/db'
import { syntheticMp4 } from '../helpers/mp4'
import { syntheticSwing } from '../helpers/synthetic-pose'

// Storage is the only external dependency the job touches before the estimator.
vi.mock('@/lib/storage/gcs', () => ({
  gcsUri: (key: string) => `gs://test-bucket/${key}`,
  getObjectInfo: async () => ({ exists: true, sizeBytes: 50_000, contentType: 'video/mp4' }),
  readObjectHead: async () => syntheticMp4().slice(0, 64),
  deleteObject: async () => undefined,
}))

beforeEach(resetDb)

const swing = syntheticSwing({ pelvisPeak: 0.4, torsoPeak: 0.44, armPeak: 0.48, handPeak: 0.52, footStrike: 0.38 })
/** A ball leaving the hitter after the hand-speed peak, moving right across the frame. */
const ball: ObjectTrackCandidate = {
  label: 'baseball',
  confidence: 0.8,
  observations: Array.from({ length: 8 }, (_, i) => {
    const t = 0.52 + i / 30
    const x = 0.55 + i * 0.02
    return { t, box: { left: x - 0.005, right: x + 0.005, top: 0.495, bottom: 0.505 } }
  }),
}

function fakeEstimator() {
  return {
    estimate: vi.fn(async () => swing),
    estimateWithObjects: vi.fn(async () => ({ track: swing, objects: [ball] })),
  } satisfies PoseEstimator
}

async function queuedAnalysis(trackObject: boolean) {
  const athlete = await createAthlete()
  await db.athleteProfile.update({ where: { userId: athlete.id }, data: { heightInches: 72 } })
  const id = randomUUID()
  await db.videoAnalysis.create({
    data: { id, athleteId: athlete.id, motionType: 'SWING', handedness: 'RIGHT', status: 'QUEUED', objectKey: `videos/${athlete.id}/${id}.mp4`, contentType: 'video/mp4', sizeBytes: 50_000, durationMs: 8_000, widthPx: 1080, heightPx: 1920, trackObject },
  })
  return { id, athleteId: athlete.id }
}

const job = (analysisId: string) => ({ data: { analysisId }, attemptsMade: 0, opts: { attempts: 3 } }) as unknown as Job<VideoAnalysisJob>

describe('video analysis job with puck and ball tracking', () => {
  it('charges and calls object tracking only when the athlete asked for it, and stores the estimate', async () => {
    const estimator = fakeEstimator()
    const process = createVideoAnalysisProcessor(() => estimator)
    const { id, athleteId } = await queuedAnalysis(true)

    await expect(process(job(id))).resolves.toEqual({ status: 'COMPLETE' })
    expect(estimator.estimateWithObjects).toHaveBeenCalledOnce()
    expect(estimator.estimate).not.toHaveBeenCalled()
    const usage = await db.aiUsage.findFirstOrThrow({ where: { userId: athleteId } })
    expect(usage.costMicros).toBe(usdToMicros(env().VIDEO_ANALYSIS_USD_PER_MINUTE + env().OBJECT_TRACKING_USD_PER_MINUTE))
    const stored = await db.videoAnalysis.findUniqueOrThrow({ where: { id } })
    expect(stored.status).toBe('COMPLETE')
    expect(stored.projectile).toMatchObject({ version: 'proj-2d-v1', label: 'baseball' })
  })

  it('leaves tracking off by default: pose only, pose price, no estimate', async () => {
    const estimator = fakeEstimator()
    const process = createVideoAnalysisProcessor(() => estimator)
    const { id, athleteId } = await queuedAnalysis(false)

    await expect(process(job(id))).resolves.toEqual({ status: 'COMPLETE' })
    expect(estimator.estimate).toHaveBeenCalledOnce()
    expect(estimator.estimateWithObjects).not.toHaveBeenCalled()
    const usage = await db.aiUsage.findFirstOrThrow({ where: { userId: athleteId } })
    expect(usage.costMicros).toBe(usdToMicros(env().VIDEO_ANALYSIS_USD_PER_MINUTE))
    expect((await db.videoAnalysis.findUniqueOrThrow({ where: { id } })).projectile).toBeNull()
  })
})
