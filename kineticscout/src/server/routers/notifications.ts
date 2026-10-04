import { z } from 'zod'
import { db } from '@/lib/db'
import { createRouter, protectedProcedure } from '@/server/trpc'

export const notificationsRouter = createRouter({
  unreadCount: protectedProcedure.query(({ ctx }) => db.notification.count({ where: { userId: ctx.user.id, readAt: null } })),

  list: protectedProcedure
    .input(z.object({ cursor: z.uuid().nullish(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const rows = await db.notification.findMany({
        where: { userId: ctx.user.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
      })
      const page = rows.slice(0, input.limit)
      return {
        items: page.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })),
        nextCursor: rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      }
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await db.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } })
    return { updated: result.count }
  }),
})
