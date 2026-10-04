import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { revokeConsent } from '@/lib/auth/guardian-manage'
import { blockCoach, guardianDecideContact, respondAsAthlete, sendContactRequest } from '@/lib/coach/contact'
import { decideCoach } from '@/lib/coach/verification'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import {
  closeThread,
  guardianCloseThread,
  guardianReport,
  guardianThread,
  guardianThreadToken,
  MessageError,
  messageReportQueue,
  openThread,
  purgeClosedThreads,
  reportMessage,
  resolveMessageReport,
  sendMessage,
  threadView,
  unreadMessageCount,
} from '@/lib/messaging/service'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'

const sent: { to: string; subject: string; text: string }[] = []
vi.mock('@/lib/email/send', async (original) => ({
  ...(await original<typeof import('@/lib/email/send')>()),
  sendEmail: vi.fn(async (email: { to: string; subject: string; text: string }) => {
    sent.push(email)
  }),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.41' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

beforeEach(async () => {
  await resetDb()
  sent.length = 0
})

const DAY = 86_400_000
const intro = 'Hello, I coach at Test State and would like to learn more about your season and your plans for next year.'

async function verifiedCoach(): Promise<SessionUser> {
  const id = randomUUID()
  const email = `coach-${id.slice(0, 8)}@example.test`
  await db.user.create({ data: { id, email, role: 'COACH', dateOfBirth: new Date(Date.UTC(1985, 0, 1)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  const college = await db.collegeProgram.create({ data: { schoolName: `Test State ${id.slice(0, 6)}`, division: 'D1', averageRecruitingMetrics: {} }, select: { id: true } })
  await db.coachProfile.create({
    data: { userId: id, firstName: 'Jordan', lastName: 'Lee', title: 'Assistant Coach', collegeId: college.id, workEmail: `jlee-${id.slice(0, 6)}@teststate.edu`, workEmailVerifiedAt: new Date(), staffDirectoryUrl: 'https://teststate.edu/staff', status: 'VERIFIED', reviewedAt: new Date() },
  })
  return { id, email, role: 'COACH', tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: false, termsCurrent: true, deletionScheduledFor: null }
}

async function publicAthlete(minor = false): Promise<SessionUser> {
  const a = await createAthlete()
  if (minor) {
    await db.user.update({
      where: { id: a.id },
      data: {
        dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 16, 0, 1)),
        guardianConsent: { create: { guardianEmail: `parent-${a.id.slice(0, 6)}@example.test`, tokenHash: sha256Hex(randomUUID()), status: 'GRANTED', expiresAt: new Date(Date.now() + DAY) } },
      },
    })
  }
  await db.athleteProfile.update({ where: { userId: a.id }, data: { isPublic: true, publicSlug: `test-${randomToken().replace(/[^a-z]/g, '').slice(0, 8).padEnd(8, 'a')}` } })
  return minor ? { ...a, ageBand: 'MINOR', guardianConsent: 'GRANTED' } : a
}

/** An accepted contact request, with the guardian's approval for a minor. */
async function acceptedContact(minor = false) {
  const coach = await verifiedCoach()
  const athlete = await publicAthlete(minor)
  const requestId = await sendContactRequest(coach.id, athlete.id, { message: intro, rulesAttested: true })
  if (!minor) {
    await respondAsAthlete(athlete.id, requestId, 'accept')
  } else {
    await respondAsAthlete(athlete.id, requestId, 'accept')
    const token = randomToken()
    await db.contactRequest.update({ where: { id: requestId }, data: { guardianTokenHash: sha256Hex(token) } })
    await guardianDecideContact(token, true)
  }
  return { coach, athlete, requestId }
}

describe('conversations', () => {
  it('open only after acceptance, for the two people involved', async () => {
    const coach = await verifiedCoach()
    const athlete = await publicAthlete()
    const requestId = await sendContactRequest(coach.id, athlete.id, { message: intro, rulesAttested: true })
    await expect(openThread(coach, requestId)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    await respondAsAthlete(athlete.id, requestId, 'accept')
    const threadId = await openThread(coach, requestId)
    expect(await openThread(athlete, requestId)).toBe(threadId)
    const stranger = await createAthlete()
    await expect(openThread(stranger, requestId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(threadView(stranger, threadId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('delivers, notifies and marks read, and stops a coach sending more than three messages unanswered', async () => {
    const { coach, athlete, requestId } = await acceptedContact()
    const threadId = await openThread(coach, requestId)
    await expect(sendMessage(coach, threadId, '   ')).rejects.toMatchObject({ code: 'INVALID' })
    for (let i = 1; i <= 3; i++) await sendMessage(coach, threadId, `Message ${i} from the coach.`)
    await expect(sendMessage(coach, threadId, 'A fourth one.')).rejects.toMatchObject({ code: 'LIMIT' })
    expect(await unreadMessageCount(athlete.id)).toBe(3)
    expect(await db.notification.count({ where: { userId: athlete.id, kind: 'MESSAGE' } })).toBe(3)

    const view = await threadView(athlete, threadId)
    expect(view.messages.map((m) => m.mine)).toEqual([false, false, false])
    expect(await unreadMessageCount(athlete.id)).toBe(0)
    await sendMessage(athlete, threadId, 'Thanks coach, happy to talk.')
    await expect(sendMessage(coach, threadId, 'Great, here are some dates.')).resolves.toBeTruthy()
    // No guardian is copied for an adult.
    expect(sent.filter((e) => e.subject.startsWith('Message between'))).toHaveLength(0)
    // The database refuses a message from someone outside the thread.
    const stranger = await createAthlete()
    await expect(db.message.create({ data: { threadId, senderId: stranger.id, body: 'hi' } })).rejects.toThrow(/not part of this thread/)
  })

  it('copies every message to the guardian of a minor, who can read, report and end the conversation', async () => {
    const { coach, athlete, requestId } = await acceptedContact(true)
    const threadId = await openThread(athlete, requestId)
    await sendMessage(coach, threadId, 'Can we set up a call with you and your parents?')
    await sendMessage(athlete, threadId, 'Yes, my mom will join.')
    const guardianEmail = (await db.guardianConsent.findUniqueOrThrow({ where: { userId: athlete.id } })).guardianEmail
    const copies = sent.filter((e) => e.to === guardianEmail && e.subject.startsWith('Message between'))
    expect(copies).toHaveLength(2)
    expect(copies[0]!.text).toContain('Can we set up a call with you and your parents?')
    expect(copies[0]!.text).toContain(`/consent/guardian/messages?thread=${threadId}`)

    const token = guardianThreadToken(threadId)
    expect(await guardianThread(threadId, 'not-the-token')).toBeNull()
    const view = await guardianThread(threadId, token)
    expect(view?.messages.map((m) => m.fromCoach)).toEqual([true, false])
    const coachMessage = view!.messages[0]!.id
    expect(await guardianReport(threadId, token, coachMessage, 'This made me uncomfortable.')).toBe(true)
    expect(await db.messageReport.findFirstOrThrow()).toMatchObject({ reporterKind: 'GUARDIAN', reporterId: null })
    expect(await guardianCloseThread(threadId, token)).toBe(true)
    await expect(sendMessage(coach, threadId, 'Hello?')).rejects.toMatchObject({ code: 'CLOSED' })
  })

  it('ends conversations on a block, a consent withdrawal or a coach suspension', async () => {
    const blocked = await acceptedContact()
    const t1 = await openThread(blocked.athlete, blocked.requestId)
    await blockCoach(blocked.athlete.id, blocked.coach.id)
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: t1 } })).toMatchObject({ status: 'CLOSED', closedBy: 'block' })

    const teen = await acceptedContact(true)
    const t2 = await openThread(teen.athlete, teen.requestId)
    const consent = await db.guardianConsent.findUniqueOrThrow({ where: { userId: teen.athlete.id } })
    await revokeConsent(
      { consentId: consent.id, userId: teen.athlete.id, athleteFirstName: null, status: 'GRANTED', deletionScheduledFor: null, deletionRequestedBy: null, liveSubscriptionId: null, cancelAtPeriodEnd: false },
      { cancelSubscription: false },
    )
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: t2 } })).toMatchObject({ status: 'CLOSED', closedBy: 'consent' })

    const suspended = await acceptedContact()
    const t3 = await openThread(suspended.coach, suspended.requestId)
    const staff = await createAthlete()
    await decideCoach(staff.id, suspended.coach.id, 'SUSPENDED', 'Reported behaviour.')
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: t3 } })).toMatchObject({ status: 'CLOSED', closedBy: 'suspended' })
    // Either participant can also end it themselves.
    const own = await acceptedContact()
    const t4 = await openThread(own.coach, own.requestId)
    await closeThread(own.athlete, t4)
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: t4 } })).toMatchObject({ status: 'CLOSED', closedBy: 'athlete' })
  })

  it('lets staff review a reported message in context, audits the review, and closes the thread if needed', async () => {
    const { coach, athlete, requestId } = await acceptedContact()
    const threadId = await openThread(coach, requestId)
    const { id: messageId } = await sendMessage(coach, threadId, 'Something inappropriate.')
    await expect(reportMessage(coach, messageId, 'Reporting my own message.')).rejects.toBeInstanceOf(MessageError)
    await reportMessage(athlete, messageId, 'This message was inappropriate.')

    const staff = await createAthlete()
    const queue = await messageReportQueue(staff.id)
    expect(queue).toHaveLength(1)
    expect(queue[0]!.context.map((m) => m.body)).toContain('Something inappropriate.')
    expect(await db.auditLog.count({ where: { action: 'message.staff_viewed', actorId: staff.id } })).toBe(1)
    expect(await resolveMessageReport(staff.id, queue[0]!.id, 'Coach warned and conversation ended.', { closeThread: true })).toBe(true)
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: threadId } })).toMatchObject({ status: 'CLOSED', closedBy: 'staff' })
  })

  it('deletes closed conversations after a year, unless a report is still open', async () => {
    const a = await acceptedContact()
    const b = await acceptedContact()
    const t1 = await openThread(a.coach, a.requestId)
    const t2 = await openThread(b.coach, b.requestId)
    const { id: m2 } = await sendMessage(b.coach, t2, 'Reported message.')
    await reportMessage(b.athlete, m2, 'Please review this message.')
    const longAgo = new Date(Date.now() - 400 * DAY)
    await db.messageThread.updateMany({ where: { id: { in: [t1, t2] } }, data: { status: 'CLOSED', closedBy: 'coach', closedAt: longAgo } })
    expect(await purgeClosedThreads()).toBe(1)
    expect(await db.messageThread.count({ where: { id: t1 } })).toBe(0)
    expect(await db.messageThread.count({ where: { id: t2 } })).toBe(1)
  })

  it('keeps the endpoints to athletes and college coaches', async () => {
    const { coach, requestId } = await acceptedContact()
    const teamCoachId = randomUUID()
    await db.user.create({ data: { id: teamCoachId, email: `t-${teamCoachId.slice(0, 6)}@example.test`, role: 'TEAM_COACH', dateOfBirth: new Date(Date.UTC(1980, 0, 1)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
    const teamCoach: SessionUser = { id: teamCoachId, email: 't@example.test', role: 'TEAM_COACH', tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: false, termsCurrent: true, deletionScheduledFor: null }
    await expect(appRouter.createCaller({ user: teamCoach, ipHash: 'test' }).messages.list()).rejects.toBeInstanceOf(TRPCError)
    const asCoach = appRouter.createCaller({ user: coach, ipHash: 'test' })
    const { threadId } = await asCoach.messages.open({ contactRequestId: requestId })
    await asCoach.messages.send({ threadId, body: 'Hello from the coach.' })
    expect((await asCoach.messages.list())[0]).toMatchObject({ id: threadId, preview: 'You: Hello from the coach.' })
  })
})
