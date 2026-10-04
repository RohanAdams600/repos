import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { MetricType, Position, Sport } from '@/generated/prisma/enums'
import { ContactError, sendContactRequest, withdrawContactRequest } from '@/lib/coach/contact'
import { listBoard, ProspectUnavailableError, removeProspect, saveProspect, searchProspects, updateProspectNote } from '@/lib/coach/prospects'
import { CoachVerificationError, coachProfileSchema, submitCoachProfile, verifiedCoach } from '@/lib/coach/verification'
import { db } from '@/lib/db'
import { EmailDeliveryError } from '@/lib/email/send'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { sanitizeText } from '@/lib/security/sanitize'
import { createRouter, protectedProcedure } from '@/server/trpc'

const coachRoleProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'COACH') throw new TRPCError({ code: 'FORBIDDEN', message: 'Coach tools are for coach accounts.' })
  return next()
})

/** Search, boards and contact need a staff-verified coach; checked against the database on every call. */
const verifiedCoachProcedure = coachRoleProcedure.use(async ({ ctx, next }) => {
  const coach = await verifiedCoach(ctx.user.id)
  if (!coach) throw new TRPCError({ code: 'FORBIDDEN', message: 'Your coach account must be verified first.' })
  return next({ ctx: { ...ctx, coach } })
})

const CONTACT_CODES: Record<ContactError['code'], TRPCError['code']> = {
  NOT_VERIFIED: 'FORBIDDEN',
  UNAVAILABLE: 'NOT_FOUND',
  INVALID_MESSAGE: 'BAD_REQUEST',
  ATTESTATION: 'BAD_REQUEST',
  ALREADY_OPEN: 'CONFLICT',
  COOLDOWN: 'CONFLICT',
  LIMIT: 'TOO_MANY_REQUESTS',
  NOT_FOUND: 'NOT_FOUND',
  NOT_ALLOWED: 'FORBIDDEN',
}

export const coachRouter = createRouter({
  profile: coachRoleProcedure.query(async ({ ctx }) => {
    const profile = await db.coachProfile.findUnique({
      where: { userId: ctx.user.id },
      select: { firstName: true, lastName: true, title: true, workEmail: true, staffDirectoryUrl: true, status: true, reviewNote: true, reviewedAt: true, college: { select: { id: true, schoolName: true, division: true, sport: true } } },
    })
    return profile ?? { status: 'UNSUBMITTED' as const }
  }),

  programSearch: coachRoleProcedure.input(z.object({ q: z.string().trim().min(2).max(80) })).query(({ input }) =>
    db.collegeProgram.findMany({ where: { schoolName: { contains: input.q, mode: 'insensitive' } }, orderBy: { schoolName: 'asc' }, take: 10, select: { id: true, schoolName: true, division: true, sport: true, state: true } }),
  ),

  submitProfile: coachRoleProcedure.input(coachProfileSchema).mutation(async ({ ctx, input }) => {
    try {
      await enforceRateLimit('coachVerification', ctx.user.id)
      await submitCoachProfile(ctx.user.id, input)
      return { ok: true }
    } catch (error) {
      if (error instanceof CoachVerificationError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
      if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again in an hour.' })
      if (error instanceof EmailDeliveryError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'We could not send the confirmation email. Try again in a few minutes.' })
      throw error
    }
  }),

  search: verifiedCoachProcedure
    .input(
      z.object({
        sport: z.enum(Sport),
        gradYearMin: z.number().int().min(2020).max(2045).optional(),
        gradYearMax: z.number().int().min(2020).max(2045).optional(),
        positions: z.array(z.enum(Position)).max(10).optional(),
        metrics: z.array(z.object({ metricType: z.enum(MetricType), threshold: z.number().positive().max(1000) })).max(3).optional(),
        verifiedOnly: z.boolean().default(false),
        sortBy: z.enum(MetricType).nullable().optional(),
        page: z.number().int().min(1).max(50).default(1),
      }),
    )
    .query(({ ctx, input }) => searchProspects(ctx.user.id, input)),

  board: verifiedCoachProcedure.query(({ ctx }) => listBoard(ctx.user.id)),

  save: verifiedCoachProcedure.input(z.object({ athleteId: z.uuid() })).mutation(async ({ ctx, input }) => {
    try {
      await saveProspect(ctx.user.id, input.athleteId)
      return { ok: true }
    } catch (error) {
      if (error instanceof ProspectUnavailableError) throw new TRPCError({ code: 'NOT_FOUND', message: error.message })
      throw error
    }
  }),

  note: verifiedCoachProcedure.input(z.object({ athleteId: z.uuid(), note: z.string().max(1000).nullable() })).mutation(async ({ ctx, input }) => {
    const saved = await updateProspectNote(ctx.user.id, input.athleteId, input.note ? sanitizeText(input.note) : null)
    if (!saved) throw new TRPCError({ code: 'NOT_FOUND', message: 'Save the athlete before adding a note.' })
    return { ok: true }
  }),

  unsave: verifiedCoachProcedure.input(z.object({ athleteId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await removeProspect(ctx.user.id, input.athleteId)
    return { ok: true }
  }),

  requests: verifiedCoachProcedure.query(async ({ ctx }) => {
    const rows = await db.contactRequest.findMany({
      where: { coachId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, status: true, message: true, sharedEmails: true, createdAt: true, expiresAt: true, guardianRequired: true, athlete: { select: { userId: true, firstName: true, lastName: true, gradYear: true, publicSlug: true } } },
    })
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), sharedEmails: r.status === 'ACCEPTED' ? r.sharedEmails : [] }))
  }),

  sendRequest: verifiedCoachProcedure
    .input(z.object({ athleteId: z.uuid(), message: z.string().max(2000), rulesAttested: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await enforceRateLimit('apiWrite', ctx.user.id)
        return { id: await sendContactRequest(ctx.user.id, input.athleteId, input) }
      } catch (error) {
        if (error instanceof ContactError) throw new TRPCError({ code: CONTACT_CODES[error.code], message: error.message })
        if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down and try again shortly.' })
        throw error
      }
    }),

  withdraw: verifiedCoachProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    if (!(await withdrawContactRequest(ctx.user.id, input.id))) throw new TRPCError({ code: 'NOT_FOUND', message: 'That request is no longer open.' })
    return { ok: true }
  }),
})
