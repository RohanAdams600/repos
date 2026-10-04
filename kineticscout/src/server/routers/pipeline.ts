import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { PipelineStatus } from '@/generated/prisma/enums'
import { parseDateOnly } from '@/lib/auth/age'
import { db } from '@/lib/db'
import { athleteProcedure, createRouter } from '@/server/trpc'

export const pipelineRouter = createRouter({
  list: athleteProcedure
    .input(z.object({ cursor: z.uuid().nullish(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db.recruitingPipeline.findMany({
        where: { athleteId: ctx.user.id },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, status: true, lastContactDate: true, college: { select: { id: true, schoolName: true, division: true, state: true } } },
      })
      const page = rows.slice(0, input.limit)
      return {
        items: page.map((r) => ({ ...r, lastContactDate: r.lastContactDate?.toISOString().slice(0, 10) ?? null })),
        nextCursor: rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      }
    }),

  add: athleteProcedure.input(z.object({ collegeId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const college = await db.collegeProgram.findUnique({ where: { id: input.collegeId }, select: { id: true } })
    if (!college) throw new TRPCError({ code: 'NOT_FOUND', message: 'Program not found.' })
    const entry = await db.recruitingPipeline.upsert({
      where: { athleteId_collegeId: { athleteId: ctx.user.id, collegeId: input.collegeId } },
      create: { athleteId: ctx.user.id, collegeId: input.collegeId, status: 'INTERESTED' },
      update: {},
      select: { id: true, status: true },
    })
    return entry
  }),

  update: athleteProcedure
    .input(
      z.object({
        id: z.uuid(),
        status: z.enum(PipelineStatus),
        lastContactDate: z
          .string()
          .refine((v) => parseDateOnly(v) !== null, 'Enter a valid date')
          .nullable()
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ownership enforced in the WHERE clause: another athlete's id updates nothing.
      const result = await db.recruitingPipeline.updateMany({
        where: { id: input.id, athleteId: ctx.user.id },
        data: {
          status: input.status,
          ...(input.lastContactDate !== undefined ? { lastContactDate: input.lastContactDate ? parseDateOnly(input.lastContactDate) : null } : {}),
        },
      })
      if (result.count === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pipeline entry not found.' })
      return { ok: true }
    }),

  remove: athleteProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db.recruitingPipeline.deleteMany({ where: { id: input.id, athleteId: ctx.user.id } })
    return { ok: true }
  }),
})
