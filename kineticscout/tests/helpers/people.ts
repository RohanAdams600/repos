import { randomUUID } from 'node:crypto'
import type { SessionUser } from '@/lib/auth/permissions'
import { respondAsAthlete, guardianDecideContact, sendContactRequest } from '@/lib/coach/contact'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { createAthlete } from './db'

const DAY = 86_400_000

function adultUser(id: string, email: string, role: SessionUser['role']): SessionUser {
  return { id, email, role, tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: false, termsCurrent: true, deletionScheduledFor: null }
}

/** A parent or guardian account with the given (lower-case) email address. */
export async function guardianAccount(email = `parent-${randomUUID().slice(0, 8)}@example.test`): Promise<SessionUser> {
  const id = randomUUID()
  await db.user.create({ data: { id, email, role: 'GUARDIAN', dateOfBirth: new Date(Date.UTC(1980, 5, 1)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  return adultUser(id, email, 'GUARDIAN')
}

/** An athlete aged 15 whose guardian consent names `guardianEmail`. */
export async function minorAthlete(options: { guardianEmail?: string; consent?: 'PENDING' | 'GRANTED' | 'REVOKED'; isPublic?: boolean } = {}): Promise<SessionUser & { guardianEmail: string }> {
  const a = await createAthlete()
  const guardianEmail = options.guardianEmail ?? `parent-${a.id.slice(0, 6)}@example.test`
  const consent = options.consent ?? 'GRANTED'
  await db.user.update({
    where: { id: a.id },
    data: {
      dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)),
      guardianConsent: { create: { guardianEmail, tokenHash: sha256Hex(randomUUID()), status: consent, grantedAt: consent === 'GRANTED' ? new Date() : null, expiresAt: new Date(Date.now() + 7 * DAY) } },
    },
  })
  if (options.isPublic) await db.athleteProfile.update({ where: { userId: a.id }, data: { isPublic: true, publicSlug: `test-${randomToken().replace(/[^a-z]/g, '').slice(0, 8).padEnd(8, 'a')}` } })
  return { ...a, ageBand: 'MINOR', guardianConsent: consent, guardianEmail }
}

export async function verifiedCollegeCoach(): Promise<SessionUser> {
  const id = randomUUID()
  const email = `coach-${id.slice(0, 8)}@example.test`
  await db.user.create({ data: { id, email, role: 'COACH', dateOfBirth: new Date(Date.UTC(1985, 0, 1)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  const college = await db.collegeProgram.create({ data: { schoolName: `Test State ${id.slice(0, 6)}`, division: 'D1', averageRecruitingMetrics: {} }, select: { id: true } })
  await db.coachProfile.create({
    data: { userId: id, firstName: 'Jordan', lastName: 'Lee', title: 'Assistant Coach', collegeId: college.id, workEmail: `jlee-${id.slice(0, 6)}@teststate.edu`, workEmailVerifiedAt: new Date(), staffDirectoryUrl: 'https://teststate.edu/staff', status: 'VERIFIED', reviewedAt: new Date() },
  })
  return adultUser(id, email, 'COACH')
}

export async function teamCoachAccount(): Promise<SessionUser> {
  const id = randomUUID()
  const email = `team-${id.slice(0, 8)}@example.test`
  await db.user.create({ data: { id, email, role: 'TEAM_COACH', dateOfBirth: new Date(Date.UTC(1983, 4, 2)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  return adultUser(id, email, 'TEAM_COACH')
}

export async function adminId(): Promise<string> {
  const a = await createAthlete()
  await db.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } })
  return a.id
}

export const COACH_INTRO = 'Hello, I coach at Test State and would like to learn more about your season and your plans for next year.'

/** A contact request the athlete accepted. For a minor it then waits for the guardian unless `guardianApproves`. */
export async function contactRequest(coach: SessionUser, athlete: SessionUser, options: { guardianApproves?: boolean } = {}) {
  const requestId = await sendContactRequest(coach.id, athlete.id, { message: COACH_INTRO, rulesAttested: true })
  await respondAsAthlete(athlete.id, requestId, 'accept')
  if (options.guardianApproves) {
    const token = randomToken()
    await db.contactRequest.update({ where: { id: requestId }, data: { guardianTokenHash: sha256Hex(token) } })
    await guardianDecideContact(token, true)
  }
  return requestId
}
