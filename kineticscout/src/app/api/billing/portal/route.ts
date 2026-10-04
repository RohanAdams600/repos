import { getSessionUser } from '@/lib/auth/session'
import { createBillingPortalUrl } from '@/lib/billing/checkout'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

/** Stripe's hosted portal: change plan, update card, download invoices, cancel in one click. */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const user = await getSessionUser()
  if (!user) return Response.redirect(new URL('/sign-in?next=/dashboard/billing', env().APP_URL), 303)

  try {
    const url = await createBillingPortalUrl(user)
    if (!url) return Response.redirect(new URL('/pricing', env().APP_URL), 303)
    return Response.redirect(url, 303)
  } catch (error) {
    logger.error(errorFields(error), 'billing portal session failed')
    return Response.redirect(new URL('/dashboard/billing?error=portal-unavailable', env().APP_URL), 303)
  }
}
