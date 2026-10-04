import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import type { Division, EventKind, Sport } from '@/generated/prisma/enums'
import { ageBand } from '@/lib/auth/age'
import { isAdmin, type SessionUser } from '@/lib/auth/permissions'
import { audit } from '@/lib/audit'
import { verifiedCoach } from '@/lib/coach/verification'
import { db } from '@/lib/db'
import { EVENT_POLICY, overlaps, utcDay, type EventInput, type PeriodInput } from '@/lib/events/rules'
import { notifyGuardianAccount } from '@/lib/family/notify'
import { notify } from '@/lib/notifications/service'

export class EventError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NOT_ALLOWED' | 'LIMIT' | 'CONFLICT',
    message: string,
  ) {
    super(message)
  }
}

const DAY = 86_400_000

/**
 * Adults who know the event scene submit listings: team coaches, college coaches and parents. Staff
 * publish their own directly. Athlete accounts (often under 18) do not submit listings.
 */
export function canSubmitEvent(user: SessionUser): boolean {
  return user.ageBand === 'ADULT' && (user.role === 'TEAM_COACH' || user.role === 'COACH' || user.role === 'GUARDIAN' || user.role === 'ADMIN')
}

export async function submitEvent(user: SessionUser, input: EventInput, now: Date = new Date()): Promise<{ id: string; status: 'PENDING' | 'PUBLISHED' }> {
  if (!canSubmitEvent(user)) throw new EventError('NOT_ALLOWED', 'Event listings are submitted by coaches and parents.')
  const staff = isAdmin(user)
  if (!staff) {
    const pending = await db.event.count({ where: { submittedById: user.id, status: 'PENDING' } })
    if (pending >= EVENT_POLICY.maxPendingPerSubmitter) throw new EventError('LIMIT', 'You have several listings waiting for review. Wait for those before adding more.')
  }
  const event = await db.event.create({
    data: { ...input, submittedById: user.id, status: staff ? 'PUBLISHED' : 'PENDING', ...(staff ? { reviewedById: user.id, reviewedAt: now } : {}) },
    select: { id: true, status: true },
  })
  await audit(staff ? 'event.published' : 'event.submitted', { actorId: user.id, targetType: 'event', targetId: event.id })
  return { id: event.id, status: event.status as 'PENDING' | 'PUBLISHED' }
}

export async function reviewEvent(adminId: string, eventId: string, decision: 'PUBLISHED' | 'REJECTED', note: string | null, now: Date = new Date()): Promise<void> {
  const updated = await db.event.updateMany({ where: { id: eventId, status: 'PENDING' }, data: { status: decision, reviewedById: adminId, reviewedAt: now, reviewNote: note } })
  if (updated.count === 0) throw new EventError('NOT_FOUND', 'This listing was already reviewed.')
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, submittedById: true } })
  await audit(decision === 'PUBLISHED' ? 'event.published' : 'event.rejected', { actorId: adminId, targetType: 'event', targetId: eventId })
  if (event.submittedById) {
    await notify({
      userId: event.submittedById,
      kind: 'EVENT',
      title: decision === 'PUBLISHED' ? `${event.name} is now listed` : `${event.name} was not listed`,
      body: decision === 'PUBLISHED' ? 'Thank you. Athletes can now find it on the events page.' : (note ?? 'We could not match the listing to the organizer’s page.'),
      href: decision === 'PUBLISHED' ? `/events/${eventId}` : '/events/submit',
      dedupeKey: `event-review-${eventId}`,
    })
  }
}

/** Staff correction of a listed event. Athletes who said they are going are told it changed. */
export async function updateEvent(adminId: string, eventId: string, input: EventInput): Promise<void> {
  const updated = await db.event.updateMany({ where: { id: eventId, status: 'PUBLISHED' }, data: input })
  if (updated.count === 0) throw new EventError('NOT_FOUND', 'Only listed events can be edited.')
  await audit('event.updated', { actorId: adminId, targetType: 'event', targetId: eventId })
  await notifyAttendees(eventId, `${input.name} changed`, 'The organizer’s details changed. Check the dates and location.', `event-updated-${eventId}-${Date.now()}`)
}

export async function cancelEvent(adminId: string, eventId: string, note: string | null, now: Date = new Date()): Promise<void> {
  const updated = await db.event.updateMany({ where: { id: eventId, status: { in: ['PUBLISHED', 'PENDING'] } }, data: { status: 'CANCELED', canceledAt: now, reviewNote: note, reviewedById: adminId, reviewedAt: now } })
  if (updated.count === 0) throw new EventError('NOT_FOUND', 'This event is not listed.')
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } })
  await audit('event.canceled', { actorId: adminId, targetType: 'event', targetId: eventId })
  await notifyAttendees(eventId, `${event.name} was canceled`, note ?? 'The organizer canceled this event.', `event-canceled-${eventId}`)
}

async function notifyAttendees(eventId: string, title: string, body: string, dedupeKey: string) {
  const going = await db.eventAttendance.findMany({ where: { eventId }, select: { athleteId: true }, take: 2000 })
  for (const { athleteId } of going) {
    await notify({ userId: athleteId, kind: 'EVENT', title, body, href: `/events/${eventId}`, dedupeKey })
    await notifyGuardianAccount(athleteId, { title, body, dedupeKey })
  }
}

export type EventFilters = { sport?: Sport; state?: string; kind?: EventKind; page?: number }

/** Upcoming listed events, soonest first. */
export async function listEvents(filters: EventFilters, now: Date = new Date()) {
  const page = Math.max(1, Math.min(50, filters.page ?? 1))
  const where: Prisma.EventWhereInput = {
    status: 'PUBLISHED',
    endDate: { gte: utcDay(now) },
    ...(filters.sport ? { sport: filters.sport } : {}),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
  }
  const [items, total] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * EVENT_POLICY.pageSize,
      take: EVENT_POLICY.pageSize,
      select: { id: true, name: true, kind: true, sport: true, organizer: true, startDate: true, endDate: true, city: true, state: true, gradYearMin: true, gradYearMax: true },
    }),
    db.event.count({ where }),
  ])
  return { items, total, page, pages: Math.max(1, Math.ceil(total / EVENT_POLICY.pageSize)) }
}

const eventSelect = {
  id: true,
  name: true,
  kind: true,
  sport: true,
  organizer: true,
  officialUrl: true,
  startDate: true,
  endDate: true,
  city: true,
  state: true,
  venue: true,
  gradYearMin: true,
  gradYearMax: true,
  costText: true,
  description: true,
  status: true,
  submittedById: true,
  reviewedAt: true,
  reviewNote: true,
  updatedAt: true,
} satisfies Prisma.EventSelect

/** A listed or canceled event for anyone; a pending or rejected one only for its submitter and staff. */
export async function eventDetail(eventId: string, viewer: SessionUser | null) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null
  const event = await db.event.findUnique({ where: { id: eventId }, select: eventSelect })
  if (!event) return null
  if (event.status === 'PUBLISHED' || event.status === 'CANCELED') return event
  if (viewer && (isAdmin(viewer) || viewer.id === event.submittedById)) return event
  return null
}

export async function attendanceFor(athleteId: string, eventId: string) {
  return db.eventAttendance.findUnique({ where: { eventId_athleteId: { eventId, athleteId } }, select: { shareWithCoaches: true } })
}

/** "I'm going" for an athlete, on a listed event that has not ended. */
export async function setAttendance(user: SessionUser, eventId: string, choice: { going: boolean; shareWithCoaches: boolean }, now: Date = new Date()): Promise<void> {
  if (user.role !== 'ATHLETE' || !user.hasAthleteProfile) throw new EventError('NOT_ALLOWED', 'Only athlete accounts can mark events.')
  if (!choice.going) {
    await db.eventAttendance.deleteMany({ where: { eventId, athleteId: user.id } })
    return
  }
  const event = await db.event.findFirst({ where: { id: eventId, status: 'PUBLISHED', endDate: { gte: utcDay(now) } }, select: { id: true } })
  if (!event) throw new EventError('NOT_FOUND', 'This event is not open.')
  await db.eventAttendance.upsert({
    where: { eventId_athleteId: { eventId, athleteId: user.id } },
    create: { eventId, athleteId: user.id, shareWithCoaches: choice.shareWithCoaches },
    update: { shareWithCoaches: choice.shareWithCoaches },
  })
}

/** An athlete's events: upcoming first, then the last few that ended. */
export async function athleteEvents(athleteId: string, now: Date = new Date()) {
  const rows = await db.eventAttendance.findMany({
    where: { athleteId, event: { status: { in: ['PUBLISHED', 'CANCELED'] } } },
    orderBy: { event: { startDate: 'asc' } },
    take: 100,
    select: { shareWithCoaches: true, event: { select: { id: true, name: true, kind: true, startDate: true, endDate: true, city: true, state: true, status: true } } },
  })
  const today = utcDay(now)
  return {
    upcoming: rows.filter((r) => r.event.endDate >= today),
    past: rows.filter((r) => r.event.endDate < today).slice(-10).reverse(),
  }
}

/**
 * Athletes going to an event, for a verified college coach: only those who chose to share it, whose
 * profile is publicly visible (guardian consent for under-18s), and who have not blocked this coach.
 */
export async function attendeesForCoach(coach: SessionUser, eventId: string, now: Date = new Date()) {
  if (coach.role !== 'COACH' || !(await verifiedCoach(coach.id))) return null
  const rows = await db.eventAttendance.findMany({
    where: {
      eventId,
      shareWithCoaches: true,
      event: { status: 'PUBLISHED' },
      athlete: { isPublic: true, publicSlug: { not: null }, user: { deletionScheduledFor: null }, coachBlocks: { none: { coachId: coach.id } } },
    },
    take: 500,
    select: {
      athlete: {
        select: { firstName: true, lastName: true, gradYear: true, primaryPosition: true, publicSlug: true, user: { select: { dateOfBirth: true, guardianConsent: { select: { status: true } } } } },
      },
    },
  })
  return rows
    .filter(({ athlete }) => {
      const band = ageBand(athlete.user.dateOfBirth, now)
      return band === 'ADULT' || (band === 'MINOR' && athlete.user.guardianConsent?.status === 'GRANTED')
    })
    .map(({ athlete }) => ({ firstName: athlete.firstName, lastName: athlete.lastName, gradYear: athlete.gradYear, primaryPosition: athlete.primaryPosition, publicSlug: athlete.publicSlug! }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
}

export async function mySubmissions(userId: string) {
  return db.event.findMany({ where: { submittedById: userId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, name: true, status: true, startDate: true, reviewNote: true } })
}

export async function eventReviewQueue() {
  return db.event.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50, select: { ...eventSelect, createdAt: true, submittedBy: { select: { email: true, role: true } } } })
}

export async function upcomingListedForStaff(now: Date = new Date()) {
  return db.event.findMany({ where: { status: 'PUBLISHED', endDate: { gte: utcDay(now) } }, orderBy: { startDate: 'asc' }, take: 100, select: { id: true, name: true, startDate: true, endDate: true, city: true, state: true, _count: { select: { attendance: true } } } })
}

// ---------------------------------------------------------------------------------------------
// Recruiting calendar
// ---------------------------------------------------------------------------------------------

export async function createPeriod(adminId: string, input: PeriodInput): Promise<string> {
  // One period at a time per sport and division: a new one may not overlap an existing one.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`period:${input.sport}:${input.division}`}))`
    const nearby = await tx.recruitingPeriod.findMany({ where: { sport: input.sport, division: input.division, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } }, select: { startDate: true, endDate: true } })
    if (nearby.some((p) => overlaps(p, input))) throw new EventError('CONFLICT', 'This overlaps a period already on the calendar for that sport and division.')
    const row = await tx.recruitingPeriod.create({ data: { ...input, createdById: adminId }, select: { id: true } })
    await audit('calendar.period_added', { actorId: adminId, targetType: 'recruiting_period', targetId: row.id })
    return row.id
  })
}

export async function deletePeriod(adminId: string, periodId: string): Promise<void> {
  const deleted = await db.recruitingPeriod.deleteMany({ where: { id: periodId } })
  if (deleted.count === 0) throw new EventError('NOT_FOUND', 'Period not found.')
  await audit('calendar.period_removed', { actorId: adminId, targetType: 'recruiting_period', targetId: periodId })
}

export async function calendar(filters: { sport?: Sport; division?: Division }, now: Date = new Date()) {
  return db.recruitingPeriod.findMany({
    where: { endDate: { gte: new Date(utcDay(now).getTime() - 30 * DAY) }, ...(filters.sport ? { sport: filters.sport } : {}), ...(filters.division ? { division: filters.division } : {}) },
    orderBy: [{ sport: 'asc' }, { division: 'asc' }, { startDate: 'asc' }],
    take: 300,
    select: { id: true, sport: true, division: true, kind: true, startDate: true, endDate: true, sourceUrl: true, sourceTitle: true, note: true },
  })
}

/** The period in effect today for one sport and division, if staff have entered one. */
export async function periodToday(sport: Sport, division: Division, now: Date = new Date()) {
  const today = utcDay(now)
  return db.recruitingPeriod.findFirst({ where: { sport, division, startDate: { lte: today }, endDate: { gte: today } }, select: { kind: true, startDate: true, endDate: true, sourceUrl: true, sourceTitle: true } })
}

/** Retention: attendance a year after the event, events two years after (rejected ones after 90 days). */
export async function purgeOldEvents(now: Date = new Date()): Promise<number> {
  const today = utcDay(now)
  const [attendance, events, rejected] = await db.$transaction([
    db.eventAttendance.deleteMany({ where: { event: { endDate: { lt: new Date(today.getTime() - EVENT_POLICY.attendanceRetentionDays * DAY) } } } }),
    db.event.deleteMany({ where: { endDate: { lt: new Date(today.getTime() - EVENT_POLICY.eventRetentionDays * DAY) } } }),
    db.event.deleteMany({ where: { status: 'REJECTED', reviewedAt: { lt: new Date(now.getTime() - EVENT_POLICY.rejectedRetentionDays * DAY) } } }),
  ])
  return attendance.count + events.count + rejected.count
}
