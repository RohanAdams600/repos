import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type CheckResult = { ok: boolean; latencyMs: number }

async function timed(check: () => Promise<unknown>, timeoutMs: number): Promise<CheckResult> {
  const started = Date.now()
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    logger.warn(errorFields(error), 'health check dependency failed')
    return { ok: false, latencyMs: Date.now() - started }
  }
}

/**
 * Uptime monitoring endpoint (point your monitor at GET /api/health).
 * Returns 503 when a hard dependency is down. Reveals no versions, hosts or error text.
 */
export async function GET(): Promise<Response> {
  const e = env()
  const database = await timed(() => db.$queryRaw`SELECT 1`, 2_000)
  const cache =
    e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN
      ? await timed(
          () =>
            fetch(`${e.UPSTASH_REDIS_REST_URL}/ping`, {
              headers: { Authorization: `Bearer ${e.UPSTASH_REDIS_REST_TOKEN}` },
              signal: AbortSignal.timeout(2_000),
            }).then((r) => {
              if (!r.ok) throw new Error(`status ${r.status}`)
            }),
          2_500,
        )
      : null

  const healthy = database.ok && (cache?.ok ?? true)
  return Response.json(
    { status: healthy ? 'ok' : 'degraded', checks: { database, ...(cache ? { cache } : {}) }, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
