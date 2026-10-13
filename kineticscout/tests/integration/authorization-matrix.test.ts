import { TRPCError } from '@trpc/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth/permissions'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'
import { guardianAccount, teamCoachAccount, verifiedCollegeCoach } from '../helpers/people'

// The rate limiter runs before the access checks and would stop a sweep this size; it has its own tests.
vi.mock('@/lib/security/rate-limit', async (original) => ({
  ...(await original<typeof import('@/lib/security/rate-limit')>()),
  rateLimit: vi.fn(async () => ({ success: true, remaining: 999, resetAt: Date.now() + 60_000 })),
}))
vi.mock('@/lib/email/send', async (original) => ({ ...(await original<typeof import('@/lib/email/send')>()), sendEmail: vi.fn(async () => ({ id: null })) }))

/**
 * Every tRPC procedure, called with the wrong kind of caller. A procedure added without the right
 * middleware fails here. Each call passes an empty input: the access check runs before input
 * validation, so a BAD_REQUEST means the caller got past the check.
 */
const PATHS = Object.keys(appRouter._def.procedures).sort()

type Caller = ReturnType<typeof appRouter.createCaller>
async function call(caller: Caller, path: string): Promise<string> {
  const fn = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], caller) as (input?: unknown) => Promise<unknown>
  try {
    await fn(undefined)
    return 'OK'
  } catch (error) {
    return error instanceof TRPCError ? error.code : `THROWN ${(error as Error).message}`
  }
}

async function codes(user: SessionUser | null, paths: string[]): Promise<Record<string, string>> {
  const caller = appRouter.createCaller({ user, ipHash: 'matrix' })
  const out: Record<string, string> = {}
  for (const path of paths) out[path] = await call(caller, path)
  return out
}

let athlete: SessionUser, coach: SessionUser, teamCoach: SessionUser, guardian: SessionUser

beforeAll(async () => {
  await resetDb()
  athlete = await createAthlete()
  coach = await verifiedCollegeCoach()
  teamCoach = await teamCoachAccount()
  guardian = await guardianAccount()
})

describe('authorization matrix', () => {
  it('covers the whole API', () => {
    expect(PATHS.length).toBeGreaterThan(100)
  })

  it('refuses every procedure to a signed-out caller', async () => {
    const result = await codes(null, PATHS)
    expect(Object.entries(result).filter(([, code]) => code !== 'UNAUTHORIZED')).toEqual([])
  })

  it('refuses every procedure to an account that has not accepted the current terms', async () => {
    const result = await codes({ ...athlete, termsCurrent: false }, PATHS)
    expect(Object.entries(result).filter(([, code]) => code !== 'PRECONDITION_FAILED')).toEqual([])
  })

  it('hides every staff procedure from every other kind of account', async () => {
    const admin = PATHS.filter((p) => p.startsWith('admin.'))
    expect(admin.length).toBeGreaterThan(20)
    for (const user of [athlete, coach, teamCoach, guardian]) {
      const result = await codes(user, admin)
      expect(Object.entries(result).filter(([, code]) => code !== 'NOT_FOUND'), user.role).toEqual([])
    }
  })

  it('lets a parent or guardian account reach only its notifications', async () => {
    const others = PATHS.filter((p) => !p.startsWith('notifications.'))
    const result = await codes(guardian, others)
    expect(Object.entries(result).filter(([, code]) => code !== 'FORBIDDEN' && code !== 'NOT_FOUND')).toEqual([])
  })

  it('keeps coach tools away from athletes and athlete tools away from coaches', async () => {
    const coachOnly = PATHS.filter((p) => p.startsWith('coach.') || p.startsWith('team.'))
    const athleteOnly = PATHS.filter((p) => ['metrics.', 'analysis.', 'matchmaker.', 'pipeline.', 'verification.', 'recruiting.', 'athleteTeams.', 'contactRequests.'].some((prefix) => p.startsWith(prefix)))
    const asAthlete = await codes(athlete, coachOnly)
    expect(Object.entries(asAthlete).filter(([, code]) => code !== 'FORBIDDEN' && code !== 'NOT_FOUND')).toEqual([])
    for (const user of [coach, teamCoach]) {
      const result = await codes(user, athleteOnly)
      expect(Object.entries(result).filter(([, code]) => code !== 'FORBIDDEN' && code !== 'NOT_FOUND'), user.role).toEqual([])
    }
  })
})
