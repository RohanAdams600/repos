import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { MESSAGE_POLICY } from '@/lib/messaging/rules'
import { closeThread, listThreads, MessageError, openThread, reportMessage, sendMessage, threadView, unreadMessageCount } from '@/lib/messaging/service'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { createRouter, protectedProcedure } from '@/server/trpc'

const CODES: Record<MessageError['code'], TRPCError['code']> = { NOT_FOUND: 'NOT_FOUND', NOT_ALLOWED: 'FORBIDDEN', INVALID: 'BAD_REQUEST', LIMIT: 'TOO_MANY_REQUESTS', CLOSED: 'CONFLICT' }

async function mapped<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof MessageError) throw new TRPCError({ code: CODES[error.code], message: error.message })
    if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'You are sending messages too quickly. Try again later.' })
    throw error
  }
}

/** College coaches and athletes in an accepted contact. Every call is scoped to threads the caller is part of. */
const participantProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowed = ctx.user.role === 'COACH' || (ctx.user.role === 'ATHLETE' && ctx.user.hasAthleteProfile)
  if (!allowed) throw new TRPCError({ code: 'FORBIDDEN', message: 'Messages are for athletes and college coaches.' })
  return next()
})

export const messagesRouter = createRouter({
  list: participantProcedure.query(async ({ ctx }) => (await listThreads(ctx.user.id)).map((t) => ({ ...t, lastMessageAt: t.lastMessageAt.toISOString() }))),

  unread: participantProcedure.query(async ({ ctx }) => ({ count: await unreadMessageCount(ctx.user.id) })),

  open: participantProcedure.input(z.object({ contactRequestId: z.uuid() })).mutation(({ ctx, input }) => mapped(async () => ({ threadId: await openThread(ctx.user, input.contactRequestId) }))),

  thread: participantProcedure.input(z.object({ threadId: z.uuid() })).query(({ ctx, input }) =>
    mapped(async () => {
      const view = await threadView(ctx.user, input.threadId)
      return { ...view, messages: view.messages.map((m) => ({ id: m.id, mine: m.mine, body: m.body, createdAt: m.createdAt.toISOString(), read: m.readAt !== null })) }
    }),
  ),

  send: participantProcedure.input(z.object({ threadId: z.uuid(), body: z.string().max(MESSAGE_POLICY.maxLength + 200) })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await enforceRateLimit('messageSend', ctx.user.id)
      return sendMessage(ctx.user, input.threadId, input.body)
    }),
  ),

  close: participantProcedure.input(z.object({ threadId: z.uuid() })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await closeThread(ctx.user, input.threadId)
      return { ok: true }
    }),
  ),

  report: participantProcedure.input(z.object({ messageId: z.uuid(), reason: z.string().trim().min(10, 'Tell us what is wrong in a sentence or two').max(1000) })).mutation(({ ctx, input }) =>
    mapped(async () => {
      await enforceRateLimit('messageReport', ctx.user.id)
      await reportMessage(ctx.user, input.messageId, input.reason)
      return { ok: true }
    }),
  ),
})
