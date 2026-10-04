import 'server-only'
import { randomBytes } from 'node:crypto'
import type { MetricType } from '@/generated/prisma/enums'
import { Prisma } from '@/generated/prisma/client'
import { parseDateOnly } from '@/lib/auth/age'
import { canJoinTeam, isTeamCoach, type SessionUser } from '@/lib/auth/permissions'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { METRIC_DEFINITIONS, isPlausibleMetricValue } from '@/lib/metrics/definitions'
import { notify } from '@/lib/notifications/service'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { sanitizeText } from '@/lib/security/sanitize'
import { isJoinCode, JOIN_CODE_ALPHABET, normalizeJoinCode, recordedByLabel, TEAM_POLICY, type TeamDetails } from '@/lib/teams/rules'

const DAY = 86_400_000

export class TeamError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'NOT_ALLOWED' | 'LIMIT' | 'INVALID' | 'CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'TeamError'
  }
}

function makeJoinCode(): string {
  return Array.from(randomBytes(10), (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join('')
}

function cleanDetails(input: TeamDetails) {
  return {
    name: sanitizeText(input.name),
    sport: input.sport,
    orgType: input.orgType,
    organization: sanitizeText(input.organization),
    state: input.state,
    coachName: sanitizeText(input.coachName),
    coachTitle: sanitizeText(input.coachTitle),
    directoryUrl: input.directoryUrl,
  }
}

async function email(to: string, subject: string, paragraphs: string[], key: string, action?: { label: string; url: string }) {
  const { text, html } = renderEmail({ paragraphs, action })
  try {
    await sendEmail({ to, subject, text, html, idempotencyKey: key })
  } catch (error) {
    logger.error(errorFields(error), 'team email failed')
  }
}

// ---------------------------------------------------------------------------------------------
// Coach: teams
// ---------------------------------------------------------------------------------------------

export async function createTeam(coach: SessionUser, input: TeamDetails): Promise<string> {
  if (!isTeamCoach(coach)) throw new TeamError('NOT_ALLOWED', 'Teams are for high school and travel coach accounts.')
  if ((await db.team.count({ where: { coachId: coach.id } })) >= TEAM_POLICY.maxTeamsPerCoach) {
    throw new TeamError('LIMIT', `One account can run up to ${TEAM_POLICY.maxTeamsPerCoach} teams.`)
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const team = await db.team.create({ data: { ...cleanDetails(input), coachId: coach.id, joinCode: makeJoinCode() }, select: { id: true } })
      await audit('team.created', { actorId: coach.id, targetType: 'team', targetId: team.id })
      return team.id
    } catch (error) {
      // A join code collision is astronomically unlikely, but retrying costs nothing.
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
  }
}

/** After a rejection the coach can correct the details and ask for another review. */
export async function resubmitTeam(coachId: string, teamId: string, input: TeamDetails): Promise<void> {
  const result = await db.team.updateMany({ where: { id: teamId, coachId, status: 'REJECTED' }, data: { ...cleanDetails(input), status: 'PENDING', reviewNote: null, reviewedAt: null, reviewedById: null } })
  if (result.count === 0) throw new TeamError('CONFLICT', 'Only a team that was not approved can be resubmitted.')
  await audit('team.resubmitted', { actorId: coachId, targetType: 'team', targetId: teamId })
}

/** A new code stops the old one working; pending requests made with it are unaffected. */
export async function regenerateJoinCode(coachId: string, teamId: string): Promise<string> {
  const joinCode = makeJoinCode()
  const result = await db.team.updateMany({ where: { id: teamId, coachId }, data: { joinCode } })
  if (result.count === 0) throw new TeamError('NOT_FOUND', 'Team not found.')
  return joinCode
}

export async function coachTeams(coachId: string) {
  const teams = await db.team.findMany({
    where: { coachId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      sport: true,
      orgType: true,
      organization: true,
      state: true,
      coachName: true,
      coachTitle: true,
      directoryUrl: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      joinCode: true,
      _count: { select: { members: { where: { status: 'ACTIVE' } } } },
    },
  })
  return teams.map(({ _count, ...t }) => ({ ...t, activeMembers: _count.members }))
}

async function ownedTeam(coachId: string, teamId: string, options: { verified?: boolean } = {}) {
  const team = await db.team.findFirst({ where: { id: teamId, coachId }, select: { id: true, name: true, sport: true, status: true, coachName: true, coachTitle: true, organization: true } })
  if (!team) throw new TeamError('NOT_FOUND', 'Team not found.')
  if (options.verified && team.status !== 'VERIFIED') throw new TeamError('NOT_ALLOWED', 'Our staff need to approve this team first.')
  return team
}

export async function teamRoster(coachId: string, teamId: string) {
  const team = await ownedTeam(coachId, teamId)
  const [members, sessions] = await Promise.all([
    db.teamMember.findMany({
      where: { teamId, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE'] } },
      orderBy: [{ status: 'asc' }, { requestedAt: 'asc' }],
      select: { id: true, status: true, requestedAt: true, athleteId: true, athlete: { select: { firstName: true, lastName: true, gradYear: true, primaryPosition: true } } },
    }),
    db.testingSession.findMany({
      where: { teamId },
      orderBy: { date: 'desc' },
      take: 50,
      select: { id: true, date: true, label: true, location: true, _count: { select: { entries: true } } },
    }),
  ])
  return { team, members, sessions: sessions.map(({ _count, ...s }) => ({ ...s, entries: _count.entries })) }
}

// ---------------------------------------------------------------------------------------------
// Staff review
// ---------------------------------------------------------------------------------------------

/**
 * Staff decisions. Suspension stops recording and joining, withdraws anything still pending and,
 * when the coach recorded misleading values, can also remove the coach-recorded label from every
 * value this team recorded (the athlete keeps the numbers as self-reported).
 */
export async function decideTeam(adminId: string, teamId: string, decision: 'VERIFIED' | 'REJECTED' | 'SUSPENDED', note: string | null, options: { revokeRecorded?: boolean } = {}): Promise<boolean> {
  const allowedFrom = decision === 'SUSPENDED' ? (['PENDING', 'VERIFIED'] as const) : (['PENDING'] as const)
  const now = new Date()
  const result = await db.team.updateMany({
    where: { id: teamId, status: { in: [...allowedFrom] } },
    data: { status: decision, reviewNote: note ? sanitizeText(note) : null, reviewedAt: now, reviewedById: adminId },
  })
  if (result.count === 0) return false
  if (decision === 'SUSPENDED') {
    await db.$transaction([
      db.teamEntry.updateMany({ where: { teamId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: now } }),
      db.teamMember.updateMany({ where: { teamId, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN'] } }, data: { status: 'DECLINED', coachDecidedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } }),
      ...(options.revokeRecorded ? [db.metric.updateMany({ where: { teamId, source: 'TEAM' }, data: { source: 'SELF', teamId: null, recordedBy: null } })] : []),
    ])
  }
  const team = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { coachId: true, name: true } })
  const action = { VERIFIED: 'team.verified', REJECTED: 'team.rejected', SUSPENDED: 'team.suspended' } as const
  await audit(action[decision], { actorId: adminId, targetType: 'team', targetId: teamId, metadata: { revokeRecorded: Boolean(options.revokeRecorded) } })
  const titles = { VERIFIED: `${team.name} is approved`, REJECTED: `${team.name} was not approved`, SUSPENDED: `${team.name} is suspended` }
  const bodies = {
    VERIFIED: 'Share your team code with your players. You approve each request before anyone joins.',
    REJECTED: note ?? 'We could not match you to the staff page you gave. You can correct the details and resubmit.',
    SUSPENDED: note ?? 'Recording and new members are paused. Contact support if you think this is a mistake.',
  }
  await notify({ userId: team.coachId, kind: 'TEAM_UPDATE', title: titles[decision], body: bodies[decision], href: '/dashboard/team', dedupeKey: `team-${decision}-${teamId}-${now.getTime()}` })
  return true
}

// ---------------------------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------------------------

/** The athlete asks to join with the code the coach gave them. The coach approves each request. */
export async function requestToJoin(athlete: SessionUser, rawCode: string): Promise<{ teamName: string }> {
  if (!canJoinTeam(athlete)) throw new TeamError('NOT_ALLOWED', 'A parent or guardian must give consent before you can join a team.')
  const code = normalizeJoinCode(rawCode)
  const team = isJoinCode(code) ? await db.team.findFirst({ where: { joinCode: code, status: 'VERIFIED' }, select: { id: true, name: true, coachId: true } }) : null
  if (!team) throw new TeamError('NOT_FOUND', 'No team uses that code. Check it with your coach.')
  const roster = await db.teamMember.count({ where: { teamId: team.id, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE'] } } })
  if (roster >= TEAM_POLICY.maxRoster) throw new TeamError('LIMIT', 'This team is full. Ask your coach.')
  try {
    await db.teamMember.create({ data: { teamId: team.id, athleteId: athlete.id, guardianRequired: athlete.ageBand === 'MINOR' } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new TeamError('CONFLICT', 'You already asked to join this team.')
    throw error
  }
  const profile = await db.athleteProfile.findUniqueOrThrow({ where: { userId: athlete.id }, select: { firstName: true, lastName: true, gradYear: true } })
  await audit('team.join_requested', { actorId: athlete.id, targetType: 'team', targetId: team.id })
  await notify({ userId: team.coachId, kind: 'TEAM_UPDATE', title: `${profile.firstName} ${profile.lastName} asked to join`, body: `Class of ${profile.gradYear}. Approve or decline on your team page.`, href: '/dashboard/team', dedupeKey: `team-join-${team.id}-${athlete.id}-${Date.now()}` })
  return { teamName: team.name }
}

export async function decideJoin(coachId: string, memberId: string, approve: boolean, now: Date = new Date()): Promise<'active' | 'awaiting-guardian' | 'declined'> {
  const member = await db.teamMember.findFirst({
    where: { id: memberId, status: 'REQUESTED', team: { coachId } },
    select: {
      teamId: true,
      athleteId: true,
      guardianRequired: true,
      team: { select: { name: true, status: true, coachName: true, coachTitle: true, organization: true } },
      athlete: { select: { firstName: true, user: { select: { guardianConsent: { select: { guardianEmail: true, status: true } } } } } },
    },
  })
  if (!member) throw new TeamError('NOT_FOUND', 'This request is no longer open.')
  if (approve && member.team.status !== 'VERIFIED') throw new TeamError('NOT_ALLOWED', 'Our staff need to approve this team first.')

  if (!approve) {
    await db.teamMember.update({ where: { id: memberId }, data: { status: 'DECLINED', coachDecidedAt: now } })
    await audit('team.join_decided', { actorId: coachId, targetType: 'team_member', targetId: memberId, metadata: { approved: false } })
    await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `Your request to join ${member.team.name} was declined`, body: 'Ask your coach if you think this is a mistake.', href: '/dashboard/teams', dedupeKey: `team-declined-${memberId}` })
    return 'declined'
  }

  if (member.guardianRequired) {
    const guardian = member.athlete.user.guardianConsent
    if (!guardian || guardian.status !== 'GRANTED') throw new TeamError('NOT_ALLOWED', 'This athlete needs a parent or guardian’s consent before joining.')
    const token = randomToken()
    await db.teamMember.update({ where: { id: memberId }, data: { status: 'AWAITING_GUARDIAN', coachDecidedAt: now, guardianTokenHash: sha256Hex(token), guardianTokenExpiresAt: new Date(now.getTime() + TEAM_POLICY.guardianLinkDays * DAY) } })
    await audit('team.join_decided', { actorId: coachId, targetType: 'team_member', targetId: memberId, metadata: { approved: true, awaitingGuardian: true } })
    await email(
      guardian.guardianEmail,
      `${member.athlete.firstName} would like to join ${member.team.name} on KineticScout`,
      [
        `${member.athlete.firstName} asked to join ${member.team.name} (${member.team.organization}), and the coach, ${member.team.coachName} (${member.team.coachTitle}), approved. KineticScout staff checked this coach against the team's public staff page.`,
        `If you approve, the coach sees ${member.athlete.firstName}'s name, class and position, and can record test results that ${member.athlete.firstName} then accepts or declines. The coach does not see ${member.athlete.firstName}'s email address or other measurements.`,
      ],
      `team-guardian-${memberId}`,
      { label: 'Review the request', url: `${env().APP_URL}/consent/guardian/team?token=${encodeURIComponent(token)}` },
    )
    await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `${member.team.name} approved your request`, body: 'We emailed your parent or guardian to approve it too.', href: '/dashboard/teams', dedupeKey: `team-approved-${memberId}` })
    return 'awaiting-guardian'
  }

  await db.teamMember.update({ where: { id: memberId }, data: { status: 'ACTIVE', coachDecidedAt: now } })
  await audit('team.join_decided', { actorId: coachId, targetType: 'team_member', targetId: memberId, metadata: { approved: true } })
  await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `You joined ${member.team.name}`, body: 'Your coach can now record test results for you to accept.', href: '/dashboard/teams', dedupeKey: `team-approved-${memberId}` })
  return 'active'
}

export async function lookupGuardianTeam(token: string, now: Date = new Date()) {
  if (token.length < 20 || token.length > 100) return null
  return db.teamMember.findFirst({
    where: { guardianTokenHash: sha256Hex(token), status: 'AWAITING_GUARDIAN', guardianTokenExpiresAt: { gt: now } },
    select: { athlete: { select: { firstName: true } }, team: { select: { name: true, sport: true, organization: true, coachName: true, coachTitle: true, reviewedAt: true } } },
  })
}

export async function guardianDecideTeam(token: string, approve: boolean, now: Date = new Date()): Promise<'approved' | 'declined' | 'invalid'> {
  if (token.length < 20 || token.length > 100) return 'invalid'
  const member = await db.teamMember.findFirst({
    where: { guardianTokenHash: sha256Hex(token), status: 'AWAITING_GUARDIAN', guardianTokenExpiresAt: { gt: now } },
    select: { id: true, athleteId: true, team: { select: { coachId: true, name: true } }, athlete: { select: { firstName: true, lastName: true, user: { select: { guardianConsent: { select: { status: true } } } } } } },
  })
  if (!member) return 'invalid'
  const granted = member.athlete.user.guardianConsent?.status === 'GRANTED'
  const status = approve && granted ? 'ACTIVE' : 'DECLINED'
  const updated = await db.teamMember.updateMany({ where: { id: member.id, status: 'AWAITING_GUARDIAN' }, data: { status, guardianRespondedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } })
  if (updated.count === 0) return 'invalid'
  await audit('team.guardian_decided', { targetType: 'team_member', targetId: member.id, metadata: { approved: status === 'ACTIVE' } })
  const name = `${member.athlete.firstName} ${member.athlete.lastName}`
  if (status === 'ACTIVE') {
    await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `You joined ${member.team.name}`, body: 'Your parent or guardian approved. Your coach can now record test results for you to accept.', href: '/dashboard/teams', dedupeKey: `team-guardian-${member.id}` })
    await notify({ userId: member.team.coachId, kind: 'TEAM_UPDATE', title: `${name} joined ${member.team.name}`, body: 'Their parent or guardian approved.', href: '/dashboard/team', dedupeKey: `team-guardian-${member.id}` })
    return 'approved'
  }
  await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `Your parent or guardian declined ${member.team.name}`, body: 'You were not added to the team.', href: '/dashboard/teams', dedupeKey: `team-guardian-${member.id}` })
  await notify({ userId: member.team.coachId, kind: 'TEAM_UPDATE', title: `${name} was not added`, body: 'Their parent or guardian did not approve.', href: '/dashboard/team', dedupeKey: `team-guardian-${member.id}` })
  return 'declined'
}

/**
 * Ends every team membership for an athlete and withdraws pending entries. Used when a guardian
 * withdraws consent. Returned as operations so the caller runs them in its own transaction.
 */
export function endTeamOperations(athleteId: string, now: Date) {
  return [
    db.teamMember.updateMany({ where: { athleteId, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE'] } }, data: { status: 'LEFT', endedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } }),
    db.teamEntry.updateMany({ where: { athleteId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: now } }),
  ]
}

export async function leaveTeam(athleteId: string, teamId: string, now: Date = new Date()): Promise<void> {
  const [ended] = await db.$transaction([
    db.teamMember.updateMany({ where: { athleteId, teamId, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE'] } }, data: { status: 'LEFT', endedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } }),
    db.teamEntry.updateMany({ where: { athleteId, teamId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: now } }),
  ])
  if (ended.count === 0) throw new TeamError('NOT_FOUND', 'You are not on this team.')
  await audit('team.member_ended', { actorId: athleteId, targetType: 'team', targetId: teamId, metadata: { by: 'athlete' } })
}

export async function removeMember(coachId: string, memberId: string, now: Date = new Date()): Promise<void> {
  const member = await db.teamMember.findFirst({ where: { id: memberId, team: { coachId }, status: { in: ['REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE'] } }, select: { teamId: true, athleteId: true, team: { select: { name: true } } } })
  if (!member) throw new TeamError('NOT_FOUND', 'This athlete is not on the team.')
  await db.$transaction([
    db.teamMember.update({ where: { id: memberId }, data: { status: 'REMOVED', endedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } }),
    db.teamEntry.updateMany({ where: { athleteId: member.athleteId, teamId: member.teamId, status: 'PENDING' }, data: { status: 'WITHDRAWN', respondedAt: now } }),
  ])
  await audit('team.member_ended', { actorId: coachId, targetType: 'team_member', targetId: memberId, metadata: { by: 'coach' } })
  await notify({ userId: member.athleteId, kind: 'TEAM_UPDATE', title: `You are no longer on ${member.team.name}`, body: 'Values you already accepted stay on your profile.', href: '/dashboard/teams', dedupeKey: `team-removed-${memberId}` })
}

// ---------------------------------------------------------------------------------------------
// Testing days
// ---------------------------------------------------------------------------------------------

export type SessionInput = { date: string; label: string; location?: string | null; entries: { athleteId: string; metricType: MetricType; value: number }[] }

/**
 * Records a testing day. Every entry is checked (active member, the team's sport, plausible value)
 * and nothing is stored unless all of them pass. Athletes are notified once each.
 */
export async function recordTestingSession(coachId: string, teamId: string, input: SessionInput, now: Date = new Date()): Promise<string> {
  const team = await ownedTeam(coachId, teamId, { verified: true })
  const date = parseDateOnly(input.date)
  const today = new Date(now.toISOString().slice(0, 10))
  if (!date || date.getTime() > today.getTime() || date.getTime() < today.getTime() - TEAM_POLICY.sessionMaxAgeDays * DAY) {
    throw new TeamError('INVALID', 'Use the date of the testing day: today or within the last year.')
  }
  if (input.entries.length === 0) throw new TeamError('INVALID', 'Enter at least one result.')
  const types = new Set(input.entries.map((e) => e.metricType))
  if (types.size > TEAM_POLICY.maxMetricsPerSession) throw new TeamError('INVALID', `Record up to ${TEAM_POLICY.maxMetricsPerSession} measurements per testing day.`)
  const seen = new Set<string>()
  for (const e of input.entries) {
    const def = METRIC_DEFINITIONS[e.metricType]
    if (def.sport !== team.sport) throw new TeamError('INVALID', `${def.label} is not a ${team.sport.toLowerCase()} measurement.`)
    if (!isPlausibleMetricValue(e.metricType, e.value)) throw new TeamError('INVALID', `${def.label} must be between ${def.min} and ${def.max} ${def.unit}.`)
    const key = `${e.athleteId}:${e.metricType}`
    if (seen.has(key)) throw new TeamError('INVALID', 'Each athlete can have one result per measurement in a testing day.')
    seen.add(key)
  }
  const athleteIds = [...new Set(input.entries.map((e) => e.athleteId))]
  const active = await db.teamMember.count({ where: { teamId, status: 'ACTIVE', athleteId: { in: athleteIds } } })
  if (active !== athleteIds.length) throw new TeamError('INVALID', 'Results can only be recorded for athletes on the team.')

  const session = await db.$transaction(async (tx) => {
    const created = await tx.testingSession.create({ data: { teamId, date, label: sanitizeText(input.label).slice(0, 120), location: input.location ? sanitizeText(input.location).slice(0, 160) : null }, select: { id: true } })
    await tx.teamEntry.createMany({ data: input.entries.map((e) => ({ sessionId: created.id, teamId, athleteId: e.athleteId, metricType: e.metricType, value: e.value })) })
    return created
  })
  await audit('team.session_recorded', { actorId: coachId, targetType: 'testing_session', targetId: session.id, metadata: { entries: input.entries.length } })
  for (const athleteId of athleteIds) {
    const count = input.entries.filter((e) => e.athleteId === athleteId).length
    await notify({
      userId: athleteId,
      kind: 'TEAM_UPDATE',
      title: `${team.coachName} recorded ${count} result${count === 1 ? '' : 's'} for you`,
      body: `${team.name}, ${input.label}. Accept the ones that are right to add them to your measurements as coach-recorded.`,
      href: '/dashboard/teams',
      dedupeKey: `team-session-${session.id}`,
    })
  }
  return session.id
}

export async function sessionDetail(coachId: string, sessionId: string) {
  const session = await db.testingSession.findFirst({
    where: { id: sessionId, team: { coachId } },
    select: {
      id: true,
      date: true,
      label: true,
      location: true,
      team: { select: { id: true, name: true } },
      entries: { orderBy: [{ athleteId: 'asc' }, { metricType: 'asc' }], select: { id: true, metricType: true, value: true, status: true, athlete: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!session) throw new TeamError('NOT_FOUND', 'Testing day not found.')
  return session
}

export async function withdrawEntry(coachId: string, entryId: string): Promise<void> {
  const result = await db.teamEntry.updateMany({ where: { id: entryId, status: 'PENDING', team: { coachId } }, data: { status: 'WITHDRAWN', respondedAt: new Date() } })
  if (result.count === 0) throw new TeamError('NOT_FOUND', 'Only a result the athlete has not answered can be withdrawn.')
}

// ---------------------------------------------------------------------------------------------
// Athlete side
// ---------------------------------------------------------------------------------------------

export async function athleteTeams(athleteId: string) {
  const [memberships, entries] = await Promise.all([
    db.teamMember.findMany({
      where: { athleteId },
      orderBy: { requestedAt: 'desc' },
      take: 30,
      select: { id: true, status: true, requestedAt: true, team: { select: { id: true, name: true, sport: true, organization: true, coachName: true, coachTitle: true, reviewedAt: true } } },
    }),
    db.teamEntry.findMany({
      where: { athleteId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, metricType: true, value: true, session: { select: { label: true, date: true, location: true } }, team: { select: { name: true, coachName: true } } },
    }),
  ])
  return { memberships, pendingEntries: entries }
}

/**
 * Accepting turns the entry into a measurement marked coach-recorded, dated on the testing day. It
 * does not count toward the free plan's monthly logging limit. Declining stores nothing.
 */
export async function respondToEntry(athlete: SessionUser, entryId: string, accept: boolean, now: Date = new Date()): Promise<'accepted' | 'declined'> {
  const entry = await db.teamEntry.findFirst({
    where: { id: entryId, athleteId: athlete.id, status: 'PENDING' },
    select: { metricType: true, value: true, teamId: true, session: { select: { label: true, date: true } }, team: { select: { coachName: true, organization: true, status: true } } },
  })
  if (!entry) throw new TeamError('NOT_FOUND', 'This result is no longer waiting for you.')
  if (!accept) {
    await db.teamEntry.updateMany({ where: { id: entryId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: now } })
    return 'declined'
  }
  if (entry.team.status !== 'VERIFIED') throw new TeamError('NOT_ALLOWED', 'This team is not active, so its results cannot be added.')
  await db.$transaction(async (tx) => {
    const claimed = await tx.teamEntry.updateMany({ where: { id: entryId, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: now } })
    if (claimed.count === 0) throw new TeamError('CONFLICT', 'This result was already answered.')
    const metric = await tx.metric.create({
      data: {
        athleteId: athlete.id,
        metricType: entry.metricType,
        value: entry.value,
        date: entry.session.date,
        source: 'TEAM',
        teamId: entry.teamId,
        recordedBy: recordedByLabel(entry.team, entry.session),
      },
      select: { id: true },
    })
    await tx.teamEntry.update({ where: { id: entryId }, data: { metricId: metric.id } })
  })
  return 'accepted'
}

/**
 * Sweep: guardian links that ran out decline the request, and requests a coach never answered close
 * after 30 days, so nothing waits forever.
 */
export async function expireTeamRequests(now: Date = new Date()): Promise<number> {
  const [guardian, coach] = await db.$transaction([
    db.teamMember.updateMany({ where: { status: 'AWAITING_GUARDIAN', guardianTokenExpiresAt: { lte: now } }, data: { status: 'DECLINED', guardianTokenHash: null, guardianTokenExpiresAt: null } }),
    db.teamMember.updateMany({ where: { status: 'REQUESTED', requestedAt: { lte: new Date(now.getTime() - 30 * DAY) } }, data: { status: 'DECLINED', coachDecidedAt: now } }),
  ])
  return guardian.count + coach.count
}
