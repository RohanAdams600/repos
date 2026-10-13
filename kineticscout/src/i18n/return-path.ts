import { safeRedirectPath } from '@/lib/security/origin'

/**
 * Only paths on this site, so the switch cannot be used as an open redirect. The shared guard also
 * rejects control characters, which browsers strip from URLs (so "/\t/evil.example" cannot turn
 * into "//evil.example").
 */
export function safeReturn(value: unknown, referer: string | null, appUrl: string): string {
  if (typeof value === 'string' && value.length > 0 && value.length <= 2048) {
    const path = safeRedirectPath(value, '')
    if (path) return path
  }
  if (referer) {
    try {
      const url = new URL(referer)
      if (url.origin === new URL(appUrl).origin) return safeRedirectPath(url.pathname + url.search, '/')
    } catch {
      // Not a URL: fall through.
    }
  }
  return '/'
}
