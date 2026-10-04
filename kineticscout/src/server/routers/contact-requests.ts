import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { blockCoach, ContactError, reportCoach, respondAsAthlete } from '@/lib/coach/contact'
import { db } from '@/lib/db'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { athleteProcedure, createRouter } from '@/server/trpc'

/** The athlete's side of contact requests. */
export const contactRequestsRouter = createRouter({
  list: athleteProcedure.query(async ({ ctx }) => {
    const rows = await db.contactRequest.findMany({
      where: { athleteId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        message: true,
        createdAt: true,
        expiresAt: true,
        guardianRequired: true,
        sharedEmails: true,
        coach: { select: { userId: true, firstName: true, lastName: true, title: true, reviewedAt: true, college: { select: { schoolName: true, division: true } } } },
      },
    })
    const blocks = await db.coachBlock.findMany({ where: { athleteId: ctx.user.id }, select: { coachId: true } })
    const blocked = new Set(blocks.map((b) => b.coachId))
    // The athlete only needs to know whether contact is still shared, not the addresses themselves.
    return rows.map(({ sharedEmails, ...r }) => ({
      ...r,
      contactShared: r.status === 'ACCEPTED' && sharedEmails.length > 0,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      coach: { ...r.coach, reviewedAt: r.coach.reviewedAt?.toISOString() ?? null, blocked: blocked.has(r.coach.userId) },
    }))
  }),

  respond: athleteProcedure
    .input(z.object({ id: z.uuid(), decision: z.enum(['accept', 'decline']), block: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return { result: await respondAsAthlete(ctx.user.id, input.id, input.decision, { block: input.block }) }
      } catch (error) {
        if (error instanceof ContactError) throw new TRPCError({ code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'FORBIDDEN', message: error.message })
        throw error
      }
    }),

  block: athleteProcedure.input(z.object({ coachId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const contacted = await db.contactRequest.count({ where: { coachId: input.coachId, athleteId: ctx.user.id } })
    if (!contacted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Coach not found.' })
    await blockCoach(ctx.user.id, input.coachId)
    return { ok: true }
  }),

  unblock: athleteProcedure.input(z.object({ coachId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db.coachBlock.deleteMany({ where: { athleteId: ctx.user.id, coachId: input.coachId } })
    return { ok: true }
  }),

  report: athleteProcedure.input(z.object({ coachId: z.uuid(), reason: z.string().trim().min(10, 'Tell us what happened in a sentence or two').max(1000) })).mutation(async ({ ctx, input }) => {
    try {
      await enforceRateLimit('contact', ctx.user.id)
      await reportCoach(ctx.user.id, input.coachId, input.reason)
      return { ok: true }
    } catch (error) {
      if (error instanceof ContactError) throw new TRPCError({ code: 'FORBIDDEN', message: error.message })
      if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many reports. Try again later.' })
      throw error
    }
  }),
})
