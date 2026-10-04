import 'server-only'
import { Queue, type JobsOptions } from 'bullmq'
import IORedis from 'ioredis'
import { requireEnv } from '@/lib/env'

/**
 * BullMQ queues shared by the web app (producer) and the worker (consumer).
 * One Redis connection per process, created lazily.
 */

export const QUEUE_NAMES = {
  growthAgent: 'agent-growth',
  seoAgent: 'agent-seo',
  videoAnalysis: 'video-analysis',
  metricEvidence: 'metric-evidence',
  recruitingAssistant: 'agent-recruiting',
  referenceClip: 'reference-clip',
  push: 'push-notification',
} as const

export type VideoAnalysisJob = { analysisId: string }
export type MetricEvidenceJob = { metricId: string }
export type ReferenceClipJob = { clipId: string }
/** Agent 3: fan out one program change, or draft outreach for one athlete. */
export type RecruitingJob = { kind: 'change'; changeId: string } | { kind: 'draft'; changeId: string; athleteId: string }
export type AgentJob = { slot: string; trigger: 'schedule' | 'manual' }

let connection: IORedis | undefined

export function redisConnection(): IORedis {
  if (!connection) {
    const { REDIS_URL } = requireEnv('Background queues', ['REDIS_URL'])
    connection = new IORedis(REDIS_URL, {
      // Required by BullMQ for blocking commands.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectTimeout: 5_000,
    })
  }
  return connection
}

const queues = new Map<string, Queue>()

export function getQueue<T>(name: (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]): Queue<T> {
  let queue = queues.get(name)
  if (!queue) {
    queue = new Queue(name, { connection: redisConnection() })
    queues.set(name, queue)
  }
  return queue as Queue<T>
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 1_000 },
  removeOnFail: { age: 30 * 24 * 3600 },
}

/** Enqueues analysis with the analysis id as job id, so double submits collapse into one job. */
export async function enqueueVideoAnalysis(analysisId: string): Promise<void> {
  await getQueue<VideoAnalysisJob>(QUEUE_NAMES.videoAnalysis).add(
    'analyze',
    { analysisId },
    { ...DEFAULT_JOB_OPTIONS, jobId: `analysis-${analysisId}` },
  )
}

export async function enqueueEvidenceCheck(metricId: string): Promise<void> {
  await getQueue<MetricEvidenceJob>(QUEUE_NAMES.metricEvidence).add('check', { metricId }, { ...DEFAULT_JOB_OPTIONS, jobId: `evidence-${metricId}-${Date.now()}` })
}

export async function enqueueReferenceClip(clipId: string): Promise<void> {
  await getQueue<ReferenceClipJob>(QUEUE_NAMES.referenceClip).add('analyze', { clipId }, { ...DEFAULT_JOB_OPTIONS, jobId: `reference-${clipId}` })
}

/**
 * Change events are processed as soon as they are recorded; the job id collapses duplicates.
 * The sweep passes its own attempt key, because BullMQ ignores a re-add with an id it still holds
 * (failed jobs are kept for 30 days). Processing is idempotent, so a repeat is harmless.
 */
export async function enqueueProgramChange(changeId: string, attemptKey = 'initial'): Promise<void> {
  await getQueue<RecruitingJob>(QUEUE_NAMES.recruitingAssistant).add('change', { kind: 'change', changeId }, { ...DEFAULT_JOB_OPTIONS, jobId: `change-${changeId}-${attemptKey}` })
}

export async function enqueueOutreachDraft(changeId: string, athleteId: string): Promise<void> {
  await getQueue<RecruitingJob>(QUEUE_NAMES.recruitingAssistant).add(
    'draft',
    { kind: 'draft', changeId, athleteId },
    { ...DEFAULT_JOB_OPTIONS, jobId: `draft-${changeId}-${athleteId}` },
  )
}

export type PushJob = { notificationId: string }

/** One push delivery per notification; the id collapses duplicates. */
export async function enqueuePush(notificationId: string): Promise<void> {
  await getQueue<PushJob>(QUEUE_NAMES.push).add('deliver', { notificationId }, { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: { age: 24 * 3600, count: 1_000 }, removeOnFail: { age: 7 * 24 * 3600 }, jobId: `push-${notificationId}` })
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
  if (connection) {
    await connection.quit()
    connection = undefined
  }
}
