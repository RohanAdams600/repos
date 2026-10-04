import 'server-only'
import { Redis } from '@upstash/redis'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'

/**
 * Read-through cache for repeat requests. Upstash Redis when configured (shared across instances),
 * otherwise a bounded in-process map for local development. Cache failures fall through to the
 * loader; they never fail the request.
 */

const memory = new Map<string, { expiresAt: number; value: unknown }>()
let redis: Redis | null | undefined

function client(): Redis | null {
  if (redis === undefined) {
    const e = env()
    redis = e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN ? new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }) : null
  }
  return redis
}

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const namespaced = `ks:cache:${key}`
  const r = client()
  try {
    if (r) {
      const hit = await r.get<T>(namespaced)
      if (hit !== null && hit !== undefined) return hit
    } else {
      const hit = memory.get(namespaced)
      if (hit && hit.expiresAt > Date.now()) return hit.value as T
    }
  } catch (error) {
    logger.warn({ key, ...errorFields(error) }, 'cache read failed')
  }

  const value = await load()
  try {
    if (r) await r.set(namespaced, value, { ex: ttlSeconds })
    else {
      if (memory.size > 500) memory.clear()
      memory.set(namespaced, { expiresAt: Date.now() + ttlSeconds * 1000, value })
    }
  } catch (error) {
    logger.warn({ key, ...errorFields(error) }, 'cache write failed')
  }
  return value
}

export async function invalidate(key: string): Promise<void> {
  const namespaced = `ks:cache:${key}`
  memory.delete(namespaced)
  try {
    await client()?.del(namespaced)
  } catch (error) {
    logger.warn({ key, ...errorFields(error) }, 'cache invalidation failed')
  }
}
