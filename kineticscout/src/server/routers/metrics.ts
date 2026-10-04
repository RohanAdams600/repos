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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await logMetric(ctx.user, { metricType: input.metricType, value: input.value, date: parseDateOnly(input.date)! })
      } catch (error) {
        if (error instanceof MetricQuotaError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: `You have logged ${error.limit} metrics this month, the Free plan limit. Upgrade to Pro for unlimited logging.` })
        }
        if (error instanceof MetricValidationError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
        throw error
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
