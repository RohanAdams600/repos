import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAccountExport } from '@/lib/account/export'
import { cancelDeletion, deletionSubjectHash, executeDeletion, processDueDeletions, scheduleDeletion, type DeletionDeps } from '@/lib/account/deletion'
import { grantGuardianConsent } from '@/lib/auth/guardian'
import { lookupManageToken, regrantConsent, revokeConsent } from '@/lib/auth/guardian-manage'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { sendMarketingEmail } from '@/lib/email/marketing'
import { preferencesToken, setMarketingOptIn } from '@/lib/email/preferences'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { appRouter } from '@/server/routers/_app'
import { GET as unsubscribeGet, POST as unsubscribePost } from '@/app/api/email/unsubscribe/route'
import { createAthlete, resetDb } from '../helpers/db'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

const DAY = 24 * 3600_000

beforeEach(resetDb)

/** Athlete aged 15 with a guardian consent row in the given state. */
async function createMinor(status: 'PENDING' | 'GRANTED' | 'REVOKED' = 'GRANTED') {
  const id = randomUUID()
  await db.user.create({
    data: {
      id,
      email: `minor-${id.slice(0, 8)}@example.test`,
      dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)),
      termsVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      athleteProfile: { create: { firstName: 'Riley', lastName: 'Test', gradYear: 2029, primaryPosition: 'CATCHER', isPublic: status === 'GRANTED' } },
      guardianConsent: {
        create: { guardianEmail: `parent-${id.slice(0, 8)}@example.test`, tokenHash: sha256Hex(randomToken()), status, expiresAt: new Date(Date.now() + DAY), grantedAt: status === 'GRANTED' ? new Date() : null },
      },
    },
  })
  return id
}

async function issueManageToken(userId: string, expiresAt = new Date(Date.now() + 30 * DAY)): Promise<string> {
  const token = randomToken()
  await db.guardianConsent.update({ where: { userId }, data: { manageTokenHash: sha256Hex(token), manageTokenExpiresAt: expiresAt } })
  return token
}

function fakeDeps(overrides: Partial<DeletionDeps> = {}) {
  const calls: string[] = []
  const sent: string[] = []
  const deps: DeletionDeps = {
    deleteStripeCustomer: async (id) => void calls.push(`stripe:${id}`),
    deleteStoredVideos: async (userId, keys) => void calls.push(`storage:${userId}:${keys.length}`),
    deleteAuthUser: async (id) => void calls.push(`auth:${id}`),
    notify: async (to) => void sent.push(to),
    ...overrides,
  }
  return { deps, calls, sent }
}

describe('data export', () => {
  it('contains the account holder’s data and nothing about anyone else', async () => {
    const a = await createAthlete()
    const b = await createAthlete()
    const now = new Date()
    await db.metric.createMany({
      data: [
        { athleteId: a.id, metricType: 'EXIT_VELOCITY', value: 88.5, date: now },
        { athleteId: b.id, metricType: 'EXIT_VELOCITY', value: 77.7, date: now },
      ],
    })
    await db.contactMessage.createMany({
      data: [
        { name: 'A', email: a.email, topic: 'ACCOUNT', message: 'Question from A' },
        { name: 'B', email: b.email, topic: 'ACCOUNT', message: 'Question from B' },
      ],
    })

    const exported = await buildAccountExport(a.id, now)
    expect(exported.account.email).toBe(a.email)
    expect(exported.metrics).toHaveLength(1)
    expect(exported.metrics[0]!.value).toBe(88.5)
    expect(exported.contactMessages.map((m) => m.message)).toEqual(['Question from A'])

    const json = JSON.stringify(exported)
    expect(json).not.toContain(b.email)
    expect(json).not.toContain(b.id)
    expect(json).not.toContain('77.7')
    expect(json).not.toContain('Question from B')
  })
})

describe('scheduled deletion', () => {
  it('schedules 7 days out, makes the profile private, stops marketing and writes a receipt', async () => {
    const user = await createAthlete()
    await db.user.update({ where: { id: user.id }, data: { marketingEmailOptIn: true } })
    await db.athleteProfile.update({ where: { userId: user.id }, data: { isPublic: true } })
    const now = new Date('2026-10-04T12:00:00Z')

    const first = await scheduleDeletion(user.id, 'USER', now)
    expect(first.alreadyScheduled).toBe(false)
    expect(first.scheduledFor.toISOString()).toBe('2026-10-11T12:00:00.000Z')

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { athleteProfile: true } })
    expect(row.deletionScheduledFor?.toISOString()).toBe('2026-10-11T12:00:00.000Z')
    expect(row.marketingEmailOptIn).toBe(false)
    expect(row.athleteProfile?.isPublic).toBe(false)

    const receipts = await db.dataDeletionReceipt.findMany()
    expect(receipts).toHaveLength(1)
    expect(receipts[0]!.subjectHash).toBe(deletionSubjectHash(user.id))
    expect(receipts[0]!.subjectHash).not.toContain(user.id)
    expect(receipts[0]!.requestedBy).toBe('USER')

    const again = await scheduleDeletion(user.id, 'USER', new Date(now.getTime() + DAY))
    expect(again).toEqual({ scheduledFor: first.scheduledFor, alreadyScheduled: true })
    expect(await db.dataDeletionReceipt.count()).toBe(1)
  })

  it('lets the account holder cancel their own request and records the cancellation', async () => {
    const user = await createAthlete()
    await scheduleDeletion(user.id, 'USER')
    expect(await cancelDeletion(user.id, 'GUARDIAN')).toBe('user-requested')
    expect(await cancelDeletion(user.id, 'USER')).toBe('canceled')
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).deletionScheduledFor).toBeNull()
    expect((await db.dataDeletionReceipt.findFirstOrThrow()).canceledAt).not.toBeNull()
    expect(await cancelDeletion(user.id, 'USER')).toBe('not-scheduled')
  })

  it('does not let a teen cancel a deletion their guardian requested', async () => {
    const minor = await createMinor()
    await scheduleDeletion(minor, 'GUARDIAN')
    expect(await cancelDeletion(minor, 'USER')).toBe('guardian-requested')
    expect(await cancelDeletion(minor, 'GUARDIAN')).toBe('canceled')
  })

  it('refuses to turn marketing back on while deletion is pending', async () => {
    const user = await createAthlete()
    await scheduleDeletion(user.id, 'USER')
    expect(await setMarketingOptIn(user.id, true, 'settings')).toBe(false)
    expect(await setMarketingOptIn(user.id, false, 'settings')).toBe(true)
  })
})

describe('deletion execution', () => {
  it('does nothing before the window ends', async () => {
    const user = await createAthlete()
    await scheduleDeletion(user.id, 'USER')
    const { deps, calls } = fakeDeps()
    expect(await executeDeletion(user.id, deps)).toBe('not-due')
    expect(calls).toEqual([])
  })

  it('removes external data first, resumes after a failure, then deletes every row', async () => {
    const user = await createAthlete({ stripeCustomerId: 'cus_test_delete' })
    const requested = new Date('2026-10-01T00:00:00Z')
    await scheduleDeletion(user.id, 'USER', requested)
    await db.metric.create({ data: { athleteId: user.id, metricType: 'EXIT_VELOCITY', value: 90, date: requested } })
    await db.videoAnalysis.create({ data: { athleteId: user.id, motionType: 'SWING', handedness: 'RIGHT', objectKey: `videos/${user.id}/clip.mp4`, contentType: 'video/mp4', sizeBytes: 1000 } })
    await db.contactMessage.create({ data: { name: 'T', email: user.email, topic: 'ACCOUNT', message: 'hello' } })
    const due = new Date('2026-10-08T00:00:01Z')

    const failing = fakeDeps({ deleteStoredVideos: async () => { throw new Error('storage unavailable') } })
    await expect(executeDeletion(user.id, failing.deps, due)).rejects.toThrow('storage unavailable')
    expect(failing.calls).toEqual(['stripe:cus_test_delete'])
    expect((await db.dataDeletionReceipt.findFirstOrThrow()).steps).toEqual(['stripe'])
    expect(await db.user.count({ where: { id: user.id } })).toBe(1)

    const retry = fakeDeps()
    expect(await executeDeletion(user.id, retry.deps, due)).toBe('deleted')
    expect(retry.calls).toEqual([`storage:${user.id}:1`, `auth:${user.id}`])
    expect(retry.sent).toEqual([user.email])

    expect(await db.user.count({ where: { id: user.id } })).toBe(0)
    expect(await db.athleteProfile.count({ where: { userId: user.id } })).toBe(0)
    expect(await db.metric.count({ where: { athleteId: user.id } })).toBe(0)
    expect(await db.videoAnalysis.count({ where: { athleteId: user.id } })).toBe(0)
    expect(await db.contactMessage.count({ where: { email: user.email } })).toBe(0)

    const receipt = await db.dataDeletionReceipt.findFirstOrThrow()
    expect(receipt.completedAt?.toISOString()).toBe(due.toISOString())
    expect(receipt.steps).toEqual(['stripe', 'storage', 'auth', 'database'])
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: 'account.deleted' } })
    expect(audit.targetId).toBe(receipt.id)
  })

  it('notifies the guardian and processes only due accounts in the sweep', async () => {
    const minor = await createMinor()
    const notDue = await createAthlete()
    const now = new Date()
    await scheduleDeletion(minor, 'GUARDIAN', new Date(now.getTime() - 8 * DAY))
    await scheduleDeletion(notDue.id, 'USER', now)
    const guardian = (await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor } })).guardianEmail

    const { deps, sent } = fakeDeps()
    expect(await processDueDeletions(now, deps)).toEqual({ deleted: 1, failed: 0 })
    expect(sent).toContain(guardian)
    expect(await db.user.count({ where: { id: minor } })).toBe(0)
    expect(await db.guardianConsent.count({ where: { userId: minor } })).toBe(0)
    expect(await db.user.count({ where: { id: notDue.id } })).toBe(1)
  })
})

describe('guardian management', () => {
  it('issues a management link when consent is granted', async () => {
    const minor = await createMinor('PENDING')
    const consentToken = randomToken()
    await db.guardianConsent.update({ where: { userId: minor }, data: { tokenHash: sha256Hex(consentToken), expiresAt: new Date(Date.now() + DAY) } })
    expect(await grantGuardianConsent(consentToken)).toBe(true)
    const consent = await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor } })
    expect(consent.status).toBe('GRANTED')
    expect(consent.manageTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(consent.manageTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 360 * DAY)
  })

  it('withdraws consent immediately and allows it to be given again', async () => {
    const minor = await createMinor('GRANTED')
    const token = await issueManageToken(minor)
    const ctx = await lookupManageToken(token)
    expect(ctx).toMatchObject({ userId: minor, status: 'GRANTED', athleteFirstName: 'Riley', deletionScheduledFor: null })

    await revokeConsent(ctx!, { cancelSubscription: false })
    const revoked = await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor } })
    expect(revoked.status).toBe('REVOKED')
    expect(revoked.revokedAt).not.toBeNull()
    expect((await db.athleteProfile.findUniqueOrThrow({ where: { userId: minor } })).isPublic).toBe(false)
    expect(await db.auditLog.count({ where: { action: 'guardian.consent_revoked' } })).toBe(1)

    const again = await lookupManageToken(token)
    await regrantConsent(again!)
    expect((await db.guardianConsent.findUniqueOrThrow({ where: { userId: minor } })).status).toBe('GRANTED')
  })

  it('rejects expired, unknown and malformed management links', async () => {
    const minor = await createMinor()
    const expired = await issueManageToken(minor, new Date(Date.now() - 1000))
    expect(await lookupManageToken(expired)).toBeNull()
    expect(await lookupManageToken(randomToken())).toBeNull()
    expect(await lookupManageToken('short')).toBeNull()
  })
})

describe('one-click unsubscribe endpoint', () => {
  const url = (userId: string, token: string) => `http://localhost:3000/api/email/unsubscribe?u=${userId}&t=${token}`

  it('unsubscribes on POST with a valid token and records when', async () => {
    const user = await createAthlete()
    await db.user.update({ where: { id: user.id }, data: { marketingEmailOptIn: true } })
    const response = await unsubscribePost(new Request(url(user.id, preferencesToken(user.id)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(response.status).toBe(200)
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row.marketingEmailOptIn).toBe(false)
    expect(row.marketingOptInUpdatedAt).not.toBeNull()
  })

  it('rejects a token for a different user', async () => {
    const victim = await createAthlete()
    const attacker = await createAthlete()
    await db.user.update({ where: { id: victim.id }, data: { marketingEmailOptIn: true } })
    const response = await unsubscribePost(new Request(url(victim.id, preferencesToken(attacker.id)), { method: 'POST' }))
    expect(response.status).toBe(400)
    expect((await db.user.findUniqueOrThrow({ where: { id: victim.id } })).marketingEmailOptIn).toBe(true)
  })

  it('never changes anything on GET (link scanners) and redirects to the preference centre', async () => {
    const user = await createAthlete()
    await db.user.update({ where: { id: user.id }, data: { marketingEmailOptIn: true } })
    const response = unsubscribeGet(new Request(url(user.id, preferencesToken(user.id))))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/email/preferences?u=')
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).marketingEmailOptIn).toBe(true)
  })
})

describe('marketing email gate', () => {
  const message = { subject: 'News', campaignId: 'test', paragraphs: ['Hello'] }

  it('sends only to opted-in adults whose account is not closing', async () => {
    const user = await createAthlete()
    expect(await sendMarketingEmail(user.id, message)).toBe('not-opted-in')
    await db.user.update({ where: { id: user.id }, data: { marketingEmailOptIn: true } })
    expect(await sendMarketingEmail(user.id, message)).toBe('sent')
    await scheduleDeletion(user.id, 'USER')
    await db.user.update({ where: { id: user.id }, data: { marketingEmailOptIn: true } })
    expect(await sendMarketingEmail(user.id, message)).toBe('account-closing')
    expect(await sendMarketingEmail(randomUUID(), message)).toBe('no-user')
  })

  it('skips minors without guardian consent', async () => {
    const minor = await createMinor('REVOKED')
    await db.user.update({ where: { id: minor }, data: { marketingEmailOptIn: true } })
    expect(await sendMarketingEmail(minor, message)).toBe('minor-without-consent')
  })
})

describe('terms re-acceptance gate', () => {
  it('refuses API calls until the current terms are accepted', async () => {
    const user = await createAthlete()
    const outdated = { ...user, termsCurrent: false }
    await expect(appRouter.createCaller({ user: outdated, ipHash: 'test-ip' }).metrics.summary()).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'PRECONDITION_FAILED',
    )
  })
})
