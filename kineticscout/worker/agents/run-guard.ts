import { Prisma } from '@/generated/prisma/client'
import type { AgentType } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'

export type AgentRunContext = { runId: string; slot: string }

/**
 * Exactly-once execution per (agent, slot). The unique index on agent_runs(agent, slot) means a
 * second replica, a duplicate cron tick or a manual re-trigger for the same slot is skipped.
 * A FAILED run may be retried: it is reset to RUNNING by the next attempt.
 */
export async function withAgentRun<T extends Prisma.InputJsonValue>(
  agent: AgentType,
  slot: string,
  task: (ctx: AgentRunContext) => Promise<T>,
): Promise<{ status: 'succeeded'; stats: T } | { status: 'skipped' }> {
  let runId: string
  try {
    runId = (await db.agentRun.create({ data: { agent, slot, status: 'RUNNING' }, select: { id: true } })).id
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const retried = await db.agentRun.updateMany({
      where: { agent, slot, status: 'FAILED' },
      data: { status: 'RUNNING', error: null, startedAt: new Date(), finishedAt: null },
    })
    if (retried.count === 0) {
      logger.info({ agent, slot }, 'agent run already exists for this slot; skipping')
      return { status: 'skipped' }
    }
    runId = (await db.agentRun.findUniqueOrThrow({ where: { agent_slot: { agent, slot } }, select: { id: true } })).id
  }

  try {
    const stats = await task({ runId, slot })
    await db.agentRun.update({ where: { id: runId }, data: { status: 'SUCCEEDED', stats, finishedAt: new Date() } })
    logger.info({ agent, slot, stats }, 'agent run succeeded')
    return { status: 'succeeded', stats }
  } catch (error) {
    await db.agentRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 2000) : String(error), finishedAt: new Date() },
    })
    logger.error({ agent, slot, ...errorFields(error) }, 'agent run failed')
    throw error
  }
}
