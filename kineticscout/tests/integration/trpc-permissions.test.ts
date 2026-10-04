import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'

const caller = (user: SessionUser | null) => appRouter.createCaller({ user, ipHash: 'test-ip' })

async function expectCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === code)
}

async function seedPrograms() {
  await db.collegeProgram.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      schoolName: `Fixture Program ${i}`,
      division: (['D1', 'D2', 'D3'] as const)[i % 3]!,
      state: i % 2 ? 'TX' : 'FL',
      averageRecruitingMetrics: { EXIT_VELOCITY: { mean: 84 + i * 0.4, sd: 4 }, INFIELD_VELO: { mean: 83, sd: 4 }, SIXTY_YARD_DASH: { mean: 7.0, sd: 0.2 } },
    })),
  })
}

beforeEach(resetDb)

describe('tRPC authorization', () => {
  it('rejects anonymous callers', async () => {
    await expectCode(caller(null).metrics.summary(), 'UNAUTHORIZED')
    await expectCode(caller(null).matchmaker.search({ page: 1, pageSize: 20 }), 'UNAUTHORIZED')
  })

  it('keeps Pro tools behind the Pro tier', async () => {
    const free = await createAthlete({ tier: 'FREE' })
    await expectCode(caller(free).matchmaker.search({ page: 1, pageSize: 20 }), 'FORBIDDEN')
    await expectCode(caller(free).analysis.list({ limit: 10 }), 'FORBIDDEN')
    await expectCode(caller(free).metrics.history({ metricType: 'EXIT_VELOCITY', limit: 10 }), 'FORBIDDEN')
  })

  it('hides admin procedures from non-admins with NOT_FOUND', async () => {
    const pro = await createAthlete({ tier: 'PRO' })
    await expectCode(caller(pro).admin.blogDrafts(), 'NOT_FOUND')
    const admin = { ...pro, role: 'ADMIN' as const }
    await expect(caller(admin).admin.blogDrafts()).resolves.toEqual([])
  })

  it('validates input before any work is done', async () => {
    const pro = await createAthlete({ tier: 'PRO' })
    await expectCode(caller(pro).matchmaker.search({ page: 1, pageSize: 500 }), 'BAD_REQUEST')
    await expectCode(caller(pro).analysis.get({ id: 'not-a-uuid' }), 'BAD_REQUEST')
    await expectCode(caller(pro).analysis.createUpload({ motionType: 'SWING', handedness: 'RIGHT', contentType: 'text/html', sizeBytes: 100, durationMs: 5000, width: 1080, height: 1920 }), 'BAD_REQUEST')
  })
})

describe('College Matchmaker procedure', () => {
  it('ranks programs for a Pro athlete with pagination and pipeline state', async () => {
    await seedPrograms()
    const pro = await createAthlete({ tier: 'PRO', position: 'SHORTSTOP' })
    const api = caller(pro)
    await api.metrics.log({ metricType: 'EXIT_VELOCITY', value: 91, date: new Date().toISOString().slice(0, 10) })
    await api.metrics.log({ metricType: 'SIXTY_YARD_DASH', value: 6.9, date: new Date().toISOString().slice(0, 10) })

    const page1 = await api.matchmaker.search({ page: 1, pageSize: 10 })
    expect(page1.total).toBe(30)
    expect(page1.pageCount).toBe(3)
    expect(page1.results).toHaveLength(10)
    expect(page1.athlete.metricsUsed.sort()).toEqual(['EXIT_VELOCITY', 'SIXTY_YARD_DASH'])

    const target = page1.results[0]!
    await api.pipeline.add({ collegeId: target.programId })
    await api.pipeline.add({ collegeId: target.programId })
    const filtered = await api.matchmaker.search({ page: 1, pageSize: 10, divisions: [target.division] })
    expect(filtered.results.every((r) => r.division === target.division)).toBe(true)
    expect(filtered.pipeline[target.programId]).toBe('INTERESTED')
    expect(await db.recruitingPipeline.count()).toBe(1)
  })

  it('never lets an athlete edit another athlete pipeline entry', async () => {
    await seedPrograms()
    const [a, b] = await Promise.all([createAthlete({ tier: 'PRO' }), createAthlete({ tier: 'PRO' })])
    const program = await db.collegeProgram.findFirstOrThrow()
    const entry = await caller(a).pipeline.add({ collegeId: program.id })
    await expectCode(caller(b).pipeline.update({ id: entry.id, status: 'OFFERED' }), 'NOT_FOUND')
    expect((await db.recruitingPipeline.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('INTERESTED')
  })
})

describe('metrics procedures', () => {
  it('returns the free quota and maps the quota error to FORBIDDEN', async () => {
    const free = await createAthlete()
    const api = caller(free)
    const today = new Date().toISOString().slice(0, 10)
    for (const value of [80, 81, 82]) await api.metrics.log({ metricType: 'EXIT_VELOCITY', value, date: today })
    await expectCode(api.metrics.log({ metricType: 'EXIT_VELOCITY', value: 83, date: today }), 'FORBIDDEN')
    const summary = await api.metrics.summary()
    expect(summary.quota.remaining).toBe(0)
    expect(summary.items[0]).toMatchObject({ metricType: 'EXIT_VELOCITY', best: 82, classPercentile: null })
  })
})
