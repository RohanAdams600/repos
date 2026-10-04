import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { scheduleDeletion } from '@/lib/account/deletion'
import { revokeConsent } from '@/lib/auth/guardian-manage'
import { blockCoach, ContactError, expireContactRequests, guardianDecideContact, reportCoach, respondAsAthlete, sendContactRequest } from '@/lib/coach/contact'
import { savedByVerifiedCoaches, saveProspect, searchProspects } from '@/lib/coach/prospects'
import { CoachVerificationError, confirmWorkEmail, decideCoach, submitCoachProfile } from '@/lib/coach/verification'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.21' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const DAY = 86_400_000
const message = 'Hello, I coach at Test State and would like to learn more about your season and your plans for next year.'

beforeEach(resetDb)

async function program() {
  return db.collegeProgram.create({ data: { schoolName: `Test State ${randomUUID().slice(0, 6)}`, division: 'D1', averageRecruitingMetrics: {}, headCoachEmail: 'head@athletics.teststate.org' }, select: { id: true } })
}

async function coachUser(): Promise<SessionUser> {
  const id = randomUUID()
  const email = `coach-${id.slice(0, 8)}@example.test`
  await db.user.create({ data: { id, email, role: 'COACH', dateOfBirth: new Date(Date.UTC(1985, 0, 1)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  return { id, email, role: 'COACH', tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: false, termsCurrent: true, deletionScheduledFor: null }
}

async function verifiedCoachUser(): Promise<SessionUser> {
  const user = await coachUser()
  const { id: collegeId } = await program()
  await db.coachProfile.create({
    data: { userId: user.id, firstName: 'Jordan', lastName: 'Lee', title: 'Assistant Coach', collegeId, workEmail: `jlee-${user.id.slice(0, 6)}@teststate.edu`, workEmailVerifiedAt: new Date(), staffDirectoryUrl: 'https://teststate.edu/staff', status: 'VERIFIED', reviewedAt: new Date() },
  })
  return user
}

async function publicAthlete(options: { minor?: boolean; consent?: 'GRANTED' | 'PENDING'; position?: 'SHORTSTOP' | 'CATCHER'; gradYear?: number } = {}) {
  const athlete = await createAthlete({ position: options.position, gradYear: options.gradYear })
  if (options.minor) {
    await db.user.update({
      where: { id: athlete.id },
      data: {
        dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 16, 0, 1)),
        guardianConsent: { create: { guardianEmail: `parent-${athlete.id.slice(0, 6)}@example.test`, tokenHash: sha256Hex(randomUUID()), status: options.consent ?? 'GRANTED', expiresAt: new Date(Date.now() + DAY) } },
      },
    })
  }
  // Publish directly so tests can also cover minors whose consent is not granted.
  await db.athleteProfile.update({ where: { userId: athlete.id }, data: { isPublic: true, publicSlug: `test-${randomToken().replace(/[^a-z]/g, '').slice(0, 8).padEnd(8, 'a')}` } })
  return athlete
}

describe('coach verification', () => {
  it('needs a school email, a confirmed inbox and a staff decision', async () => {
    const coach = await coachUser()
    const { id: collegeId } = await program()
    const input = { firstName: 'Jordan', lastName: 'Lee', title: 'Assistant Coach', collegeId, workEmail: 'jordan@gmail.com', staffDirectoryUrl: 'https://teststate.edu/staff' }
    await expect(submitCoachProfile(coach.id, input)).rejects.toBeInstanceOf(CoachVerificationError)

    // The program's own athletics domain also qualifies.
    await submitCoachProfile(coach.id, { ...input, workEmail: 'jlee@athletics.teststate.org' })
    const pending = await db.coachProfile.findUniqueOrThrow({ where: { userId: coach.id } })
    expect(pending.status).toBe('EMAIL_PENDING')

    const token = randomToken()
    await db.coachProfile.update({ where: { userId: coach.id }, data: { workEmailTokenHash: sha256Hex(token) } })
    expect(await confirmWorkEmail('not-a-real-token-value-000000')).toBe('invalid')
    expect(await confirmWorkEmail(token)).toBe('confirmed')
    expect(await confirmWorkEmail(token)).toBe('invalid')
    expect((await db.coachProfile.findUniqueOrThrow({ where: { userId: coach.id } })).status).toBe('IN_REVIEW')

    const caller = appRouter.createCaller({ user: coach, ipHash: 'test' })
    await expect(caller.coach.search({ sport: 'BASEBALL' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'FORBIDDEN')

    const admin = await createAthlete()
    expect(await decideCoach(admin.id, coach.id, 'VERIFIED', null)).toBe(true)
    expect(await decideCoach(admin.id, coach.id, 'VERIFIED', null)).toBe(false)
    expect((await caller.coach.search({ sport: 'BASEBALL' })).total).toBe(0)
  })

  it('refuses to mark a coach verified without a confirmed email (database rule)', async () => {
    const coach = await coachUser()
    const { id: collegeId } = await program()
    await expect(
      db.coachProfile.create({ data: { userId: coach.id, firstName: 'A', lastName: 'B', title: 'Coach', collegeId, status: 'VERIFIED', reviewedAt: new Date() } }),
    ).rejects.toThrow()
  })
})

describe('prospect search', () => {
  it('returns only public athletes who may be shown, honouring blocks', async () => {
    const coach = await verifiedCoachUser()
    const adult = await publicAthlete()
    const minorWithConsent = await publicAthlete({ minor: true, consent: 'GRANTED' })
    await publicAthlete({ minor: true, consent: 'PENDING' })
    const leaving = await publicAthlete()
    await scheduleDeletion(leaving.id, 'USER')
    const blocker = await publicAthlete()
    await blockCoach(blocker.id, coach.id)
    await createAthlete() // private

    const result = await searchProspects(coach.id, { sport: 'BASEBALL' })
    expect(result.results.map((r) => r.card.athleteId).sort()).toEqual([adult.id, minorWithConsent.id].sort())
    expect(result.total).toBe(2)
  })

  it('filters by position, class and measurements and sorts by best value', async () => {
    const coach = await verifiedCoachUser()
    const fast = await publicAthlete({ position: 'SHORTSTOP', gradYear: 2027 })
    const slow = await publicAthlete({ position: 'SHORTSTOP', gradYear: 2027 })
    const catcher = await publicAthlete({ position: 'CATCHER', gradYear: 2028 })
    const date = new Date()
    await db.metric.createMany({
      data: [
        { athleteId: fast.id, metricType: 'SIXTY_YARD_DASH', value: 6.6, date, verified: true },
        { athleteId: fast.id, metricType: 'EXIT_VELOCITY', value: 88, date },
        { athleteId: slow.id, metricType: 'SIXTY_YARD_DASH', value: 7.4, date },
        { athleteId: slow.id, metricType: 'EXIT_VELOCITY', value: 95, date, verified: true },
        { athleteId: catcher.id, metricType: 'EXIT_VELOCITY', value: 91, date },
      ],
    })
    const ids = async (filters: Parameters<typeof searchProspects>[1]) => (await searchProspects(coach.id, filters)).results.map((r) => r.card.athleteId)

    expect(await ids({ sport: 'BASEBALL', positions: ['CATCHER'] })).toEqual([catcher.id])
    expect(await ids({ sport: 'BASEBALL', gradYearMin: 2028 })).toEqual([catcher.id])
    // Timed event: "at most".
    expect(await ids({ sport: 'BASEBALL', metrics: [{ metricType: 'SIXTY_YARD_DASH', threshold: 7.0 }] })).toEqual([fast.id])
    expect(await ids({ sport: 'BASEBALL', metrics: [{ metricType: 'EXIT_VELOCITY', threshold: 90 }] })).toEqual(expect.arrayContaining([slow.id, catcher.id]))
    expect(await ids({ sport: 'BASEBALL', metrics: [{ metricType: 'EXIT_VELOCITY', threshold: 90 }], verifiedOnly: true })).toEqual([slow.id])
    expect(await ids({ sport: 'BASEBALL', sortBy: 'EXIT_VELOCITY' })).toEqual([slow.id, catcher.id, fast.id])
    expect(await ids({ sport: 'BASEBALL', sortBy: 'SIXTY_YARD_DASH' })).toEqual([fast.id, slow.id, catcher.id])
  })

  it('tells athletes how many verified coaches saved them, never who', async () => {
    const coach = await verifiedCoachUser()
    const athlete = await publicAthlete()
    await saveProspect(coach.id, athlete.id)
    const unverified = await coachUser()
    await db.coachProfile.create({ data: { userId: unverified.id, firstName: 'X', lastName: 'Y', title: 'Coach', status: 'IN_REVIEW' } })
    await db.savedProspect.create({ data: { coachId: unverified.id, athleteId: athlete.id } })
    expect(await savedByVerifiedCoaches(athlete.id)).toBe(1)
  })
})

describe('contact requests', () => {
  it('shares an adult athlete’s email only after they accept, one open request at a time', async () => {
    const coach = await verifiedCoachUser()
    const athlete = await publicAthlete()
    await expect(sendContactRequest(coach.id, athlete.id, { message, rulesAttested: false })).rejects.toMatchObject({ code: 'ATTESTATION' })
    await expect(sendContactRequest(coach.id, athlete.id, { message: `${message} Visit https://camp.example.com`, rulesAttested: true })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
    await expect(sendContactRequest(coach.id, athlete.id, { message: `${message} Call 555-123-4567`, rulesAttested: true })).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })

    const id = await sendContactRequest(coach.id, athlete.id, { message, rulesAttested: true })
    await expect(sendContactRequest(coach.id, athlete.id, { message, rulesAttested: true })).rejects.toMatchObject({ code: 'ALREADY_OPEN' })
    expect((await db.contactRequest.findUniqueOrThrow({ where: { id } })).sharedEmails).toEqual([])
    expect(await db.notification.count({ where: { userId: athlete.id, kind: 'CONTACT_REQUEST' } })).toBe(1)

    expect(await respondAsAthlete(athlete.id, id, 'accept')).toBe('accepted')
    const accepted = await db.contactRequest.findUniqueOrThrow({ where: { id } })
    expect(accepted).toMatchObject({ status: 'ACCEPTED', sharedEmails: [athlete.email] })
    expect(await db.notification.count({ where: { userId: coach.id, kind: 'CONTACT_UPDATE' } })).toBe(1)

    const coachView = await appRouter.createCaller({ user: coach, ipHash: 'test' }).coach.requests()
    expect(coachView[0]!.sharedEmails).toEqual([athlete.email])
  })

  it('needs a parent or guardian to approve before a minor’s details are shared', async () => {
    const coach = await verifiedCoachUser()
    const minor = await publicAthlete({ minor: true, consent: 'GRANTED' })
    const id = await sendContactRequest(coach.id, minor.id, { message, rulesAttested: true })
    expect(await respondAsAthlete(minor.id, id, 'accept')).toBe('awaiting-guardian')
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'ATHLETE_ACCEPTED', sharedEmails: [] })

    const token = randomToken()
    await db.contactRequest.update({ where: { id }, data: { guardianTokenHash: sha256Hex(token) } })
    expect(await guardianDecideContact(token, true)).toBe('approved')
    const guardianEmail = (await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor.id } })).guardianEmail
    expect((await db.contactRequest.findUniqueOrThrow({ where: { id } })).sharedEmails.sort()).toEqual([minor.email, guardianEmail].sort())
    expect(await guardianDecideContact(token, true)).toBe('invalid')

    // A guardian can also decline.
    const second = await verifiedCoachUser()
    const id2 = await sendContactRequest(second.id, minor.id, { message, rulesAttested: true })
    await respondAsAthlete(minor.id, id2, 'accept')
    const token2 = randomToken()
    await db.contactRequest.update({ where: { id: id2 }, data: { guardianTokenHash: sha256Hex(token2) } })
    expect(await guardianDecideContact(token2, false)).toBe('declined')
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id: id2 } })).toMatchObject({ status: 'DECLINED', sharedEmails: [] })
  })

  it('ends contact when an athlete blocks a coach or a guardian withdraws consent', async () => {
    // Blocking after acceptance removes the shared address from the coach's page.
    const coach = await verifiedCoachUser()
    const adult = await publicAthlete()
    const accepted = await sendContactRequest(coach.id, adult.id, { message, rulesAttested: true })
    await respondAsAthlete(adult.id, accepted, 'accept')
    await blockCoach(adult.id, coach.id)
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id: accepted } })).toMatchObject({ status: 'ACCEPTED', sharedEmails: [] })

    // A guardian withdrawing consent ends every coach's contact: approved, awaiting the guardian, and pending.
    const minor = await publicAthlete({ minor: true, consent: 'GRANTED' })
    const [first, second, third] = [await verifiedCoachUser(), await verifiedCoachUser(), await verifiedCoachUser()]
    const approved = await sendContactRequest(first.id, minor.id, { message, rulesAttested: true })
    await respondAsAthlete(minor.id, approved, 'accept')
    const token = randomToken()
    await db.contactRequest.update({ where: { id: approved }, data: { guardianTokenHash: sha256Hex(token) } })
    expect(await guardianDecideContact(token, true)).toBe('approved')
    const waiting = await sendContactRequest(second.id, minor.id, { message, rulesAttested: true })
    await respondAsAthlete(minor.id, waiting, 'accept')
    const pending = await sendContactRequest(third.id, minor.id, { message, rulesAttested: true })

    const consent = await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor.id } })
    await revokeConsent(
      { consentId: consent.id, userId: minor.id, athleteFirstName: null, status: 'GRANTED', deletionScheduledFor: null, deletionRequestedBy: null, liveSubscriptionId: null, cancelAtPeriodEnd: false },
      { cancelSubscription: false },
    )
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id: approved } })).toMatchObject({ status: 'ACCEPTED', sharedEmails: [] })
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id: waiting } })).toMatchObject({ status: 'DECLINED', guardianTokenHash: null })
    expect(await db.contactRequest.findUniqueOrThrow({ where: { id: pending } })).toMatchObject({ status: 'DECLINED' })
    expect(await guardianDecideContact(token, true)).toBe('invalid')
    const firstView = await appRouter.createCaller({ user: first, ipHash: 'test' }).coach.requests()
    expect(firstView.find((r) => r.id === approved)?.sharedEmails).toEqual([])
  })

  it('enforces the cooldown after a decline, blocking and reporting', async () => {
    const coach = await verifiedCoachUser()
    const athlete = await publicAthlete()
    const id = await sendContactRequest(coach.id, athlete.id, { message, rulesAttested: true })
    expect(await respondAsAthlete(athlete.id, id, 'decline')).toBe('declined')
    await expect(sendContactRequest(coach.id, athlete.id, { message, rulesAttested: true })).rejects.toMatchObject({ code: 'COOLDOWN' })

    const stranger = await createAthlete()
    await expect(reportCoach(stranger.id, coach.id, 'This coach messaged me inappropriately.')).rejects.toBeInstanceOf(ContactError)
    await reportCoach(athlete.id, coach.id, 'This coach messaged me inappropriately.')
    expect(await db.coachReport.count({ where: { coachId: coach.id } })).toBe(1)

    const other = await publicAthlete()
    await saveProspect(coach.id, other.id)
    await sendContactRequest(coach.id, other.id, { message, rulesAttested: true })
    await blockCoach(other.id, coach.id)
    expect(await db.savedProspect.count({ where: { coachId: coach.id, athleteId: other.id } })).toBe(0)
    expect(await db.contactRequest.count({ where: { coachId: coach.id, athleteId: other.id, status: 'PENDING' } })).toBe(0)
    await expect(saveProspect(coach.id, other.id)).rejects.toThrow()
  })

  it('withdraws open requests when a coach is suspended and expires unanswered ones', async () => {
    const coach = await verifiedCoachUser()
    const a = await publicAthlete()
    const b = await publicAthlete()
    const openId = await sendContactRequest(coach.id, a.id, { message, rulesAttested: true })
    const admin = await createAthlete()
    expect(await decideCoach(admin.id, coach.id, 'SUSPENDED', 'Reported for inappropriate messages.')).toBe(true)
    expect((await db.contactRequest.findUniqueOrThrow({ where: { id: openId } })).status).toBe('WITHDRAWN')
    await expect(sendContactRequest(coach.id, b.id, { message, rulesAttested: true })).rejects.toMatchObject({ code: 'NOT_VERIFIED' })

    const other = await verifiedCoachUser()
    const staleId = await sendContactRequest(other.id, b.id, { message, rulesAttested: true }, new Date(Date.now() - 31 * DAY))
    expect(await expireContactRequests()).toBe(1)
    expect((await db.contactRequest.findUniqueOrThrow({ where: { id: staleId } })).status).toBe('EXPIRED')
  })

  it('keeps athlete and coach endpoints apart', async () => {
    const coach = await verifiedCoachUser()
    const athlete = await publicAthlete()
    await expect(appRouter.createCaller({ user: athlete, ipHash: 'test' }).coach.search({ sport: 'BASEBALL' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'FORBIDDEN')
    await expect(appRouter.createCaller({ user: coach, ipHash: 'test' }).contactRequests.list()).rejects.toSatisfy((e: unknown) => e instanceof TRPCError)
    const id = await sendContactRequest(coach.id, athlete.id, { message, rulesAttested: true })
    const other = await createAthlete()
    await expect(appRouter.createCaller({ user: other, ipHash: 'test' }).contactRequests.respond({ id, decision: 'accept' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'NOT_FOUND')
  })
})
