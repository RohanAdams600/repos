import 'server-only'
import type { MetricType } from '@/generated/prisma/enums'
import { canUseVideoAnalysis, type SessionUser } from '@/lib/auth/permissions'
import { audit } from '@/lib/audit'
import type { KinematicReport } from '@/lib/biomechanics/types'
import { db } from '@/lib/db'
import { utcDay } from '@/lib/events/rules'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { MOTION_SPORT, pickDrills, progressSummary, TRACKED_METRICS, TRAINING_POLICY, weekBounds, type DrillInput } from '@/lib/training/rules'

export class TrainingError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NOT_ALLOWED' | 'NO_DRILLS' | 'INVALID',
    message: string,
  ) {
    super(message)
  }
}

const DAY = 86_400_000

/** A licensed drill whose licence has ended is no longer shown or offered. */
function drillAvailable(drill: { status: string; licenceExpiresAt: Date | null }, today: Date): boolean {
  return drill.status === 'PUBLISHED' && (!drill.licenceExpiresAt || drill.licenceExpiresAt >= today)
}

// ---------------------------------------------------------------------------------------------
// Staff: drill library (two-person review)
// ---------------------------------------------------------------------------------------------

export async function createDrill(adminId: string, input: DrillInput): Promise<string> {
  const drill = await db.drill.create({ data: { ...input, createdById: adminId }, select: { id: true } })
  await audit('training.drill_created', { actorId: adminId, targetType: 'drill', targetId: drill.id })
  return drill.id
}

/** Publishing needs a second staff member: the writer cannot publish their own drill. */
export async function publishDrill(adminId: string, drillId: string, now: Date = new Date()): Promise<void> {
  const drill = await db.drill.findUnique({ where: { id: drillId }, select: { status: true, createdById: true, licenceExpiresAt: true } })
  if (!drill || drill.status !== 'DRAFT') throw new TrainingError('NOT_FOUND', 'Only drafts can be published.')
  if (drill.createdById === adminId) throw new TrainingError('NOT_ALLOWED', 'A different staff member must review and publish a drill you wrote.')
  if (drill.licenceExpiresAt && drill.licenceExpiresAt < utcDay(now)) throw new TrainingError('INVALID', 'The licence for this drill has ended.')
  await db.drill.update({ where: { id: drillId }, data: { status: 'PUBLISHED', reviewedById: adminId, publishedAt: now } })
  await audit('training.drill_published', { actorId: adminId, targetType: 'drill', targetId: drillId })
}

/** Retired drills stay in plans that use them (with a note) but are never offered again. */
export async function retireDrill(adminId: string, drillId: string): Promise<void> {
  const result = await db.drill.updateMany({ where: { id: drillId, status: 'PUBLISHED' }, data: { status: 'RETIRED' } })
  if (result.count === 0) throw new TrainingError('NOT_FOUND', 'Only published drills can be retired.')
  await audit('training.drill_retired', { actorId: adminId, targetType: 'drill', targetId: drillId })
}

/** Drafts were never shown to anyone, so they are deleted rather than retired. */
export async function deleteDraftDrill(adminId: string, drillId: string): Promise<void> {
  const result = await db.drill.deleteMany({ where: { id: drillId, status: 'DRAFT' } })
  if (result.count === 0) throw new TrainingError('NOT_FOUND', 'Only drafts can be deleted.')
  await audit('training.drill_retired', { actorId: adminId, targetType: 'drill', targetId: drillId, metadata: { draftDeleted: true } })
}

export async function drillLibrary() {
  return db.drill.findMany({
    where: { status: { in: ['DRAFT', 'PUBLISHED'] } },
    orderBy: [{ status: 'asc' }, { sport: 'asc' }, { title: 'asc' }],
    take: 300,
    select: { id: true, title: true, sport: true, motionTypes: true, focusCodes: true, summary: true, steps: true, equipment: true, minutes: true, safetyNote: true, source: true, author: true, licensor: true, licenceRef: true, licenceExpiresAt: true, status: true, createdById: true, createdAt: true },
  })
}

// ---------------------------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------------------------

/** Completed analyses that have findings and no active plan built from them, newest first. */
export async function analysesForPlans(athleteId: string) {
  const rows = await db.videoAnalysis.findMany({ where: { athleteId, status: 'COMPLETE' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, motionType: true, createdAt: true, report: true } })
  return rows
    .map((r) => ({ id: r.id, motionType: r.motionType, createdAt: r.createdAt, findings: ((r.report as KinematicReport | null)?.findings ?? []).map((f) => ({ code: f.code, severity: f.severity, title: f.title })) }))
    .filter((r) => r.findings.length > 0)
}

export async function createPlanFromAnalysis(user: SessionUser, analysisId: string, metricType: MetricType | null, now: Date = new Date()): Promise<string> {
  if (user.role !== 'ATHLETE' || !canUseVideoAnalysis(user)) throw new TrainingError('NOT_ALLOWED', 'Training plans come with Pro video analysis.')
  const analysis = await db.videoAnalysis.findFirst({ where: { id: analysisId, athleteId: user.id, status: 'COMPLETE' }, select: { id: true, motionType: true, report: true } })
  if (!analysis) throw new TrainingError('NOT_FOUND', 'Analysis not found.')
  const findings = (analysis.report as KinematicReport | null)?.findings ?? []
  if (findings.length === 0) throw new TrainingError('INVALID', 'This analysis has no focus areas to work on.')
  const tracked = metricType ?? TRACKED_METRICS[analysis.motionType][0]!
  if (!TRACKED_METRICS[analysis.motionType].includes(tracked)) throw new TrainingError('INVALID', 'Choose a measurement that fits this motion.')

  const today = utcDay(now)
  const drills = (
    await db.drill.findMany({ where: { status: 'PUBLISHED', sport: MOTION_SPORT[analysis.motionType], motionTypes: { has: analysis.motionType } }, select: { id: true, title: true, motionTypes: true, focusCodes: true, status: true, licenceExpiresAt: true } })
  ).filter((d) => drillAvailable(d, today))
  const picks = pickDrills(findings, drills, analysis.motionType)
  if (picks.length === 0) throw new TrainingError('NO_DRILLS', 'Our drill library does not cover these focus areas yet. We add drills as our coaches review them.')

  const definition = METRIC_DEFINITIONS[tracked]
  const recent = await db.metric.findMany({ where: { athleteId: user.id, metricType: tracked, date: { gte: new Date(today.getTime() - TRAINING_POLICY.baselineWindowDays * DAY) } }, select: { value: true, date: true } })
  const baseline = recent.length
    ? recent.reduce((a, b) => (definition.higherIsBetter ? (Number(b.value) > Number(a.value) ? b : a) : Number(b.value) < Number(a.value) ? b : a))
    : null

  const plan = await db.$transaction(async (tx) => {
    // Starting a new plan for a motion finishes the previous one.
    await tx.trainingPlan.updateMany({ where: { athleteId: user.id, motionType: analysis.motionType, status: 'ACTIVE' }, data: { status: 'ARCHIVED', archivedAt: now } })
    return tx.trainingPlan.create({
      data: {
        athleteId: user.id,
        analysisId: analysis.id,
        motionType: analysis.motionType,
        focusCodes: picks.map((p) => p.focusCode),
        metricType: tracked,
        baselineValue: baseline?.value ?? null,
        baselineDate: baseline?.date ?? null,
        startsOn: today,
        endsOn: new Date(today.getTime() + TRAINING_POLICY.weeks * 7 * DAY),
        items: { create: picks.map((p, i) => ({ drillId: p.drillId, focusCode: p.focusCode, timesPerWeek: TRAINING_POLICY.defaultTimesPerWeek, position: i })) },
      },
      select: { id: true },
    })
  })
  await audit('training.plan_created', { actorId: user.id, targetType: 'training_plan', targetId: plan.id })
  return plan.id
}

export async function athletePlans(athleteId: string) {
  return db.trainingPlan.findMany({
    where: { athleteId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 20,
    select: { id: true, motionType: true, focusCodes: true, status: true, startsOn: true, endsOn: true, _count: { select: { items: true } } },
  })
}

/** A plan for its athlete (or a guardian or staff caller who checked access first). */
export async function planView(athleteId: string, planId: string, now: Date = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return null
  const plan = await db.trainingPlan.findFirst({
    where: { id: planId, athleteId },
    select: {
      id: true,
      motionType: true,
      focusCodes: true,
      metricType: true,
      baselineValue: true,
      baselineDate: true,
      status: true,
      startsOn: true,
      endsOn: true,
      analysisId: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          focusCode: true,
          timesPerWeek: true,
          drill: { select: { title: true, summary: true, steps: true, equipment: true, minutes: true, safetyNote: true, source: true, author: true, licensor: true, status: true, licenceExpiresAt: true } },
          logs: { orderBy: { day: 'desc' }, take: 60, select: { day: true } },
        },
      },
    },
  })
  if (!plan) return null
  const today = utcDay(now)
  const week = weekBounds(today)
  const since = plan.metricType
    ? await db.metric.findMany({ where: { athleteId, metricType: plan.metricType, date: { gte: plan.startsOn } }, orderBy: { date: 'asc' }, take: 200, select: { value: true, date: true } })
    : []
  const higherIsBetter = plan.metricType ? METRIC_DEFINITIONS[plan.metricType].higherIsBetter : true
  return {
    ...plan,
    baselineValue: plan.baselineValue === null ? null : Number(plan.baselineValue),
    today,
    items: plan.items.map((item) => {
      const available = drillAvailable(item.drill, today) || (item.drill.status === 'RETIRED' && (!item.drill.licenceExpiresAt || item.drill.licenceExpiresAt >= today))
      return {
        id: item.id,
        focusCode: item.focusCode,
        timesPerWeek: item.timesPerWeek,
        // A licensed drill whose licence ended is no longer shown, even inside an existing plan.
        drill: available ? item.drill : null,
        retired: item.drill.status === 'RETIRED',
        thisWeek: item.logs.filter((l) => l.day >= week.start && l.day <= week.end).length,
        practicedToday: item.logs.some((l) => l.day.getTime() === today.getTime()),
        total: item.logs.length,
      }
    }),
    measurements: since.map((m) => ({ date: m.date, value: Number(m.value) })),
    progress: progressSummary(plan.baselineValue === null ? null : { date: plan.baselineDate!, value: Number(plan.baselineValue) }, since.map((m) => ({ date: m.date, value: Number(m.value) })), higherIsBetter),
  }
}

/** Marks or clears today's practice of one drill. Only on the athlete's active plan, inside its dates. */
export async function togglePractice(user: SessionUser, itemId: string, now: Date = new Date()): Promise<boolean> {
  const today = utcDay(now)
  const item = await db.trainingPlanItem.findFirst({ where: { id: itemId, plan: { athleteId: user.id, status: 'ACTIVE', startsOn: { lte: today }, endsOn: { gte: today } } }, select: { id: true } })
  if (!item) throw new TrainingError('NOT_FOUND', 'This plan is not active.')
  const removed = await db.trainingLog.deleteMany({ where: { itemId, day: today } })
  if (removed.count > 0) return false
  await db.trainingLog.create({ data: { itemId, day: today } })
  return true
}

export async function archivePlan(user: SessionUser, planId: string, now: Date = new Date()): Promise<void> {
  const result = await db.trainingPlan.updateMany({ where: { id: planId, athleteId: user.id, status: 'ACTIVE' }, data: { status: 'ARCHIVED', archivedAt: now } })
  if (result.count === 0) throw new TrainingError('NOT_FOUND', 'This plan is not active.')
}

/** Sweep: archive plans two weeks after they end. */
export async function archiveFinishedPlans(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(utcDay(now).getTime() - TRAINING_POLICY.archiveAfterDays * DAY)
  return (await db.trainingPlan.updateMany({ where: { status: 'ACTIVE', endsOn: { lt: cutoff } }, data: { status: 'ARCHIVED', archivedAt: now } })).count
}
