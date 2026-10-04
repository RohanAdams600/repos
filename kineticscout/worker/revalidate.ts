import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'

/** Asks the web app to refresh cached pages after the worker publishes content. Never throws. */
export async function revalidatePaths(paths: string[]): Promise<boolean> {
  const e = env()
  try {
    const response = await fetch(new URL('/api/internal/revalidate', e.APP_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${e.INTERNAL_API_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) logger.warn({ status: response.status }, 'revalidation request rejected')
    return response.ok
  } catch (error) {
    logger.warn(errorFields(error), 'revalidation request failed')
    return false
  }
}
