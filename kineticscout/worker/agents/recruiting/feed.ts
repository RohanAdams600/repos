import { errorFields, logger } from '@/lib/logger'
import { applyProgramFeed, feedSchema } from '@/lib/recruiting/changes'

const MAX_FEED_BYTES = 10 * 1024 * 1024

/** Downloads and applies the licensed program feed. Size-capped, time-limited and schema-validated. */
export async function importProgramFeed(url: string, token: string | undefined, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`program feed returned ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_FEED_BYTES) throw new Error('program feed too large')
  const text = await response.text()
  if (text.length > MAX_FEED_BYTES) throw new Error('program feed too large')
  const parsed = feedSchema.safeParse(JSON.parse(text))
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, 'program feed rejected')
    throw new Error('program feed failed validation')
  }
  try {
    const result = await applyProgramFeed(parsed.data)
    logger.info(result, 'program feed applied')
    return result
  } catch (error) {
    logger.error(errorFields(error), 'program feed apply failed')
    throw error
  }
}
