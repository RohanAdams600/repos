import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetExceededError, releaseAiSpend, reserveAiSpend, usdToMicros } from '@/lib/ai/budget'
import { db } from '@/lib/db'
import { resetEnvCache } from '@/lib/env'
import { withAgentRun } from '@worker/agents/run-guard'
import { computeBaselines, isoWeekStart, storeBaselines } from '@worker/agents/seo/percentiles'
import { createAthlete, resetDb } from '../helpers/db'

beforeEach(resetDb)

describe('weekly percentile baselines (k-anonymity)', () => {
  it('reports only cohorts with at least k athletes, one best value per athlete', async () => {
    const now = new Date()
    // 30 shortstops in the class of 2027, each with two exit velocity entries (best counts).
    for (let i = 0; i < 30; i++) {
      const athlete = await createAthlete({ gradYear: 2027, position: 'SHORTSTOP' })
      await db.metric.createMany({
        data: [
          { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 70 + i, date: now },
          { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 60 + i, date: now },
          { athleteId: athlete.id, metricType: 'SIXTY_YARD_DASH', value: 7 + i * 0.01, date: now },
          { athleteId: athlete.id, metricType: 'SIXTY_YARD_DASH', value: 9, date: now },
        ],
      })
    }
    // Only 5 athletes in the class of 2028: below k, so this cohort must never appear.
    for (let i = 0; i < 5; i++) {
      const athlete = await createAthlete({ gradYear: 2028, position: 'CATCHER' })
      await db.metric.create({ data: { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 90, date: now } })
    }

    const baselines = await computeBaselines(now, 25)
    const keys = baselines.map((b) => b.cohortKey).sort()
    expect(keys).toContain('EXIT_VELOCITY|*|*')
    expect(keys).toContain('EXIT_VELOCITY|2027|*')
    expect(keys).toContain('EXIT_VELOCITY|2027|SHORTSTOP')
    expect(keys.some((k) => k.includes('2028') || k.includes('CATCHER'))).toBe(false)

    const shortstops = baselines.find((b) => b.cohortKey === 'EXIT_VELOCITY|2027|SHORTSTOP')!
    expect(shortstops.sampleSize).toBe(30)
    expect(shortstops.p50).toBeCloseTo(84.5, 1) // best values 70..99
    const national = baselines.find((b) => b.cohortKey === 'EXIT_VELOCITY|*|*')!
    expect(national.sampleSize).toBe(35)

    // Timed events use each athlete's fastest time, not the slowest.
    const sixty = baselines.find((b) => b.cohortKey === 'SIXTY_YARD_DASH|*|*')!
    expect(sixty.p90).toBeLessThan(7.5)

    const stored = await storeBaselines(isoWeekStart(now), baselines)
    expect(stored).toBe(baselines.length)
    expect(await db.percentileBaseline.count()).toBe(baselines.length)
  })

  it('enforces a k-anonymity floor in the database itself', async () => {
    await expect(
      db.percentileBaseline.create({
        data: { computedFor: new Date(), cohortKey: 'X', metricType: 'EXIT_VELOCITY', sampleSize: 3, p10: 1, p25: 1, p50: 1, p75: 1, p90: 1, mean: 1, stddev: 0 },
      }),
    ).rejects.toThrow()
  })
})

describe('AI spending cap', () => {
  it('admits only what fits in the global budget when many calls race', async () => {
    process.env.AI_GLOBAL_MONTHLY_BUDGET_USD = '1'
    resetEnvCache()
    try {
      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () => reserveAiSpend({ feature: 'SEO_AGENT', model: 'test', userId: null, estimatedCostMicros: usdToMicros(0.3) })),
      )
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(3)
      expect(attempts.filter((a) => a.status === 'rejected' && a.reason instanceof BudgetExceededError)).toHaveLength(7)

      // Releasing a reservation frees budget again.
      const first = attempts.find((a) => a.status === 'fulfilled') as PromiseFulfilledResult<{ id: string }>
      await releaseAiSpend(first.value)
      await expect(reserveAiSpend({ feature: 'SEO_AGENT', model: 'test', userId: null, estimatedCostMicros: usdToMicros(0.3) })).resolves.toBeDefined()
    } finally {
      delete process.env.AI_GLOBAL_MONTHLY_BUDGET_USD
      resetEnvCache()
    }
  })

  it('applies the per-user allowance', async () => {
    const user = await createAthlete()
    await reserveAiSpend({ feature: 'OUTREACH_DRAFT', model: 'test', userId: user.id, estimatedCostMicros: usdToMicros(2.5) })
    await expect(reserveAiSpend({ feature: 'OUTREACH_DRAFT', model: 'test', userId: user.id, estimatedCostMicros: usdToMicros(1) })).rejects.toMatchObject({ scope: 'user' })
  })
})

describe('agent runs', () => {
  it('runs a scheduled slot exactly once even when triggered concurrently', async () => {
    let executions = 0
    const task = async () => {
      executions++
      await new Promise((r) => setTimeout(r, 50))
      return { ok: true }
    }
    const results = await Promise.all(Array.from({ length: 5 }, () => withAgentRun('GROWTH', '2026-10-06T10:00', task)))
    expect(executions).toBe(1)
    expect(results.filter((r) => r.status === 'succeeded')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(4)
  })

  it('records failures and allows the slot to be retried', async () => {
    await expect(withAgentRun('SEO', '2026-10-11T00:00', async () => { throw new Error('LLM timeout') })).rejects.toThrow('LLM timeout')
    expect((await db.agentRun.findFirstOrThrow({ where: { agent: 'SEO' } })).status).toBe('FAILED')
    const retry = await withAgentRun('SEO', '2026-10-11T00:00', async () => ({ ok: true }))
    expect(retry.status).toBe('succeeded')
    expect(await db.agentRun.count({ where: { agent: 'SEO' } })).toBe(1)
  })
})

describe('database access rules', () => {
  it('has row level security enabled on every application table', async () => {
    const rows = await db.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname <> '_prisma_migrations'`
    expect(rows.length).toBeGreaterThanOrEqual(16)
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([])
  })

  it('cascades a user deletion to every owned record', async () => {
    const user = await createAthlete()
    await db.metric.create({ data: { athleteId: user.id, metricType: 'EXIT_VELOCITY', value: 85, date: new Date() } })
    await db.user.delete({ where: { id: user.id } })
    expect(await db.athleteProfile.count()).toBe(0)
    expect(await db.metric.count()).toBe(0)
  })
})
