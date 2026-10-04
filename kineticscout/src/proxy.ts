import { createServerClient } from '@supabase/ssr'
import { E2E_SESSION_COOKIE, e2eStubEnabled, readE2eSession } from '@/lib/auth/e2e-stub'
import { NextResponse, type NextRequest } from 'next/server'
import { hardenCookieOptions, isSecureCookieEnvironment } from '@/lib/auth/cookies'
import { analyticsAllowedOn, CONSENT_COOKIE, parseConsent, UTM_COOKIE, UTM_MAX_AGE } from '@/lib/consent'
import { parseUtm } from '@/lib/marketing/utm'
import { buildCsp, generateNonce } from '@/lib/security/csp'
import { checkRequestOrigin } from '@/lib/security/origin'

/**
 * Network boundary. Runs before every page, Server Action and API request and:
 *   1. rejects cross-site state-changing requests (CSRF),
 *   2. issues a per-request CSP nonce,
 *   3. refreshes the Supabase session cookie when one is present,
 *   4. redirects anonymous visitors away from signed-in areas.
 *
 * This is a coarse gate for user experience. Authorization is enforced again in the Data Access
 * Layer (src/lib/auth/session.ts) inside every page, action and procedure.
 */

const SIGNED_IN_PREFIXES = ['/dashboard', '/admin', '/onboarding', '/reset-password']
const SIGNED_OUT_ONLY = ['/sign-in', '/sign-up']
const STORAGE_ORIGINS = ['https://storage.googleapis.com']

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isDev = process.env.NODE_ENV !== 'production'
  const appUrl = process.env.APP_URL ?? request.nextUrl.origin
  const appOrigin = new URL(appUrl).origin

  // 1. CSRF: unsafe methods must come from our own origin.
  const origin = checkRequestOrigin({
    method: request.method,
    pathname,
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    appOrigin,
    devOrigins: isDev ? [request.nextUrl.origin] : [],
  })
  if (!origin.ok) {
    return new NextResponse('Cross-origin request rejected', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }

  // Webhooks and health checks carry no session and need no CSP.
  if (pathname.startsWith('/api/webhooks/') || pathname === '/api/health') return NextResponse.next()

  // 2. Per-request nonce. Next.js reads it from the request CSP header and applies it to its scripts.
  const isApi = pathname.startsWith('/api/')
  const nonce = generateNonce()
  const consent = parseConsent(request.cookies.get(CONSENT_COOKIE)?.value)
  const analytics = Boolean(process.env.GA_MEASUREMENT_ID) && consent?.analytics === true && analyticsAllowedOn(pathname)
  const csp = buildCsp({ nonce, isDev, storageOrigins: STORAGE_ORIGINS, upgradeInsecureRequests: appUrl.startsWith('https://'), analytics })
  const forwardHeaders = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('content-security-policy', csp)
    return headers
  }

  let response = NextResponse.next({ request: { headers: forwardHeaders() } })
  const cookieWrites: { name: string; value: string; options: Record<string, unknown> }[] = []
  const secure = isSecureCookieEnvironment(appUrl)

  // 3. Session refresh, only when a Supabase cookie is present (anonymous traffic skips the network call).
  let authenticated = false
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (supabaseUrl && supabaseKey && request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
      cookieOptions: hardenCookieOptions({}, secure),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, cacheHeaders) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request: { headers: forwardHeaders() } })
          for (const { name, value, options } of cookiesToSet) {
            const hardened = hardenCookieOptions(options, secure)
            response.cookies.set(name, value, hardened)
            cookieWrites.push({ name, value, options: hardened })
          }
          for (const [key, value] of Object.entries(cacheHeaders)) response.headers.set(key, value)
        },
      },
    })
    try {
      const { data } = await supabase.auth.getClaims()
      authenticated = Boolean(data?.claims?.sub)
    } catch {
      authenticated = false
    }
  }

  // Local end-to-end tests only (see src/lib/auth/e2e-stub.ts); inert in every deployed environment.
  if (!authenticated && e2eStubEnabled()) authenticated = readE2eSession(request.cookies.get(E2E_SESSION_COOKIE)?.value, process.env.HASH_PEPPER) !== null

  // 4. Coarse route guards. Redirects carry any refreshed cookies so the session is not lost.
  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, appOrigin))
    for (const { name, value, options } of cookieWrites) redirect.cookies.set(name, value, options)
    redirect.headers.set('Cache-Control', 'private, no-store')
    return redirect
  }
  if (!authenticated && matchesPrefix(pathname, SIGNED_IN_PREFIXES)) {
    return redirectTo(`/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`)
  }
  if (authenticated && SIGNED_OUT_ONLY.includes(pathname)) {
    return redirectTo('/dashboard')
  }

  // First-touch attribution, only for visitors who already granted analytics consent.
  if (!isApi && consent?.analytics && !request.cookies.has(UTM_COOKIE)) {
    const utm = parseUtm(request.nextUrl.searchParams)
    if (Object.keys(utm).length > 0) {
      response.cookies.set(UTM_COOKIE, JSON.stringify(utm), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: UTM_MAX_AGE })
    }
  }

  if (!isApi) response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    // Everything except build assets, image optimisation and static files served from /public.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2)$).*)',
  ],
}
