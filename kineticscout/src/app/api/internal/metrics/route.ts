import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { collectOperationalMetrics } from '@/lib/ops/metrics'
import { formatPrometheus, PROMETHEUS_CONTENT_TYPE } from '@/lib/ops/prometheus'
import { constantTimeEqual } from '@/lib/security/hash'

export const dynamic = 'force-dynamic'

/**
 * Prometheus scrape target for operational gauges (see infra/monitoring). Authenticated with the
 * internal shared secret as a bearer token, never cookies. Counts only, no personal data.
 * A failed collection answers 503 so the scrape itself fails and `up` alerts fire.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  if (!constantTimeEqual(auth, `Bearer ${env().INTERNAL_API_SECRET}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = formatPrometheus(await collectOperationalMetrics())
    return new Response(body, { headers: { 'Content-Type': PROMETHEUS_CONTENT_TYPE, 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error(errorFields(error), 'metrics collection failed')
    return new Response('metrics unavailable\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
}
