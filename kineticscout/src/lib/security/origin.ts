/**
 * CSRF defence for every state-changing request.
 *
 * Next.js checks Origin against Host for Server Actions, but lets requests with no Origin
 * header through with a warning. KineticScout is stricter: an unsafe-method request must carry
 * an Origin equal to APP_URL, or, if Origin is absent, a Fetch Metadata header proving it came
 * from our own pages. Everything else is rejected. Cookies are also SameSite=Lax.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Paths authenticated by other means (webhook signatures, shared secrets). */
export const CSRF_EXEMPT_PREFIXES = ['/api/webhooks/', '/api/internal/', '/api/health']

export type OriginCheckInput = {
  method: string
  pathname: string
  origin: string | null
  secFetchSite: string | null
  appOrigin: string
  /** Extra origins allowed in development only (e.g. http://localhost:3000 when APP_URL differs). */
  devOrigins?: string[]
}

export type OriginCheckResult = { ok: true } | { ok: false; reason: 'cross-origin' | 'missing-origin' }

export function checkRequestOrigin(input: OriginCheckInput): OriginCheckResult {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true }
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => input.pathname.startsWith(prefix))) return { ok: true }

  if (input.origin) {
    const allowed = [input.appOrigin, ...(input.devOrigins ?? [])]
    return allowed.includes(input.origin) ? { ok: true } : { ok: false, reason: 'cross-origin' }
  }
  // Browsers that omit Origin still send Fetch Metadata on same-origin navigations and fetches.
  if (input.secFetchSite === 'same-origin') return { ok: true }
  return { ok: false, reason: 'missing-origin' }
}

/**
 * Validates a post-login redirect target. Only same-site relative paths are allowed, which
 * blocks open redirects such as ?next=//evil.example or ?next=https://evil.example.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = '/dashboard'): string {
  if (!candidate) return fallback
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback
  try {
    const parsed = new URL(candidate, 'https://placeholder.invalid')
    if (parsed.origin !== 'https://placeholder.invalid') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
