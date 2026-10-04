import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { MetricType } from '@/generated/prisma/enums'
import { parseDateOnly } from '@/lib/auth/age'
import { db } from '@/lib/db'
import { logMetric, metricSummary, MetricQuotaError, MetricValidationError } from '@/lib/metrics/service'
import { athleteProcedure, createRouter, proProcedure } from '@/server/trpc'

export const metricsRouter = createRouter({
  summary: athleteProcedure.query(({ ctx }) => metricSummary(ctx.user)),

  log: athleteProcedure
    .input(
      z.object({
        metricType: z.enum(MetricType),
        value: z.number().finite(),
        date: z.string().refine((v) => parseDateOnly(v) !== null, 'Enter a valid date'),
        /** Set by the offline outbox so a resend cannot log the same measurement twice. */
        clientRef: z.uuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await logMetric(ctx.user, { metricType: input.metricType, value: input.value, date: parseDateOnly(input.date)!, clientRef: input.clientRef })
      } catch (error) {
        if (error instanceof MetricQuotaError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: `You have logged ${error.limit} metrics this month, the Free plan limit. Upgrade to Pro for unlimited logging.` })
        }
        if (error instanceof MetricValidationError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
        throw error
      }
    }),

  /** Every logged measurement with its verification state (all plans: it is the athlete's own data). */
  entries: athleteProcedure
    .input(z.object({ cursor: z.uuid().nullish(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db.metric.findMany({
        where: { athleteId: ctx.user.id },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          metricType: true,
          value: true,
          date: true,
          verified: true,
          source: true,
          recordedBy: true,
          verification: { select: { status: true, rejectionReason: true, reviewerNote: true, reviewedAt: true } },
        },
      })
      const page = rows.slice(0, input.limit)
      return {
        items: page.map((r) => ({
          id: r.id,
          metricType: r.metricType,
          value: Number(r.value),
          date: r.date.toISOString().slice(0, 10),
          verified: r.verified,
          coachRecorded: r.source === 'TEAM',
          recordedBy: r.recordedBy,
          verification: r.verification
            ? { status: r.verification.status, rejectionReason: r.verification.rejectionReason, reviewerNote: r.verification.reviewerNote, reviewedAt: r.verification.reviewedAt?.toISOString() ?? null }
            : null,
        })),
        nextCursor: rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      }
    }),

  /** Pro: full progression history for charts, paginated by date. */
  history: proProcedure('progression')
    .input(z.object({ metricType: z.enum(MetricType), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      const rows = await db.metric.findMany({
        where: { athleteId: ctx.user.id, metricType: input.metricType },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        take: input.limit,
        select: { id: true, date: true, value: true, verified: true },
      })
      return rows.map((r) => ({ id: r.id, date: r.date.toISOString().slice(0, 10), value: Number(r.value), verified: r.verified }))
    }),
})
