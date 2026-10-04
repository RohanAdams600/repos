import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { MetricType } from '@/generated/prisma/enums'
import { canJoinTeam, isTeamCoach } from '@/lib/auth/permissions'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { teamDetailsSchema, TEAM_POLICY } from '@/lib/teams/rules'
import {
  athleteTeams,
  coachTeams,
  createTeam,
  decideJoin,
  leaveTeam,
  recordTestingSession,
  regenerateJoinCode,
  removeMember,
  requestToJoin,
  respondToEntry,
  resubmitTeam,
  sessionDetail,
  TeamError,
  teamRoster,
  withdrawEntry,
} from '@/lib/teams/service'
import { athleteProcedure, createRouter, protectedProcedure } from '@/server/trpc'

const TEAM_CODES: Record<TeamError['code'], TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  NOT_ALLOWED: 'FORBIDDEN',
  LIMIT: 'TOO_MANY_REQUESTS',
  INVALID: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
}

async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof TeamError) throw new TRPCError({ code: TEAM_CODES[error.code], message: error.message })
    if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' })
    throw error
  }
}

const teamCoachProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isTeamCoach(ctx.user)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Team tools are for high school and travel coach accounts.' })
  return next()
})

/** High school and travel coaches: their teams, rosters and testing days. Every call is scoped to the coach's own teams. */
export const teamRouter = createRouter({
  mine: teamCoachProcedure.query(({ ctx }) => coachTeams(ctx.user.id)),

  create: teamCoachProcedure.input(teamDetailsSchema).mutation(({ ctx, input }) =>
    mapped(async () => {
      await enforceRateLimit('teamCreate', ctx.user.id)
      return { id: await createTeam(ctx.user, input) }
    }),
  ),

  resubmit: teamCoachProcedure.input(teamDetailsSchema.extend({ teamId: z.uuid() })).mutation(({ ctx, input }) =>
    mapped(async () => {
      const { teamId, ...details } = input
      await resubmitTeam(ctx.user.id, teamId, details)
      return { ok: true }
    }),
  ),

  regenerateCode: teamCoachProcedure.input(z.object({ teamId: z.uuid() })).mutation(({ ctx, input }) => mapped(async () => ({ joinCode: await regenerateJoinCode(ctx.user.id, input.teamId) }))),

  roster: teamCoachProcedure.input(z.object({ teamId: z.uuid() })).query(({ ctx, input }) =>
    mapped(async () => {
      const roster = await teamRoster(ctx.user.id, input.teamId)
      return {
        ...roster,
        members: roster.members.map((m) => ({ ...m, requestedAt: m.requestedAt.toISOString() })),
        sessions: roster.sessions.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
      }
    }),
  ),

  decideJoin: teamCoachProcedure.input(z.object({ memberId: z.uuid(), approve: z.boolean() })).mutation(({ ctx, input }) => mapped(async () => ({ result: await decideJoin(ctx.user.id, input.memberId, input.approve) }))),

  removeMember: teamCoachProcedure.input(z.object({ memberId: z.uuid() })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await removeMember(ctx.user.id, input.memberId)
      return { ok: true }
    }),
  ),

  recordSession: teamCoachProcedure
    .input(
      z.object({
        teamId: z.uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of the testing day'),
        label: z.string().trim().min(3, 'Name the testing day, for example "Fall testing"').max(120),
        location: z.string().trim().max(160).nullish(),
        entries: z
          .array(z.object({ athleteId: z.uuid(), metricType: z.enum(MetricType), value: z.number().finite() }))
          .min(1, 'Enter at least one result')
          .max(TEAM_POLICY.maxRoster * TEAM_POLICY.maxMetricsPerSession),
      }),
    )
    .mutation(({ ctx, input }) => mapped(async () => ({ sessionId: await recordTestingSession(ctx.user.id, input.teamId, input) }))),

  session: teamCoachProcedure.input(z.object({ sessionId: z.uuid() })).query(({ ctx, input }) =>
    mapped(async () => {
      const s = await sessionDetail(ctx.user.id, input.sessionId)
      return { ...s, date: s.date.toISOString().slice(0, 10), entries: s.entries.map((e) => ({ ...e, value: Number(e.value) })) }
    }),
  ),

  withdrawEntry: teamCoachProcedure.input(z.object({ entryId: z.uuid() })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await withdrawEntry(ctx.user.id, input.entryId)
      return { ok: true }
    }),
  ),
})

/** Athlete side: joining with a code, leaving, and answering results a coach recorded. */
export const athleteTeamsRouter = createRouter({
  list: athleteProcedure.query(async ({ ctx }) => {
    const { memberships, pendingEntries } = await athleteTeams(ctx.user.id)
    return {
      canJoin: canJoinTeam(ctx.user),
      memberships: memberships.map((m) => ({ ...m, requestedAt: m.requestedAt.toISOString(), team: { ...m.team, reviewedAt: m.team.reviewedAt?.toISOString() ?? null } })),
      pendingEntries: pendingEntries.map((e) => ({ ...e, value: Number(e.value), session: { ...e.session, date: e.session.date.toISOString().slice(0, 10) } })),
    }
  }),

  join: athleteProcedure.input(z.object({ code: z.string().trim().min(1, 'Enter the team code').max(20) })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await enforceRateLimit('teamJoin', ctx.user.id)
      return requestToJoin(ctx.user, input.code)
    }),
  ),

  leave: athleteProcedure.input(z.object({ teamId: z.uuid() })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await leaveTeam(ctx.user.id, input.teamId)
      return { ok: true }
    }),
  ),

  respond: athleteProcedure.input(z.object({ entryId: z.uuid(), accept: z.boolean() })).mutation(({ ctx, input }) => mapped(async () => ({ result: await respondToEntry(ctx.user, input.entryId, input.accept) }))),
})
