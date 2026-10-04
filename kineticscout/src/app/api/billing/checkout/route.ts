import { getSessionUser } from '@/lib/auth/session'
import { startProCheckout } from '@/lib/billing/checkout'
import { env, FeatureNotConfiguredError } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { rateLimit } from '@/lib/security/rate-limit'
import { assertSameOrigin } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

function seeOther(path: string): Response {
  return Response.redirect(new URL(path, env().APP_URL), 303)
}

/** Plain form POST so checkout works without client JavaScript. Responds with a 303 redirect. */
export async function POST(request: Request): Promise<Response> {
  const rejected = assertSameOrigin(request)
  if (rejected) return rejected

  const user = await getSessionUser()
  if (!user) return seeOther('/sign-in?next=/pricing')

  const form = await request.formData()
  const period = form.get('period')
  if (period !== 'monthly' && period !== 'yearly') return seeOther('/pricing?error=invalid-plan')

  if (!(await rateLimit('checkout', user.id)).success) return seeOther('/pricing?error=rate-limited')

  try {
    const outcome = await startProCheckout(user, period)
    switch (outcome.kind) {
      case 'redirect':
        return Response.redirect(outcome.url, 303)
      case 'already-subscribed':
        return seeOther('/dashboard/billing?notice=already-subscribed')
      case 'consent-required':
        return seeOther('/dashboard/billing?error=guardian-consent')
      case 'unavailable':
        return seeOther('/pricing?error=unavailable')
    }
  } catch (error) {
    if (error instanceof FeatureNotConfiguredError) return seeOther('/pricing?error=unavailable')
    logger.error(errorFields(error), 'checkout failed')
    return seeOther('/pricing?error=checkout-failed')
  }
}
