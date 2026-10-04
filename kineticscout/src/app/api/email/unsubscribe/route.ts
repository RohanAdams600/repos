import { env } from '@/lib/env'
import { setMarketingOptIn, verifyPreferencesToken } from '@/lib/email/preferences'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

export const dynamic = 'force-dynamic'

function credentials(request: Request): { userId: string; token: string } | null {
  const url = new URL(request.url)
  const userId = url.searchParams.get('u') ?? ''
  const token = url.searchParams.get('t') ?? ''
  return verifyPreferencesToken(userId, token) ? { userId, token } : null
}

/**
 * RFC 8058 one-click unsubscribe. Mail providers POST `List-Unsubscribe=One-Click` to the URL in the
 * List-Unsubscribe header; the signed token in the query string is the authorization.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await rateLimit('emailPreferences', await hashedClientIp())).success) return new Response('Too many requests', { status: 429 })
  const creds = credentials(request)
  if (!creds) return new Response('Invalid unsubscribe link', { status: 400 })
  await setMarketingOptIn(creds.userId, false, 'one-click')
  return new Response('You are unsubscribed from KineticScout product emails.', { status: 200, headers: { 'Cache-Control': 'no-store' } })
}

/** A GET (link scanners, prefetching) never changes anything; it opens the preference centre instead. */
export function GET(request: Request): Response {
  const creds = credentials(request)
  const target = new URL('/email/preferences', env().APP_URL)
  if (creds) {
    target.searchParams.set('u', creds.userId)
    target.searchParams.set('t', creds.token)
  }
  return Response.redirect(target, 303)
}
