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
} as const

export type VideoAnalysisJob = { analysisId: string }
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

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
  if (connection) {
    await connection.quit()
    connection = undefined
  }
}
