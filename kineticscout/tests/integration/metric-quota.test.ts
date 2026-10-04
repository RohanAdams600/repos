import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { logMetric, MetricQuotaError, MetricValidationError } from '@/lib/metrics/service'
import { createAthlete, resetDb } from '../helpers/db'

beforeEach(resetDb)

describe('free tier metric quota under concurrency', () => {
  it('lets exactly 3 of 12 simultaneous submissions through for a free athlete', async () => {
    const user = await createAthlete({ tier: 'FREE' })
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => logMetric(user, { metricType: 'EXIT_VELOCITY', value: 80 + i, date: new Date() })),
    )
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const quotaErrors = results.filter((r) => r.status === 'rejected' && r.reason instanceof MetricQuotaError)
    expect(fulfilled).toHaveLength(3)
    expect(quotaErrors).toHaveLength(9)
    expect(await db.metric.count({ where: { athleteId: user.id } })).toBe(3)
  })

  it('keeps athletes independent and lets Pro log without limit', async () => {
    const [free, pro] = await Promise.all([createAthlete(), createAthlete({ tier: 'PRO' })])
    await Promise.all(Array.from({ length: 3 }, () => logMetric(free, { metricType: 'PITCH_VELO', value: 80, date: new Date() })))
    const proResults = await Promise.allSettled(Array.from({ length: 10 }, () => logMetric(pro, { metricType: 'PITCH_VELO', value: 85, date: new Date() })))
    expect(proResults.every((r) => r.status === 'fulfilled')).toBe(true)
  })

  it('rejects implausible values and future dates before touching the quota', async () => {
    const user = await createAthlete()
    await expect(logMetric(user, { metricType: 'PITCH_VELO', value: 160, date: new Date() })).rejects.toBeInstanceOf(MetricValidationError)
    await expect(logMetric(user, { metricType: 'PITCH_VELO', value: 80, date: new Date(Date.now() + 5 * 86_400_000) })).rejects.toBeInstanceOf(MetricValidationError)
    expect(await db.metric.count()).toBe(0)
  })
})
