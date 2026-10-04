import 'server-only'
import { headers } from 'next/headers'
import { env } from '@/lib/env'
import { pepperedHash } from '@/lib/security/hash'
import { checkRequestOrigin } from '@/lib/security/origin'

/**
 * Client IP as reported by the hosting edge. On Vercel and most managed platforms the first
 * x-forwarded-for entry is set by the platform and cannot be spoofed by the client. If you
 * self-host behind a different proxy chain, adjust this to read the hop your proxy appends.
 */
export function clientIpFrom(headerBag: Headers): string {
  const forwarded = headerBag.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || headerBag.get('x-real-ip') || '0.0.0.0'
}

/** Peppered hash of the caller IP, safe to use as a rate-limit key or audit attribute. */
export async function hashedClientIp(): Promise<string> {
  return pepperedHash(clientIpFrom(await headers()))
}

/** Origin check for Route Handlers. Proxy enforces the same rule globally; this is defence in depth. */
export function assertSameOrigin(request: Request): Response | null {
  const url = new URL(request.url)
  const result = checkRequestOrigin({
    method: request.method,
    pathname: url.pathname,
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    appOrigin: new URL(env().APP_URL).origin,
  })
  if (result.ok) return null
  return Response.json({ error: 'Cross-origin request rejected' }, { status: 403 })
}
