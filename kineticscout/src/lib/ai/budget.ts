import 'server-only'
import type { AiFeature } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

/**
 * Hard spending caps for paid AI calls.
 *
 * Before a call, the estimated maximum cost is *reserved* by inserting a ledger row inside a
 * transaction that holds a global advisory lock. Concurrent callers therefore see each other's
 * reservations and the monthly total can never exceed the cap. After the call the row is updated
 * to the actual cost (or zero if the call failed).
 */

export class BudgetExceededError extends Error {
  constructor(public readonly scope: 'global' | 'user') {
    super(scope === 'global' ? 'Monthly AI budget reached' : 'Your monthly AI allowance is used up')
    this.name = 'BudgetExceededError'
  }
}

export function usdToMicros(usd: number): number {
  return Math.ceil(usd * 1_000_000)
}

export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** Token cost in micros at the configured per-million-token prices. */
export function tokenCostMicros(inputTokens: number, outputTokens: number): number {
  const e = env()
  return usdToMicros((inputTokens * e.OPENAI_INPUT_USD_PER_MTOK + outputTokens * e.OPENAI_OUTPUT_USD_PER_MTOK) / 1_000_000)
}

/** Rough token estimate (about 4 characters per token for English) used only for reservations. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 16
}

export type Reservation = { id: string }

export async function reserveAiSpend(params: {
  feature: AiFeature
  model: string
  userId: string | null
  estimatedCostMicros: number
}): Promise<Reservation> {
  const e = env()
  const monthStart = startOfUtcMonth()
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('ai-budget', 0))`

    const [global] = await tx.$queryRaw<{ total: bigint | null }[]>`
      SELECT COALESCE(SUM(cost_micros), 0)::bigint AS total FROM ai_usage WHERE created_at >= ${monthStart}`
    if (Number(global?.total ?? 0) + params.estimatedCostMicros > usdToMicros(e.AI_GLOBAL_MONTHLY_BUDGET_USD)) {
      throw new BudgetExceededError('global')
    }

    if (params.userId) {
      const [user] = await tx.$queryRaw<{ total: bigint | null }[]>`
        SELECT COALESCE(SUM(cost_micros), 0)::bigint AS total FROM ai_usage
        WHERE user_id = ${params.userId}::uuid AND created_at >= ${monthStart}`
      if (Number(user?.total ?? 0) + params.estimatedCostMicros > usdToMicros(e.AI_USER_MONTHLY_BUDGET_USD)) {
        throw new BudgetExceededError('user')
      }
    }

    const row = await tx.aiUsage.create({
      data: {
        feature: params.feature,
        model: params.model,
        userId: params.userId,
        costMicros: params.estimatedCostMicros,
      },
      select: { id: true },
    })
    return row
  })
}

export async function settleAiSpend(
  reservation: Reservation,
  actual: { inputTokens: number; outputTokens: number; costMicros: number },
): Promise<void> {
  await db.aiUsage.update({
    where: { id: reservation.id },
    data: { inputTokens: actual.inputTokens, outputTokens: actual.outputTokens, costMicros: Math.max(0, actual.costMicros) },
  })
}

export async function releaseAiSpend(reservation: Reservation): Promise<void> {
  await db.aiUsage.update({ where: { id: reservation.id }, data: { costMicros: 0 } })
}
