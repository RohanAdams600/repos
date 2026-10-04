import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { revokeConsent } from '@/lib/auth/guardian-manage'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { logMetric } from '@/lib/metrics/service'
import { buildProfileCard } from '@/lib/profile/public'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { normalizeJoinCode, formatJoinCode } from '@/lib/teams/rules'
import {
  createTeam,
  decideJoin,
  decideTeam,
  expireTeamRequests,
  guardianDecideTeam,
  leaveTeam,
  recordTestingSession,
  requestToJoin,
  respondToEntry,
  TeamError,
  teamRoster,
} from '@/lib/teams/service'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.31' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}))

beforeEach(resetDb)

const DAY = 86_400_000
const today = () => new Date().toISOString().slice(0, 10)
const details = {
  name: 'Westlake High School Varsity Baseball',
  sport: 'BASEBALL' as const,
  orgType: 'HIGH_SCHOOL' as const,
  organization: 'Westlake High School',
  state: 'TX',
  coachName: 'Jordan Lee',
  coachTitle: 'Head Coach',
  directoryUrl: 'https://westlake.example.org/athletics/staff',
}

async function teamCoach(): Promise<SessionUser> {
  const id = randomUUID()
  const email = `team-${id.slice(0, 8)}@example.test`
  await db.user.create({ data: { id, email, role: 'TEAM_COACH', dateOfBirth: new Date(Date.UTC(1983, 4, 2)), termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
  return { id, email, role: 'TEAM_COACH', tier: 'FREE', ageBand: 'ADULT', guardianConsent: 'NOT_REQUIRED', hasAthleteProfile: false, termsCurrent: true, deletionScheduledFor: null }
}

async function admin(): Promise<string> {
  const a = await createAthlete()
  await db.user.update({ where: { id: a.id }, data: { role: 'ADMIN' } })
  return a.id
}

async function verifiedTeam() {
  const coach = await teamCoach()
  const teamId = await createTeam(coach, details)
  await decideTeam(await admin(), teamId, 'VERIFIED', null)
  const { joinCode } = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { joinCode: true } })
  return { coach, teamId, joinCode }
}

async function minor(consent: 'GRANTED' | 'PENDING' = 'GRANTED'): Promise<SessionUser> {
  const a = await createAthlete()
  await db.user.update({
    where: { id: a.id },
    data: {
      dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)),
      guardianConsent: { create: { guardianEmail: `parent-${a.id.slice(0, 6)}@example.test`, tokenHash: sha256Hex(randomUUID()), status: consent, expiresAt: new Date(Date.now() + DAY) } },
    },
  })
  return { ...a, ageBand: 'MINOR', guardianConsent: consent }
}

async function activeMember(team: Awaited<ReturnType<typeof verifiedTeam>>, athlete?: SessionUser) {
  const a = athlete ?? (await createAthlete())
  await requestToJoin(a, team.joinCode)
  const member = await db.teamMember.findFirstOrThrow({ where: { teamId: team.teamId, athleteId: a.id } })
  expect(await decideJoin(team.coach.id, member.id, true)).toBe('active')
  return a
}

describe('team review and joining', () => {
  it('lets players join only teams staff approved, with the coach approving each request', async () => {
    const coach = await teamCoach()
    const teamId = await createTeam(coach, details)
    const { joinCode } = await db.team.findUniqueOrThrow({ where: { id: teamId }, select: { joinCode: true } })
    const athlete = await createAthlete()
    await expect(requestToJoin(athlete, joinCode)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // The database refuses a verified team without a recorded review.
    await expect(db.team.update({ where: { id: teamId }, data: { status: 'VERIFIED' } })).rejects.toThrow()

    await decideTeam(await admin(), teamId, 'VERIFIED', null)
    // Codes work however people type them.
    expect(normalizeJoinCode(formatJoinCode(joinCode).toUpperCase())).toBe(joinCode)
    await expect(requestToJoin(athlete, formatJoinCode(joinCode).toUpperCase())).resolves.toEqual({ teamName: details.name })
    await expect(requestToJoin(athlete, joinCode)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(requestToJoin(athlete, 'abcde-fghjk')).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const member = await db.teamMember.findFirstOrThrow({ where: { teamId, athleteId: athlete.id } })
    expect(member.status).toBe('REQUESTED')
    expect(await decideJoin(coach.id, member.id, true)).toBe('active')
    const roster = await teamRoster(coach.id, teamId)
    expect(roster.members.map((m) => m.athlete.firstName)).toHaveLength(1)
    // The roster shows name, class and position only.
    expect(Object.keys(roster.members[0]!.athlete).sort()).toEqual(['firstName', 'gradYear', 'lastName', 'primaryPosition'])
  })

  it('needs a parent or guardian to approve a minor joining, and refuses minors without consent', async () => {
    const team = await verifiedTeam()
    await expect(requestToJoin(await minor('PENDING'), team.joinCode)).rejects.toMatchObject({ code: 'NOT_ALLOWED' })

    const teen = await minor()
    await requestToJoin(teen, team.joinCode)
    const member = await db.teamMember.findFirstOrThrow({ where: { athleteId: teen.id } })
    expect(await decideJoin(team.coach.id, member.id, true)).toBe('awaiting-guardian')
    const token = randomToken()
    await db.teamMember.update({ where: { id: member.id }, data: { guardianTokenHash: sha256Hex(token) } })
    expect(await guardianDecideTeam(token, true)).toBe('approved')
    expect((await db.teamMember.findUniqueOrThrow({ where: { id: member.id } })).status).toBe('ACTIVE')
    expect(await guardianDecideTeam(token, true)).toBe('invalid')

    const other = await minor()
    await requestToJoin(other, team.joinCode)
    const m2 = await db.teamMember.findFirstOrThrow({ where: { athleteId: other.id } })
    await decideJoin(team.coach.id, m2.id, true)
    const t2 = randomToken()
    await db.teamMember.update({ where: { id: m2.id }, data: { guardianTokenHash: sha256Hex(t2) } })
    expect(await guardianDecideTeam(t2, false)).toBe('declined')
    expect((await db.teamMember.findUniqueOrThrow({ where: { id: m2.id } })).status).toBe('DECLINED')
  })
})

describe('testing days', () => {
  it('records only plausible results in the team sport for players on the roster, all or nothing', async () => {
    const team = await verifiedTeam()
    const player = await activeMember(team)
    const outsider = await createAthlete()
    const base = { date: today(), label: 'Fall testing' }
    await expect(recordTestingSession(team.coach.id, team.teamId, { ...base, entries: [{ athleteId: player.id, metricType: 'SLAPSHOT_SPEED', value: 70 }] })).rejects.toMatchObject({ code: 'INVALID' })
    await expect(recordTestingSession(team.coach.id, team.teamId, { ...base, entries: [{ athleteId: player.id, metricType: 'EXIT_VELOCITY', value: 400 }] })).rejects.toMatchObject({ code: 'INVALID' })
    await expect(
      recordTestingSession(team.coach.id, team.teamId, { ...base, entries: [{ athleteId: player.id, metricType: 'EXIT_VELOCITY', value: 88 }, { athleteId: outsider.id, metricType: 'EXIT_VELOCITY', value: 90 }] }),
    ).rejects.toMatchObject({ code: 'INVALID' })
    await expect(recordTestingSession(team.coach.id, team.teamId, { ...base, date: '2020-01-01', entries: [{ athleteId: player.id, metricType: 'EXIT_VELOCITY', value: 88 }] })).rejects.toMatchObject({ code: 'INVALID' })
    expect(await db.testingSession.count()).toBe(0)

    const other = await verifiedTeam()
    await expect(recordTestingSession(other.coach.id, team.teamId, { ...base, entries: [{ athleteId: player.id, metricType: 'EXIT_VELOCITY', value: 88 }] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('adds an accepted result as a coach-recorded measurement outside the free monthly limit', async () => {
    const team = await verifiedTeam()
    const player = await activeMember(team)
    const sessionDate = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)
    await recordTestingSession(team.coach.id, team.teamId, {
      date: sessionDate,
      label: 'Fall testing',
      entries: [
        { athleteId: player.id, metricType: 'EXIT_VELOCITY', value: 91.5 },
        { athleteId: player.id, metricType: 'SIXTY_YARD_DASH', value: 7.1 },
      ],
    })
    const [velo, dash] = await db.teamEntry.findMany({ where: { athleteId: player.id }, orderBy: { metricType: 'asc' } })
    expect(await respondToEntry(player, velo!.id, true)).toBe('accepted')
    await expect(respondToEntry(player, velo!.id, true)).rejects.toBeInstanceOf(TeamError)
    expect(await respondToEntry(player, dash!.id, false)).toBe('declined')

    const metrics = await db.metric.findMany({ where: { athleteId: player.id } })
    expect(metrics).toHaveLength(1)
    expect(metrics[0]).toMatchObject({ source: 'TEAM', teamId: team.teamId, recordedBy: `Jordan Lee, Westlake High School, Fall testing on ${sessionDate}` })
    expect(metrics[0]!.date.toISOString().slice(0, 10)).toBe(sessionDate)

    // The free plan still has all three self-logged entries this month.
    for (let i = 0; i < 3; i++) await logMetric(player, { metricType: 'POP_TIME', value: 2.0 + i / 10, date: new Date() })
    const card = await buildProfileCard(player.id, 'public')
    expect(card?.metrics.find((m) => m.metricType === 'EXIT_VELOCITY')).toMatchObject({ bestCoachRecorded: true, bestVerified: false })
    // A self-logged value cannot carry an attribution.
    await expect(db.metric.create({ data: { athleteId: player.id, metricType: 'BAT_SPEED', value: 70, date: new Date(), recordedBy: 'Someone' } })).rejects.toThrow()
  })

  it('withdraws pending results when a player leaves, and staff can strip a suspended team’s labels', async () => {
    const team = await verifiedTeam()
    const leaver = await activeMember(team)
    const stayer = await activeMember(team)
    await recordTestingSession(team.coach.id, team.teamId, {
      date: today(),
      label: 'Fall testing',
      entries: [
        { athleteId: leaver.id, metricType: 'EXIT_VELOCITY', value: 85 },
        { athleteId: stayer.id, metricType: 'EXIT_VELOCITY', value: 86 },
      ],
    })
    await leaveTeam(leaver.id, team.teamId)
    expect((await db.teamEntry.findFirstOrThrow({ where: { athleteId: leaver.id } })).status).toBe('WITHDRAWN')

    const entry = await db.teamEntry.findFirstOrThrow({ where: { athleteId: stayer.id } })
    await respondToEntry(stayer, entry.id, true)
    await decideTeam(await admin(), team.teamId, 'SUSPENDED', 'Values could not be confirmed.', { revokeRecorded: true })
    expect(await db.metric.findFirstOrThrow({ where: { athleteId: stayer.id } })).toMatchObject({ source: 'SELF', teamId: null, recordedBy: null })
    await expect(recordTestingSession(team.coach.id, team.teamId, { date: today(), label: 'Again', entries: [{ athleteId: stayer.id, metricType: 'EXIT_VELOCITY', value: 86 }] })).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
  })

  it('ends every team membership when a guardian withdraws consent', async () => {
    const team = await verifiedTeam()
    const teen = await minor()
    await requestToJoin(teen, team.joinCode)
    const member = await db.teamMember.findFirstOrThrow({ where: { athleteId: teen.id } })
    await decideJoin(team.coach.id, member.id, true)
    const token = randomToken()
    await db.teamMember.update({ where: { id: member.id }, data: { guardianTokenHash: sha256Hex(token) } })
    await guardianDecideTeam(token, true)
    await recordTestingSession(team.coach.id, team.teamId, { date: today(), label: 'Fall testing', entries: [{ athleteId: teen.id, metricType: 'EXIT_VELOCITY', value: 80 }] })

    const consent = await db.guardianConsent.findUniqueOrThrow({ where: { userId: teen.id } })
    await revokeConsent(
      { consentId: consent.id, userId: teen.id, athleteFirstName: null, status: 'GRANTED', deletionScheduledFor: null, deletionRequestedBy: null, liveSubscriptionId: null, cancelAtPeriodEnd: false },
      { cancelSubscription: false },
    )
    expect((await db.teamMember.findUniqueOrThrow({ where: { id: member.id } })).status).toBe('LEFT')
    expect((await db.teamEntry.findFirstOrThrow({ where: { athleteId: teen.id } })).status).toBe('WITHDRAWN')
  })

  it('expires guardian links that ran out and requests nobody answered', async () => {
    const team = await verifiedTeam()
    const teen = await minor()
    await requestToJoin(teen, team.joinCode)
    const member = await db.teamMember.findFirstOrThrow({ where: { athleteId: teen.id } })
    await decideJoin(team.coach.id, member.id, true)
    const stale = await createAthlete()
    await requestToJoin(stale, team.joinCode)
    await db.teamMember.updateMany({ where: { athleteId: stale.id }, data: { requestedAt: new Date(Date.now() - 31 * DAY) } })
    expect(await expireTeamRequests(new Date(Date.now() + 15 * DAY))).toBe(2)
    expect(await db.teamMember.count({ where: { status: 'DECLINED' } })).toBe(2)
  })
})

describe('team endpoints', () => {
  it('keeps coach and athlete endpoints apart', async () => {
    const team = await verifiedTeam()
    const athlete = await createAthlete()
    const asAthlete = appRouter.createCaller({ user: athlete, ipHash: 'test' })
    const asCoach = appRouter.createCaller({ user: team.coach, ipHash: 'test' })
    await expect(asAthlete.team.mine()).rejects.toBeInstanceOf(TRPCError)
    await expect(asCoach.athleteTeams.list()).rejects.toBeInstanceOf(TRPCError)
    expect(await asCoach.team.mine()).toHaveLength(1)
    await expect(asAthlete.athleteTeams.join({ code: team.joinCode })).resolves.toEqual({ teamName: details.name })
    expect((await asAthlete.athleteTeams.list()).memberships[0]).toMatchObject({ status: 'REQUESTED' })
  })
})
