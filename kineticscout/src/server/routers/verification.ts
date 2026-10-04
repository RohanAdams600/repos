import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { completeEvidenceUpload, createEvidenceUpload, VerificationError } from '@/lib/verification/service'
import { athleteProcedure, createRouter } from '@/server/trpc'

const CODES: Record<VerificationError['code'], TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_VERIFIED: 'CONFLICT',
  IN_PROGRESS: 'CONFLICT',
  LIMIT: 'FORBIDDEN',
  INVALID_FILE: 'BAD_REQUEST',
  NOT_UPLOADED: 'PRECONDITION_FAILED',
}

function mapError(error: unknown): never {
  if (error instanceof VerificationError) throw new TRPCError({ code: CODES[error.code], message: error.message })
  if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Upload limit reached. Try again in an hour.' })
  throw error
}

export const verificationRouter = createRouter({
  createUpload: athleteProcedure
    .input(z.object({ metricId: z.uuid(), contentType: z.string().max(64), sizeBytes: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await enforceRateLimit('upload', ctx.user.id)
        return await createEvidenceUpload(ctx.user, input)
      } catch (error) {
        mapError(error)
      }
    }),

  completeUpload: athleteProcedure.input(z.object({ metricId: z.uuid() })).mutation(async ({ ctx, input }) => {
    try {
      return { status: await completeEvidenceUpload(ctx.user, input.metricId) }
    } catch (error) {
      mapError(error)
    }
  }),
})
