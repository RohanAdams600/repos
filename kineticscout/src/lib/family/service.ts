import 'server-only'
import { activeDeletionRequest } from '@/lib/account/deletion'
import type { SessionUser } from '@/lib/auth/permissions'
import { isGuardian } from '@/lib/auth/permissions'
import type { GuardedAthlete } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { athleteEvents } from '@/lib/events/service'
import { guardianThreadsFor } from '@/lib/messaging/service'
import { athletePlans } from '@/lib/training/service'

/**
 * Parent or guardian accounts. A guardian account lists the athletes whose guardian consent names
 * its email address (see isGuardianOf in permissions.ts). Every function here that takes an
 * athlete expects the caller to have resolved it with guardedAthlete() first.
 */

/** Consent states in which the guardian has acted on the account, so ongoing controls apply. */
export const ENGAGED: readonly ('GRANTED' | 'REVOKED')[] = ['GRANTED', 'REVOKED']

export function isEngaged(status: GuardedAthlete['consentStatus']): status is 'GRANTED' | 'REVOKED' {
  return status === 'GRANTED' || status === 'REVOKED'
}

export async function familyOverview(user: SessionUser, now: Date = new Date()) {
  if (!isGuardian(user)) return []
  const rows = await db.guardianConsent.findMany({
    where: { guardianEmail: user.email.toLowerCase(), user: { role: 'ATHLETE', athleteProfile: { isNot: null } } },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { status: true, userId: true, user: { select: { deletionScheduledFor: true, athleteProfile: { select: { firstName: true, lastName: true, gradYear: true, sport: true, isPublic: true } } } } },
  })
  return Promise.all(
    rows.map(async (row) => {
      const pending = isEngaged(row.status) ? await pendingApprovalCounts(row.userId, now) : { teams: 0, contacts: 0 }
      const profile = row.user.athleteProfile!
      return {
        athleteId: row.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        gradYear: profile.gradYear,
        sport: profile.sport,
        isPublic: profile.isPublic,
        consentStatus: row.status,
        deletionScheduledFor: row.user.deletionScheduledFor,
        pendingTeams: pending.teams,
        pendingContacts: pending.contacts,
      }
    }),
  )
}

async function pendingApprovalCounts(athleteId: string, now: Date) {
  const [teams, contacts] = await Promise.all([
    db.teamMember.count({ where: { athleteId, status: 'AWAITING_GUARDIAN', guardianTokenExpiresAt: { gt: now } } }),
    db.contactRequest.count({ where: { athleteId, status: 'ATHLETE_ACCEPTED', guardianRequired: true, guardianTokenExpiresAt: { gt: now } } }),
  ])
  return { teams, contacts }
}

export async function childDetail(athlete: GuardedAthlete, now: Date = new Date()) {
  const engaged = isEngaged(athlete.consentStatus)
  const [profile, deletion, subscription, teams, contacts, threads, teamsActive, events, plans] = await Promise.all([
    db.athleteProfile.findUniqueOrThrow({ where: { userId: athlete.athleteId }, select: { gradYear: true, sport: true, isPublic: true, highSchool: true } }),
    activeDeletionRequest(athlete.athleteId),
    db.subscription.findFirst({ where: { userId: athlete.athleteId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, select: { id: true, cancelAtPeriodEnd: true, currentPeriodEnd: true } }),
    engaged
      ? db.teamMember.findMany({
          where: { athleteId: athlete.athleteId, status: 'AWAITING_GUARDIAN', guardianTokenExpiresAt: { gt: now } },
          orderBy: { requestedAt: 'asc' },
          select: { id: true, requestedAt: true, team: { select: { name: true, sport: true, organization: true, coachName: true, coachTitle: true, reviewedAt: true } } },
        })
      : Promise.resolve([]),
    engaged
      ? db.contactRequest.findMany({
          where: { athleteId: athlete.athleteId, status: 'ATHLETE_ACCEPTED', guardianRequired: true, guardianTokenExpiresAt: { gt: now } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, message: true, createdAt: true, coach: { select: { firstName: true, lastName: true, title: true, reviewedAt: true, college: { select: { schoolName: true, division: true } } } } },
        })
      : Promise.resolve([]),
    engaged ? guardianThreadsFor(athlete.athleteId) : Promise.resolve([]),
    engaged ? db.teamMember.findMany({ where: { athleteId: athlete.athleteId, status: 'ACTIVE' }, select: { team: { select: { name: true, organization: true } } } }) : Promise.resolve([]),
    engaged ? athleteEvents(athlete.athleteId, now) : Promise.resolve({ upcoming: [], past: [] }),
    engaged ? athletePlans(athlete.athleteId) : Promise.resolve([]),
  ])
  return { ...athlete, ...profile, engaged, deletion, subscription, pendingTeams: teams, pendingContacts: contacts, threads, activeTeams: teamsActive.map((m) => m.team), events: events.upcoming, plans: plans.filter((p) => p.status === 'ACTIVE') }
}
