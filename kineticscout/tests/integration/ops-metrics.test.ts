import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/internal/metrics/route'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { collectOperationalMetrics } from '@/lib/ops/metrics'
import type { Gauge } from '@/lib/ops/prometheus'
import { createAthlete, resetDb } from '../helpers/db'

beforeEach(resetDb)

const NOW = new Date()
const MIN = 60_000

function value(gauges: Gauge[], name: string, labels: Record<string, string> = {}): number | undefined {
  const gauge = gauges.find((g) => g.name === name)
  return gauge?.samples.find((s) => Object.entries(labels).every(([k, v]) => s.labels?.[k] === v))?.value
}

async function analysis(athleteId: string, data: { status: 'QUEUED' | 'PROCESSING' | 'FAILED'; createdAt: Date; startedAt?: Date; errorCode?: string }) {
  const id = randomUUID()
  await db.videoAnalysis.create({ data: { id, athleteId, motionType: 'SWING', handedness: 'RIGHT', objectKey: `videos/${id}.mp4`, contentType: 'video/mp4', sizeBytes: 1000, ...data } })
}

describe('operational metrics', () => {
  it('reports zeros, not gaps, on an empty system', async () => {
    const gauges = await collectOperationalMetrics(NOW)
    expect(value(gauges, 'kineticscout_metric_verifications_in_review')).toBe(0)
    expect(value(gauges, 'kineticscout_metric_verifications_oldest_age_seconds')).toBe(0)
    expect(value(gauges, 'kineticscout_account_deletions_overdue')).toBe(0)
    expect(value(gauges, 'kineticscout_ai_spend_month_usd')).toBe(0)
    expect(value(gauges, 'kineticscout_ai_spend_usd', { feature: 'VIDEO_ANALYSIS' })).toBe(0)
    expect(value(gauges, 'kineticscout_contact_requests_open', { stage: 'guardian' })).toBe(0)
    for (const agent of ['GROWTH', 'SEO', 'RECRUITING']) expect(value(gauges, 'kineticscout_agent_last_success_timestamp_seconds', { agent })).toBe(0)
    for (const name of ['kineticscout_team_verifications_in_review', 'kineticscout_message_reports_open', 'kineticscout_norm_datasets_active', 'kineticscout_norm_licences_expiring_30d', 'kineticscout_push_devices']) {
      expect(value(gauges, name), name).toBe(0)
    }
    // No Redis in tests: the queue is reported unreachable rather than silently omitted.
    expect(value(gauges, 'kineticscout_queue_reachable')).toBe(0)
  })

  it('counts backlogs, stuck work, overdue deletions and this month\'s AI spend', async () => {
    const athlete = await createAthlete()
    await analysis(athlete.id, { status: 'QUEUED', createdAt: new Date(NOW.getTime() - 20 * MIN) })
    await analysis(athlete.id, { status: 'PROCESSING', createdAt: new Date(NOW.getTime() - 50 * MIN), startedAt: new Date(NOW.getTime() - 45 * MIN) })
    await analysis(athlete.id, { status: 'PROCESSING', createdAt: new Date(NOW.getTime() - 6 * MIN), startedAt: new Date(NOW.getTime() - 5 * MIN) })
    await analysis(athlete.id, { status: 'FAILED', createdAt: new Date(NOW.getTime() - 60 * MIN), errorCode: 'POSE_NOT_FOUND' })
    await analysis(athlete.id, { status: 'FAILED', createdAt: new Date(NOW.getTime() - 60 * MIN), errorCode: 'UPLOAD_EXPIRED' })

    await db.user.update({ where: { id: athlete.id }, data: { deletionScheduledFor: new Date(NOW.getTime() - 2 * 3600_000) } })
    const pending = await createAthlete()
    await db.user.update({ where: { id: pending.id }, data: { deletionScheduledFor: new Date(NOW.getTime() + 5 * 86_400_000) } })

    const lastMonth = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1) - 86_400_000)
    await db.aiUsage.createMany({
      data: [
        { feature: 'VIDEO_ANALYSIS', model: 'video-intelligence', costMicros: 1_250_000, createdAt: NOW },
        { feature: 'OUTREACH_DRAFT', model: 'gpt', costMicros: 500_000, createdAt: NOW },
        { feature: 'OUTREACH_DRAFT', model: 'gpt', costMicros: 9_000_000, createdAt: lastMonth },
      ],
    })
    const finished = new Date(NOW.getTime() - 3600_000)
    await db.agentRun.create({ data: { agent: 'SEO', slot: 'test-slot', status: 'SUCCEEDED', finishedAt: finished } })
    await db.agentRun.create({ data: { agent: 'GROWTH', slot: 'test-slot', status: 'FAILED', startedAt: new Date(NOW.getTime() - 3600_000) } })

    const coach = await createAthlete()
    await db.user.update({ where: { id: coach.id }, data: { role: 'TEAM_COACH' } })
    await db.team.create({ data: { coachId: coach.id, name: 'Test Team', sport: 'BASEBALL', orgType: 'CLUB', organization: 'Test Club', state: 'TX', coachName: 'Sam Coach', coachTitle: 'Head Coach', directoryUrl: 'https://club.example.org/staff', joinCode: 'abcdefghjk', updatedAt: new Date(NOW.getTime() - 3600_000) } })
    const expiring = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + 10))
    await db.normDataset.create({ data: { name: 'Norms', publisher: 'Example', edition: '2026', population: 'Test population of athletes.', sourceUrl: 'https://example.org/n', licence: 'Test licence text.', licenceExpiresAt: expiring, status: 'ACTIVE', activatedAt: NOW, rowCount: 0 } })

    const gauges = await collectOperationalMetrics(NOW)
    expect(value(gauges, 'kineticscout_team_verifications_in_review')).toBe(1)
    expect(value(gauges, 'kineticscout_team_verifications_oldest_age_seconds')).toBeGreaterThanOrEqual(3599)
    expect(value(gauges, 'kineticscout_norm_datasets_active')).toBe(1)
    expect(value(gauges, 'kineticscout_norm_licences_expiring_30d')).toBe(1)
    expect(value(gauges, 'kineticscout_video_analyses_queued')).toBe(1)
    expect(value(gauges, 'kineticscout_video_analyses_queued_oldest_age_seconds')).toBeGreaterThanOrEqual(20 * 60 - 1)
    expect(value(gauges, 'kineticscout_video_analyses_processing_stuck')).toBe(1)
    expect(value(gauges, 'kineticscout_video_analyses_failed_24h')).toBe(1)
    expect(value(gauges, 'kineticscout_account_deletions_scheduled')).toBe(2)
    expect(value(gauges, 'kineticscout_account_deletions_overdue')).toBe(1)
    expect(value(gauges, 'kineticscout_ai_spend_month_usd')).toBe(1.75)
    expect(value(gauges, 'kineticscout_ai_spend_usd', { feature: 'OUTREACH_DRAFT' })).toBe(0.5)
    expect(value(gauges, 'kineticscout_ai_budget_month_usd')).toBe(env().AI_GLOBAL_MONTHLY_BUDGET_USD)
    expect(value(gauges, 'kineticscout_agent_last_success_timestamp_seconds', { agent: 'SEO' })).toBe(Math.floor(finished.getTime() / 1000))
    expect(value(gauges, 'kineticscout_agent_runs_failed_24h', { agent: 'GROWTH' })).toBe(1)
  })
})

describe('metrics endpoint', () => {
  it('requires the internal bearer secret', async () => {
    expect((await GET(new Request('http://localhost/api/internal/metrics'))).status).toBe(401)
    expect((await GET(new Request('http://localhost/api/internal/metrics', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  })

  it('serves the Prometheus text format with no identifiers in it', async () => {
    const athlete = await createAthlete()
    await analysis(athlete.id, { status: 'QUEUED', createdAt: NOW })
    const response = await GET(new Request('http://localhost/api/internal/metrics', { headers: { authorization: `Bearer ${env().INTERNAL_API_SECRET}` } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('version=0.0.4')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.text()
    expect(body).toContain('# TYPE kineticscout_video_analyses_queued gauge')
    expect(body).toContain('kineticscout_video_analyses_queued 1')
    expect(body).not.toContain(athlete.id)
    expect(body).not.toContain(athlete.email)
  })
})
