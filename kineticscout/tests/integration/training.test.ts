import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { utcDay } from '@/lib/events/rules'
import { drillInputSchema } from '@/lib/training/rules'
import { archiveFinishedPlans, archivePlan, createDrill, createPlanFromAnalysis, planView, publishDrill, retireDrill, togglePractice } from '@/lib/training/service'
import { createAthlete, resetDb } from '../helpers/db'
import { adminId } from '../helpers/people'

vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [] }) }))

beforeEach(resetDb)

const DAY = 86_400_000
function drillInput(patch: Record<string, unknown> = {}) {
  return drillInputSchema.parse({ title: 'Hip lead walk-through', sport: 'BASEBALL', motionTypes: ['SWING'], focusCodes: ['TRUNK_LEADS_PELVIS'], summary: 'Slow rehearsal of the hips starting the turn.', steps: ['Set up in your stance.', 'Turn the hips first, slowly.'], minutes: '10', safetyNote: 'Warm up first and stop if anything hurts.', source: 'STAFF', author: 'Test staff coach (fixture)', ...patch })
}
async function publishedDrill(patch: Record<string, unknown> = {}) {
  const [writer, reviewer] = [await adminId(), await adminId()]
  const id = await createDrill(writer, drillInput(patch))
  await publishDrill(reviewer, id)
  return id
}
async function proAthlete(): Promise<SessionUser> {
  return createAthlete({ tier: 'PRO' })
}
async function analysis(athleteId: string, codes: string[] = ['TRUNK_LEADS_PELVIS', 'LOW_HIP_SHOULDER_SEPARATION'], motionType: 'SWING' | 'PITCH' = 'SWING') {
  const report = { findings: codes.map((code, i) => ({ code, severity: i === 0 ? 'high' : 'medium', title: `Finding ${code}`, detail: 'Fixture.', focus: 'Fixture.' })) }
  return (await db.videoAnalysis.create({ data: { athleteId, motionType, handedness: 'RIGHT', status: 'COMPLETE', objectKey: `videos/${athleteId}/${randomUUID()}.mp4`, contentType: 'video/mp4', sizeBytes: 100, report }, select: { id: true } })).id
}

describe('drill library', () => {
  it('needs a second staff member to publish, enforced in the database too', async () => {
    const writer = await adminId()
    const id = await createDrill(writer, drillInput())
    await expect(publishDrill(writer, id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    await expect(db.drill.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), reviewedById: writer } })).rejects.toThrow()
    await publishDrill(await adminId(), id)
    expect((await db.drill.findUniqueOrThrow({ where: { id } })).status).toBe('PUBLISHED')
  })
})

describe('plans', () => {
  it('are built from the athlete’s own analysis with published drills, with a baseline from recent measurements', async () => {
    const hips = await publishedDrill()
    await publishedDrill({ title: 'Separation hold', focusCodes: ['LOW_HIP_SHOULDER_SEPARATION'] })
    const athlete = await proAthlete()
    await db.metric.create({ data: { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 84, date: new Date(Date.now() - 10 * DAY) } })
    await db.metric.create({ data: { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 86.5, date: new Date(Date.now() - 20 * DAY) } })
    await db.metric.create({ data: { athleteId: athlete.id, metricType: 'EXIT_VELOCITY', value: 99, date: new Date(Date.now() - 200 * DAY) } })
    const analysisId = await analysis(athlete.id)

    // Free accounts and other athletes' analyses are refused.
    await expect(createPlanFromAnalysis({ ...athlete, tier: 'FREE' }, analysisId, null)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    await expect(createPlanFromAnalysis(await proAthlete(), analysisId, null)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(createPlanFromAnalysis(athlete, analysisId, 'PITCH_VELO')).rejects.toMatchObject({ code: 'INVALID' })

    const planId = await createPlanFromAnalysis(athlete, analysisId, null)
    const plan = (await planView(athlete.id, planId))!
    expect(plan.items.map((i) => i.drill?.title)).toEqual(['Hip lead walk-through', 'Separation hold'])
    expect(plan.items[0]!.focusCode).toBe('TRUNK_LEADS_PELVIS')
    // Best of the last 90 days, not the old outlier.
    expect(plan).toMatchObject({ metricType: 'EXIT_VELOCITY', baselineValue: 86.5, status: 'ACTIVE' })
    expect(await planView((await proAthlete()).id, planId)).toBeNull()

    // A licensed drill whose licence ends disappears from the plan; a retired one stays with a note.
    await db.drill.update({ where: { id: hips }, data: { source: 'LICENSED', licensor: 'Example Press', licenceRef: 'Fixture licence', licenceExpiresAt: new Date(Date.now() - 2 * DAY) } })
    expect((await planView(athlete.id, planId))!.items[0]!.drill).toBeNull()
  })

  it('records practice, keeps one active plan per motion, and archives finished plans', async () => {
    await publishedDrill()
    const athlete = await proAthlete()
    const first = await createPlanFromAnalysis(athlete, await analysis(athlete.id, ['TRUNK_LEADS_PELVIS']), null)
    const item = (await planView(athlete.id, first))!.items[0]!
    expect(await togglePractice(athlete, item.id)).toBe(true)
    expect((await planView(athlete.id, first))!.items[0]).toMatchObject({ practicedToday: true, thisWeek: 1, total: 1 })
    expect(await togglePractice(athlete, item.id)).toBe(false)
    await expect(togglePractice(await proAthlete(), item.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const second = await createPlanFromAnalysis(athlete, await analysis(athlete.id, ['TRUNK_LEADS_PELVIS']), null)
    expect((await db.trainingPlan.findUniqueOrThrow({ where: { id: first } })).status).toBe('ARCHIVED')
    await expect(togglePractice(athlete, item.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // The database allows only one active plan per motion.
    await expect(db.trainingPlan.update({ where: { id: first }, data: { status: 'ACTIVE', archivedAt: null } })).rejects.toThrow()

    const start = new Date(utcDay(new Date()).getTime() - 60 * DAY)
    await db.trainingPlan.update({ where: { id: second }, data: { startsOn: start, endsOn: new Date(start.getTime() + 28 * DAY) } })
    expect(await archiveFinishedPlans()).toBe(1)
    await expect(archivePlan(athlete, second)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('explains when the library does not cover the analysis yet', async () => {
    const athlete = await proAthlete()
    await expect(createPlanFromAnalysis(athlete, await analysis(athlete.id, ['HAND_LEADS_ARM']), null)).rejects.toMatchObject({ code: 'NO_DRILLS' })
    const retired = await publishedDrill({ focusCodes: ['HAND_LEADS_ARM'] })
    await retireDrill(await adminId(), retired)
    await expect(createPlanFromAnalysis(athlete, await analysis(athlete.id, ['HAND_LEADS_ARM']), null)).rejects.toMatchObject({ code: 'NO_DRILLS' })
  })
})
