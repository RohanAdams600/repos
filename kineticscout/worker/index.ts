/**
 * KineticScout background worker.
 *
 *   npm run worker                 start schedules and queue consumers
 *   npm run worker -- --run growth enqueue a one-off Growth agent run now
 *   npm run worker -- --run seo    enqueue a one-off Data and SEO agent run now
 *
 * Runs as a long-lived process (Railway, Fly.io, Cloud Run jobs with min instances, ECS, etc.).
 * Several replicas may run at once: cron ticks enqueue jobs with deterministic ids and agent runs
 * are unique per (agent, slot), so each scheduled run executes exactly once.
 */
import '@worker/bootstrap-env'
import cron, { type ScheduledTask } from 'node-cron'
import { Worker, type Job } from 'bullmq'
import { OpenAiLlmClient, type LlmClient } from '@/lib/ai/llm'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { closeQueues, DEFAULT_JOB_OPTIONS, getQueue, QUEUE_NAMES, redisConnection, type AgentJob } from '@/lib/queue/queues'
import { runGrowthAgent } from '@worker/agents/growth/run'
import { withAgentRun } from '@worker/agents/run-guard'
import { runSeoAgent } from '@worker/agents/seo/run'
import { workerEnv } from '@worker/env'
import { createVideoAnalysisProcessor } from '@worker/jobs/video-analysis'
import { GoogleVideoIntelligencePoseEstimator } from '@worker/pose/google-video-intelligence'
import { AGENT_SCHEDULES, scheduleSlot } from '@worker/schedule'
import { sweepStuckWork } from '@worker/sweep'

type AgentKind = 'growth' | 'seo'
const AGENT_QUEUE: Record<AgentKind, (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]> = {
  growth: QUEUE_NAMES.growthAgent,
  seo: QUEUE_NAMES.seoAgent,
}

async function enqueueAgent(kind: AgentKind, slot: string, trigger: AgentJob['trigger']): Promise<void> {
  await getQueue<AgentJob>(AGENT_QUEUE[kind]).add(
    kind,
    { slot, trigger },
    // Deterministic id: duplicate ticks from several replicas collapse into one job.
    { ...DEFAULT_JOB_OPTIONS, attempts: 2, backoff: { type: 'exponential', delay: 5 * 60_000 }, jobId: `${kind}-${slot}` },
  )
  logger.info({ agent: kind, slot, trigger }, 'agent run enqueued')
}

let llmClient: LlmClient | undefined
const llm = () => (llmClient ??= new OpenAiLlmClient())

async function main(): Promise<void> {
  env()
  const config = workerEnv()
  const args = process.argv.slice(2)
  const runIndex = args.indexOf('--run')
  if (runIndex >= 0) {
    const kind = args[runIndex + 1]
    if (kind !== 'growth' && kind !== 'seo') throw new Error('Usage: --run growth|seo')
    await enqueueAgent(kind, `manual-${new Date().toISOString().slice(0, 16)}`, 'manual')
    await closeQueues()
    return
  }

  const connection = redisConnection()
  const workers = [
    new Worker<AgentJob>(
      QUEUE_NAMES.growthAgent,
      (job: Job<AgentJob>) => withAgentRun('GROWTH', job.data.slot, (ctx) => runGrowthAgent(llm(), ctx)),
      { connection, concurrency: 1, lockDuration: 10 * 60_000 },
    ),
    new Worker<AgentJob>(
      QUEUE_NAMES.seoAgent,
      (job: Job<AgentJob>) => withAgentRun('SEO', job.data.slot, (ctx) => runSeoAgent(llm(), ctx)),
      { connection, concurrency: 1, lockDuration: 10 * 60_000 },
    ),
    new Worker(QUEUE_NAMES.videoAnalysis, createVideoAnalysisProcessor(() => new GoogleVideoIntelligencePoseEstimator()), {
      connection,
      concurrency: 2,
      lockDuration: 15 * 60_000,
    }),
  ]
  for (const worker of workers) {
    worker.on('failed', (job, error) => logger.error({ queue: worker.name, jobId: job?.id, ...errorFields(error) }, 'job failed'))
    worker.on('error', (error) => logger.error({ queue: worker.name, ...errorFields(error) }, 'worker error'))
  }

  const tz = config.AGENT_TIMEZONE
  const tasks: ScheduledTask[] = [
    cron.schedule(AGENT_SCHEDULES.growth, (ctx) => enqueueAgent('growth', scheduleSlot(ctx.date, tz), 'schedule'), { timezone: tz, name: 'growth-agent', noOverlap: true }),
    cron.schedule(AGENT_SCHEDULES.seo, (ctx) => enqueueAgent('seo', scheduleSlot(ctx.date, tz), 'schedule'), { timezone: tz, name: 'seo-agent', noOverlap: true }),
    cron.schedule(
      AGENT_SCHEDULES.sweep,
      async () => {
        const result = await sweepStuckWork()
        if (result.requeued || result.expired || result.purged || result.logsPurged) logger.info(result, 'sweep completed')
      },
      { timezone: tz, name: 'sweep', noOverlap: true },
    ),
  ]
  for (const task of tasks) task.on('execution:failed', (ctx) => logger.error({ task: task.name, ...errorFields(ctx.error) }, 'scheduled task failed'))

  // Dead man's switch for uptime monitoring: alerts fire if pings stop.
  const heartbeat = config.WORKER_HEARTBEAT_URL
    ? setInterval(() => {
        fetch(config.WORKER_HEARTBEAT_URL!, { method: 'POST', signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
      }, 5 * 60_000)
    : undefined

  logger.info(
    { timezone: tz, nextGrowth: tasks[0]?.getNextRun()?.toISOString(), nextSeo: tasks[1]?.getNextRun()?.toISOString() },
    'worker started',
  )

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'worker shutting down')
    const force = setTimeout(() => process.exit(1), 30_000)
    force.unref()
    if (heartbeat) clearInterval(heartbeat)
    await Promise.all(tasks.map((t) => t.stop()))
    // Waits for in-flight jobs to finish (or their locks to be released) before exiting.
    await Promise.all(workers.map((w) => w.close()))
    await closeQueues()
    await db.$disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

process.on('unhandledRejection', (reason) => logger.error(errorFields(reason), 'unhandled rejection'))

main().catch((error: unknown) => {
  logger.fatal(errorFields(error), 'worker failed to start')
  process.exit(1)
})
