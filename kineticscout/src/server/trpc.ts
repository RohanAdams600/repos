import 'server-only'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { ZodError } from 'zod'
import { BudgetExceededError } from '@/lib/ai/budget'
import { getSessionUser } from '@/lib/auth/session'
import {
  canUseMatchmaker,
  canUseVideoAnalysis,
  hasProAccess,
  isAdmin,
  type SessionUser,
} from '@/lib/auth/permissions'
import { FeatureNotConfiguredError } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { pepperedHash } from '@/lib/security/hash'
import { rateLimit } from '@/lib/security/rate-limit'
import { clientIpFrom } from '@/lib/security/request'

export async function createTrpcContext({ headers }: { headers: Headers }) {
  const user = await getSessionUser()
  return { user, ipHash: pepperedHash(clientIpFrom(headers)) }
}

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Internal errors never reach the client: no stack traces, SQL, or provider messages.
    const isInternal = error.code === 'INTERNAL_SERVER_ERROR'
    return {
      ...shape,
      message: isInternal ? 'Something went wrong on our side. Try again in a moment.' : shape.message,
      data: {
        code: shape.data.code,
        httpStatus: shape.data.httpStatus,
        fieldErrors: error.cause instanceof ZodError ? error.cause.flatten().fieldErrors : undefined,
      },
    }
  },
})

export const createRouter = t.router

/** Maps known domain errors to client-safe tRPC errors and logs the rest. */
const errorMapping = t.middleware(async ({ next, path }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    if (cause instanceof BudgetExceededError) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: cause.message, cause })
    }
    if (cause instanceof FeatureNotConfiguredError) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This feature is temporarily unavailable.', cause })
    }
    if (result.error.code === 'INTERNAL_SERVER_ERROR') logger.error({ path, ...errorFields(cause ?? result.error) }, 'trpc procedure failed')
  }
  return result
})

/** Per-caller rate limits: reads and writes have separate budgets. */
const rateLimited = t.middleware(async ({ ctx, type, next }) => {
  const key = ctx.user ? `u:${ctx.user.id}` : `ip:${ctx.ipHash}`
  const result = await rateLimit(type === 'mutation' ? 'apiWrite' : 'apiRead', key)
  if (!result.success) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Slow down and try again shortly.' })
  return next()
})

export const publicProcedure = t.procedure.use(errorMapping).use(rateLimited)

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' })
  return next({ ctx: { ...ctx, user: ctx.user as SessionUser } })
})

export const athleteProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'ATHLETE' || !ctx.user.hasAthleteProfile) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Complete your athlete profile first.' })
  }
  return next()
})

export const proProcedure = (feature: 'video-analysis' | 'matchmaker' | 'progression') =>
  protectedProcedure.use(({ ctx, next }) => {
    const allowed =
      feature === 'video-analysis'
        ? canUseVideoAnalysis(ctx.user)
        : feature === 'matchmaker'
          ? canUseMatchmaker(ctx.user)
          : hasProAccess(ctx.user) && ctx.user.hasAthleteProfile
    if (!allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: hasProAccess(ctx.user) ? 'This tool is available to athlete accounts.' : 'This is a Pro feature.',
      })
    }
    return next()
  })

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  // NOT_FOUND rather than FORBIDDEN: admin procedures are not advertised to other users.
  if (!isAdmin(ctx.user)) throw new TRPCError({ code: 'NOT_FOUND' })
  return next()
})
