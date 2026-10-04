import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { sendGuardianConsentRequest } from '@/lib/auth/guardian'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { initialFormState, type FormState } from '@/lib/forms'
import { openThread, sendMessage } from '@/lib/messaging/service'
import { createTeam, decideJoin, decideTeam, requestToJoin } from '@/lib/teams/service'
import { createAthlete, resetDb } from '../helpers/db'
import { adminId, contactRequest, guardianAccount, minorAthlete, teamCoachAccount, verifiedCollegeCoach } from '../helpers/people'

const sent: { to: string; subject: string; text: string }[] = []
vi.mock('@/lib/email/send', async (original) => ({
  ...(await original<typeof import('@/lib/email/send')>()),
  sendEmail: vi.fn(async (email: { to: string; subject: string; text: string }) => {
    sent.push(email)
  }),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.71' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
let current: SessionUser | null = null
vi.mock('@/lib/auth/session', async (original) => ({
  ...(await original<typeof import('@/lib/auth/session')>()),
  getSessionUser: async () => current,
  requireGuardian: async () => {
    if (!current || current.role !== 'GUARDIAN') throw new Error('REDIRECT /dashboard')
    return current
  },
}))

const { guardedAthlete } = await import('@/lib/auth/session')
const { familyAction } = await import('@/lib/family/actions')
const { familyOverview } = await import('@/lib/family/service')
const { guardianAccountThread } = await import('@/lib/messaging/service')
const { POST: exportRoute } = await import('@/app/api/family/[athleteId]/export/route')

beforeEach(async () => {
  await resetDb()
  sent.length = 0
  current = null
})

/** Runs the form action as `user`; a redirect (the success path) comes back as { redirect }. */
async function act(user: SessionUser, fields: Record<string, string>): Promise<FormState | { redirect: string }> {
  current = user
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  try {
    return await familyAction(initialFormState, form)
  } catch (error) {
    const match = /^REDIRECT (.+)$/.exec((error as Error).message)
    if (match) return { redirect: match[1]! }
    throw error
  }
}

async function verifiedTeam() {
  const coach = await teamCoachAccount()
  const teamId = await createTeam(coach, {
    name: 'Westlake High School Varsity Baseball',
    sport: 'BASEBALL',
    orgType: 'HIGH_SCHOOL',
    organization: 'Westlake High School',
    state: 'TX',
    coachName: 'Jordan Lee',
    coachTitle: 'Head Coach',
    directoryUrl: 'https://westlake.example.org/athletics/staff',
  })
  await decideTeam(await adminId(), teamId, 'VERIFIED', null)
  const { joinCode } = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { joinCode: true } })
  return { coach, joinCode }
}

async function awaitingGuardian(teen: SessionUser) {
  const team = await verifiedTeam()
  await requestToJoin(teen, team.joinCode)
  const member = await db.teamMember.findFirstOrThrow({ where: { athleteId: teen.id } })
  expect(await decideJoin(team.coach.id, member.id, true)).toBe('awaiting-guardian')
  return member.id
}

describe('which athletes a guardian account sees', () => {
  it('follows the address the athlete named, and nothing else', async () => {
    const parent = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email })
    const otherTeen = await minorAthlete()
    expect((await familyOverview(parent)).map((c) => c.athleteId)).toEqual([teen.id])
    expect(await guardedAthlete(parent, teen.id)).toMatchObject({ athleteId: teen.id, consentStatus: 'GRANTED' })
    expect(await guardedAthlete(parent, otherTeen.id)).toBeNull()
    expect(await guardedAthlete(parent, 'not-a-uuid')).toBeNull()
    // Other roles never act as a guardian, even for their own address.
    expect(await guardedAthlete({ ...parent, role: 'ATHLETE' }, teen.id)).toBeNull()
    // If the athlete's guardian address changes (through support), access moves with it.
    await db.guardianConsent.update({ where: { userId: teen.id }, data: { guardianEmail: 'someone-else@example.test' } })
    expect(await guardedAthlete(parent, teen.id)).toBeNull()
    expect(await familyOverview(parent)).toEqual([])
    expect(await act(parent, { athleteId: teen.id, intent: 'revoke' })).toMatchObject({ status: 'error', message: 'This athlete is not linked to your account.' })
  })
})

describe('consent from the account', () => {
  it('records consent like the emailed link, once, and allows nothing else before it', async () => {
    const parent = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email, consent: 'PENDING' })
    // The consent request also reaches the guardian's account.
    await sendGuardianConsentRequest(teen.id)
    expect(await db.notification.count({ where: { userId: parent.id, kind: 'FAMILY' } })).toBe(1)
    const { tokenHash } = await db.guardianConsent.findUniqueOrThrow({ where: { userId: teen.id } })

    expect(await act(parent, { athleteId: teen.id, intent: 'delete', confirmDelete: 'on' })).toMatchObject({ status: 'error' })
    expect(await act(parent, { athleteId: teen.id, intent: 'grant' })).toMatchObject({ status: 'error', fieldErrors: { attest: expect.any(String) } })
    expect(await act(parent, { athleteId: teen.id, intent: 'grant', attest: 'on' })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=grant` })
    const consent = await db.guardianConsent.findUniqueOrThrow({ where: { userId: teen.id } })
    expect(consent.status).toBe('GRANTED')
    // The emailed link stops working, and the confirmation with the management link is sent.
    expect(consent.tokenHash).not.toBe(tokenHash)
    expect(consent.manageTokenHash).not.toBeNull()
    expect(sent.filter((e) => e.to === parent.email && e.subject.startsWith('Consent recorded'))).toHaveLength(1)
    expect(await act(parent, { athleteId: teen.id, intent: 'grant', attest: 'on' })).toMatchObject({ status: 'error' })
    expect(await db.auditLog.count({ where: { actorId: parent.id, action: 'guardian.consent_granted' } })).toBe(1)
  })
})

describe('approvals', () => {
  it('approves a team join and a coach contact request for their own athlete only', async () => {
    const parent = await guardianAccount()
    const stranger = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email, isPublic: true })
    const memberId = await awaitingGuardian(teen)
    expect(await db.notification.count({ where: { userId: parent.id, kind: 'FAMILY' } })).toBe(1)
    expect((await familyOverview(parent))[0]).toMatchObject({ pendingTeams: 1, pendingContacts: 0 })

    // Someone else's guardian account cannot answer, and an item from another athlete is refused.
    expect(await act(stranger, { athleteId: teen.id, intent: 'team-approve', itemId: memberId })).toMatchObject({ status: 'error' })
    const otherTeen = await minorAthlete({ guardianEmail: parent.email })
    expect(await act(parent, { athleteId: otherTeen.id, intent: 'team-approve', itemId: memberId })).toMatchObject({ status: 'error' })
    expect((await db.teamMember.findUniqueOrThrow({ where: { id: memberId } })).status).toBe('AWAITING_GUARDIAN')

    expect(await act(parent, { athleteId: teen.id, intent: 'team-approve', itemId: memberId })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=team-approve` })
    expect((await db.teamMember.findUniqueOrThrow({ where: { id: memberId } })).status).toBe('ACTIVE')
    expect(await db.auditLog.count({ where: { actorId: parent.id, action: 'team.guardian_decided' } })).toBe(1)

    const coach = await verifiedCollegeCoach()
    const requestId = await contactRequest(coach, teen)
    expect(await act(parent, { athleteId: teen.id, intent: 'contact-approve', itemId: requestId })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=contact-approve` })
    const request = await db.contactRequest.findUniqueOrThrow({ where: { id: requestId } })
    expect(request.status).toBe('ACCEPTED')
    expect(request.sharedEmails.sort()).toEqual([parent.email, teen.email].sort())
  })
})

describe('conversations', () => {
  it('reads, reports and ends copied conversations, and audits each read', async () => {
    const parent = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email, isPublic: true })
    const coach = await verifiedCollegeCoach()
    const requestId = await contactRequest(coach, teen, { guardianApproves: true })
    const threadId = await openThread(coach, requestId)
    await sendMessage(coach, threadId, 'Can we talk after your season ends?')
    const message = await db.message.findFirstOrThrow({ where: { threadId } })

    const view = await guardianAccountThread(parent.id, teen.id, threadId)
    expect(view?.messages.map((m) => m.body)).toEqual(['Can we talk after your season ends?'])
    expect(await db.auditLog.count({ where: { actorId: parent.id, action: 'message.guardian_viewed' } })).toBe(1)
    // A thread id is only found under its own athlete.
    const otherTeen = await minorAthlete({ guardianEmail: parent.email })
    expect(await guardianAccountThread(parent.id, otherTeen.id, threadId)).toBeNull()

    expect(await act(parent, { athleteId: teen.id, intent: 'report', itemId: threadId, messageId: message.id, reason: 'x' })).toMatchObject({ status: 'error', fieldErrors: { reason: expect.any(String) } })
    expect(await act(parent, { athleteId: teen.id, intent: 'report', itemId: threadId, messageId: message.id, reason: 'Asked for a phone number.' })).toEqual({ redirect: `/dashboard/family/${teen.id}/messages/${threadId}?done=report` })
    expect(await db.messageReport.findFirstOrThrow({ where: { messageId: message.id } })).toMatchObject({ reporterKind: 'GUARDIAN', reporterId: parent.id })

    expect(await act(parent, { athleteId: teen.id, intent: 'close-thread', itemId: threadId })).toEqual({ redirect: `/dashboard/family/${teen.id}/messages/${threadId}?done=close-thread` })
    expect(await db.messageThread.findUniqueOrThrow({ where: { id: threadId } })).toMatchObject({ status: 'CLOSED', closedBy: 'guardian' })
  })

  it('still refuses an athlete or coach report without a reporter', async () => {
    const coach = await verifiedCollegeCoach()
    const athlete = await createAthlete()
    await db.athleteProfile.update({ where: { userId: athlete.id }, data: { isPublic: true, publicSlug: 'test-adultabc' } })
    const requestId = await contactRequest(coach, athlete)
    const threadId = await openThread(coach, requestId)
    await sendMessage(coach, threadId, 'Hello there.')
    const message = await db.message.findFirstOrThrow({ where: { threadId } })
    await expect(db.messageReport.create({ data: { messageId: message.id, reporterKind: 'ATHLETE', reporterId: null, reason: 'test' } })).rejects.toThrow()
  })
})

describe('ongoing controls', () => {
  it('withdraws and restores consent, schedules and cancels deletion, and downloads data', async () => {
    const parent = await guardianAccount()
    const teen = await minorAthlete({ guardianEmail: parent.email, isPublic: true })

    const download = (user: SessionUser, origin = env().APP_URL) => {
      current = user
      return exportRoute(new Request(`${env().APP_URL}/api/family/${teen.id}/export`, { method: 'POST', headers: { origin } }), { params: Promise.resolve({ athleteId: teen.id }) })
    }
    const ok = await download(parent)
    expect(ok.status).toBe(200)
    const data = await ok.json()
    expect(data).toMatchObject({ requestedBy: 'parent or guardian', account: { id: teen.id } })
    expect((await download(await guardianAccount())).status).toBe(404)
    expect((await download(parent, 'https://evil.example')).status).toBe(403)

    expect(await act(parent, { athleteId: teen.id, intent: 'revoke' })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=revoke` })
    expect((await db.guardianConsent.findUniqueOrThrow({ where: { userId: teen.id } })).status).toBe('REVOKED')
    expect((await db.athleteProfile.findUniqueOrThrow({ where: { userId: teen.id } })).isPublic).toBe(false)
    expect(await act(parent, { athleteId: teen.id, intent: 'regrant', attest: 'on' })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=regrant` })

    expect(await act(parent, { athleteId: teen.id, intent: 'delete' })).toMatchObject({ status: 'error', fieldErrors: { confirmDelete: expect.any(String) } })
    expect(await act(parent, { athleteId: teen.id, intent: 'delete', confirmDelete: 'on' })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=delete` })
    expect((await db.user.findUniqueOrThrow({ where: { id: teen.id } })).deletionScheduledFor).not.toBeNull()
    expect(await act(parent, { athleteId: teen.id, intent: 'cancel-deletion' })).toEqual({ redirect: `/dashboard/family/${teen.id}?done=cancel-deletion` })
    expect((await db.user.findUniqueOrThrow({ where: { id: teen.id } })).deletionScheduledFor).toBeNull()
  })
})
