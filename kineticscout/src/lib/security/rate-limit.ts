import 'server-only'
import { Ratelimit, type Duration } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

/**
 * Named rate limits. Keys are always hashed identifiers (user id, peppered IP or email hash),
 * never raw personal data.
 */
export const RATE_LIMITS = {
  signIn: { tokens: 5, window: '1 m' },
  signUp: { tokens: 3, window: '10 m' },
  passwordReset: { tokens: 3, window: '15 m' },
  guardianEmail: { tokens: 3, window: '1 h' },
  apiRead: { tokens: 120, window: '1 m' },
  apiWrite: { tokens: 30, window: '1 m' },
  upload: { tokens: 10, window: '1 h' },
  checkout: { tokens: 5, window: '10 m' },
  ai: { tokens: 10, window: '1 h' },
} as const satisfies Record<string, { tokens: number; window: Duration }>

export type RateLimitName = keyof typeof RATE_LIMITS

export type RateLimitResult = { success: boolean; remaining: number; resetAt: number }

type Limiter = { limit(identifier: string): Promise<RateLimitResult> }

const DURATION_UNITS_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }

export function durationToMs(window: Duration): number {
  const match = /^(\d+)\s?(ms|s|m|h|d)$/.exec(window)
  if (!match) throw new Error(`Unsupported duration ${window}`)
  return Number(match[1]) * DURATION_UNITS_MS[match[2] as string]!
}

/**
 * Process-local sliding-window limiter. Used only for local development and tests; staging and
 * production refuse to boot without Upstash (see env.ts), so limits are shared across instances.
 */
export class MemoryRateLimiter implements Limiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly tokens: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = this.now()
    const windowStart = now - this.windowMs
    const recent = (this.hits.get(identifier) ?? []).filter((t) => t > windowStart)
    const success = recent.length < this.tokens
    if (success) recent.push(now)
    this.hits.set(identifier, recent)
    if (this.hits.size > 50_000) this.hits.clear()
    const oldest = recent[0] ?? now
    return { success, remaining: Math.max(0, this.tokens - recent.length), resetAt: oldest + this.windowMs }
  }
}

const limiters = new Map<RateLimitName, Limiter>()

function getLimiter(name: RateLimitName): Limiter {
  const existing = limiters.get(name)
  if (existing) return existing

  const { tokens, window } = RATE_LIMITS[name]
  const e = env()
  let limiter: Limiter
  if (e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) {
    const upstash = new Ratelimit({
      redis: new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(tokens, window),
      prefix: `ks:rl:${name}`,
      // If Upstash does not answer within 1s the request is allowed and the outage is logged.
      // Availability wins here; Supabase applies its own auth rate limits underneath.
      timeout: 1_000,
      analytics: false,
    })
    limiter = {
      async limit(identifier) {
        const result = await upstash.limit(identifier)
        return { success: result.success, remaining: result.remaining, resetAt: result.reset }
      },
    }
  } else {
    limiter = new MemoryRateLimiter(tokens, durationToMs(window))
  }
  limiters.set(name, limiter)
  return limiter
}

export async function rateLimit(name: RateLimitName, identifier: string): Promise<RateLimitResult> {
  try {
    return await getLimiter(name).limit(identifier)
  } catch (error) {
    logger.error({ limiter: name, err: { message: (error as Error).message } }, 'rate limiter unavailable, allowing request')
    return { success: true, remaining: 0, resetAt: Date.now() }
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Too many requests')
    this.name = 'RateLimitError'
  }
}

/** Throws RateLimitError when the limit is exceeded. */
export async function enforceRateLimit(name: RateLimitName, identifier: string): Promise<void> {
  const result = await rateLimit(name, identifier)
  if (!result.success) {
    throw new RateLimitError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)))
  }
}
