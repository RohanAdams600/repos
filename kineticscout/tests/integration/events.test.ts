import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { blockCoach } from '@/lib/coach/contact'
import { db } from '@/lib/db'
import { eventInputSchema, utcDay } from '@/lib/events/rules'
import {
  athleteEvents,
  attendeesForCoach,
  calendar,
  cancelEvent,
  createPeriod,
  eventDetail,
  listEvents,
  periodToday,
  purgeOldEvents,
  reviewEvent,
  setAttendance,
  submitEvent,
} from '@/lib/events/service'
import { setProfileVisibility } from '@/lib/profile/public'
import { createAthlete, resetDb } from '../helpers/db'
import { adminId, guardianAccount, minorAthlete, teamCoachAccount, verifiedCollegeCoach } from '../helpers/people'

vi.mock('@/lib/email/send', async (original) => ({ ...(await original<typeof import('@/lib/email/send')>()), sendEmail: vi.fn(async () => undefined) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [] }) }))

beforeEach(resetDb)

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
function listing(daysAhead = 30, patch: Record<string, string> = {}) {
  const start = new Date(utcDay(new Date()).getTime() + daysAhead * DAY)
  return eventInputSchema(utcDay(new Date())).parse({
    name: 'Fall Prospect Showcase',
    kind: 'SHOWCASE',
    sport: 'BASEBALL',
    organizer: 'Example Baseball Events',
    officialUrl: 'https://events.example.org/fall-showcase',
    startDate: iso(start),
    endDate: iso(new Date(start.getTime() + DAY)),
    city: 'Austin',
    state: 'TX',
    description: 'Two days of defensive work, batting practice and a timed 60-yard run.',
    ...patch,
  })
}
async function adminUser(): Promise<SessionUser> {
  const id = await adminId()
  const row = await db.user.findUniqueOrThrow({ where: { id } })
  return { id, email: row.email, role: 'ADMIN', tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: true, termsCurrent: true, deletionScheduledFor: null }
}
async function publishedEvent(daysAhead = 30) {
  const admin = await adminUser()
  return { admin, id: (await submitEvent(admin, listing(daysAhead))).id }
}
async function publicAdult() {
  const a = await createAthlete()
  await setProfileVisibility(a, { isPublic: true, showGpa: false, showSchool: false })
  return a
}

describe('listings', () => {
  it('go live only after staff check them, and only adults other than athletes submit', async () => {
    const parent = await guardianAccount()
    const athlete = await createAthlete()
    await expect(submitEvent(athlete, listing())).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    const { id, status } = await submitEvent(parent, listing())
    expect(status).toBe('PENDING')
    expect(await eventDetail(id, null)).toBeNull()
    expect(await eventDetail(id, athlete)).toBeNull()
    expect(await eventDetail(id, parent)).toMatchObject({ status: 'PENDING' })
    expect((await listEvents({})).total).toBe(0)
    // The database refuses a published listing without a review on record.
    await expect(db.event.update({ where: { id }, data: { status: 'PUBLISHED' } })).rejects.toThrow()

    const admin = await adminUser()
    await reviewEvent(admin.id, id, 'PUBLISHED', null)
    await expect(reviewEvent(admin.id, id, 'REJECTED', 'again')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await listEvents({ sport: 'BASEBALL', state: 'TX' })).items.map((e) => e.id)).toEqual([id])
    expect((await listEvents({ sport: 'HOCKEY' })).total).toBe(0)
    expect(await db.notification.count({ where: { userId: parent.id, kind: 'EVENT' } })).toBe(1)
  })

  it('limits open submissions per account', async () => {
    const coach = await teamCoachAccount()
    for (let i = 0; i < 10; i++) await submitEvent(coach, listing(30 + i))
    await expect(submitEvent(coach, listing(60))).rejects.toMatchObject({ code: 'LIMIT' })
  })
})

describe('attendance', () => {
  it('is for athletes on open, listed events, and coaches see only what athletes chose to share', async () => {
    const { admin, id } = await publishedEvent()
    const shares = await publicAdult()
    const hides = await publicAdult()
    const privateAthlete = await createAthlete()
    const teenNoConsent = await minorAthlete({ consent: 'PENDING' })
    const teen = await minorAthlete({ isPublic: true })
    const blocker = await publicAdult()
    for (const a of [shares, privateAthlete, teen, blocker]) await setAttendance(a, id, { going: true, shareWithCoaches: true })
    await setAttendance(teenNoConsent, id, { going: true, shareWithCoaches: true })
    await setAttendance(hides, id, { going: true, shareWithCoaches: false })
    await expect(setAttendance(await guardianAccount(), id, { going: true, shareWithCoaches: false })).rejects.toMatchObject({ code: 'NOT_ALLOWED' })

    const coach = await verifiedCollegeCoach()
    await blockCoach(blocker.id, coach.id)
    const seen = await attendeesForCoach(coach, id)
    expect(seen?.map((a) => a.publicSlug).sort()).toEqual(
      (await db.athleteProfile.findMany({ where: { userId: { in: [shares.id, teen.id] } }, select: { publicSlug: true } })).map((p) => p.publicSlug).sort(),
    )
    // Unverified coaches and other roles see no attendees at all.
    await db.coachProfile.update({ where: { userId: coach.id }, data: { status: 'SUSPENDED' } })
    expect(await attendeesForCoach(coach, id)).toBeNull()

    expect((await athleteEvents(shares.id)).upcoming.map((r) => r.event.id)).toEqual([id])
    await setAttendance(shares, id, { going: false, shareWithCoaches: false })
    expect((await athleteEvents(shares.id)).upcoming).toEqual([])

    const pending = await submitEvent(await guardianAccount(), listing(40))
    await expect(setAttendance(shares, pending.id, { going: true, shareWithCoaches: false })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(admin.role).toBe('ADMIN')
  })

  it('tells athletes and their guardian accounts when an event is canceled', async () => {
    const { admin, id } = await publishedEvent()
    const parent = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email })
    await setAttendance(teen, id, { going: true, shareWithCoaches: false })
    await cancelEvent(admin.id, id, 'The organizer postponed it to spring.')
    expect(await db.notification.findFirstOrThrow({ where: { userId: teen.id, kind: 'EVENT' } })).toMatchObject({ body: 'The organizer postponed it to spring.' })
    expect(await db.notification.count({ where: { userId: parent.id, kind: 'FAMILY' } })).toBe(1)
    expect(await eventDetail(id, null)).toMatchObject({ status: 'CANCELED' })
    expect((await listEvents({})).total).toBe(0)
  })
})

describe('recruiting calendar', () => {
  it('keeps one period at a time per sport and division, and finds today’s', async () => {
    const admin = await adminUser()
    const today = utcDay(new Date())
    const base = { sport: 'BASEBALL' as const, division: 'D1' as const, sourceUrl: 'https://ncaa.example.org/calendar.pdf', sourceTitle: 'Test calendar (fixture)', note: null }
    await createPeriod(admin.id, { ...base, kind: 'DEAD', startDate: new Date(today.getTime() - DAY), endDate: new Date(today.getTime() + DAY) })
    await expect(createPeriod(admin.id, { ...base, kind: 'CONTACT', startDate: new Date(today.getTime() + DAY), endDate: new Date(today.getTime() + 5 * DAY) })).rejects.toMatchObject({ code: 'CONFLICT' })
    await createPeriod(admin.id, { ...base, division: 'D2', kind: 'CONTACT', startDate: today, endDate: new Date(today.getTime() + 5 * DAY) })
    expect(await periodToday('BASEBALL', 'D1')).toMatchObject({ kind: 'DEAD' })
    expect(await periodToday('BASEBALL', 'D3')).toBeNull()
    expect((await calendar({ division: 'D2' })).map((p) => p.kind)).toEqual(['CONTACT'])
  })
})

describe('retention', () => {
  it('deletes attendance a year after the event and events two years after', async () => {
    const { id } = await publishedEvent()
    const athlete = await createAthlete()
    await setAttendance(athlete, id, { going: true, shareWithCoaches: false })
    const longAgo = new Date(Date.now() - 400 * DAY)
    await db.event.update({ where: { id }, data: { startDate: longAgo, endDate: longAgo } })
    expect(await purgeOldEvents()).toBe(1)
    expect(await db.eventAttendance.count()).toBe(0)
    expect(await db.event.count()).toBe(1)
    const older = new Date(Date.now() - 800 * DAY)
    await db.event.update({ where: { id }, data: { startDate: older, endDate: older } })
    expect(await purgeOldEvents()).toBe(1)
    expect(await db.event.count()).toBe(0)
  })
})
