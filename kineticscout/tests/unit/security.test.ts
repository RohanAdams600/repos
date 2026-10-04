import { describe, expect, it } from 'vitest'
import { hardenCookieOptions } from '@/lib/auth/cookies'
import { buildCsp, generateNonce } from '@/lib/security/csp'
import { checkRequestOrigin, safeRedirectPath } from '@/lib/security/origin'
import { escapeHtml, normalizeEmail, sanitizeText } from '@/lib/security/sanitize'
import { durationToMs, MemoryRateLimiter } from '@/lib/security/rate-limit'

describe('Content-Security-Policy', () => {
  it('uses a nonce with strict-dynamic and never allows inline or eval scripts in production', () => {
    const csp = buildCsp({ nonce: 'abcdefghijklmnopqrstuv==', isDev: false })
    expect(csp).toContain("script-src 'self' 'nonce-abcdefghijklmnopqrstuv==' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('allows the Stripe redirect hosts in form-action and storage hosts for media and uploads', () => {
    const csp = buildCsp({ nonce: generateNonce(), isDev: false, storageOrigins: ['https://storage.googleapis.com'] })
    expect(csp).toMatch(/form-action 'self' https:\/\/checkout\.stripe\.com https:\/\/billing\.stripe\.com/)
    expect(csp).toMatch(/media-src [^;]*https:\/\/storage\.googleapis\.com/)
    expect(csp).toMatch(/connect-src [^;]*https:\/\/storage\.googleapis\.com/)
  })

  it('adds unsafe-eval only in development and rejects weak nonces', () => {
    expect(buildCsp({ nonce: generateNonce(), isDev: true })).toContain("'unsafe-eval'")
    expect(() => buildCsp({ nonce: 'short', isDev: false })).toThrow()
  })

  it('generates unique 128-bit nonces', () => {
    const nonces = new Set(Array.from({ length: 200 }, generateNonce))
    expect(nonces.size).toBe(200)
    expect(Buffer.from([...nonces][0]!, 'base64')).toHaveLength(16)
  })
})

describe('CSRF origin check', () => {
  const base = { appOrigin: 'https://kineticscout.com', pathname: '/api/billing/checkout' }
  it('allows safe methods', () => {
    expect(checkRequestOrigin({ ...base, method: 'GET', origin: 'https://evil.example', secFetchSite: 'cross-site' }).ok).toBe(true)
  })
  it('rejects cross-origin and origin-less unsafe requests', () => {
    expect(checkRequestOrigin({ ...base, method: 'POST', origin: 'https://evil.example', secFetchSite: null })).toEqual({ ok: false, reason: 'cross-origin' })
    expect(checkRequestOrigin({ ...base, method: 'POST', origin: null, secFetchSite: null })).toEqual({ ok: false, reason: 'missing-origin' })
    expect(checkRequestOrigin({ ...base, method: 'POST', origin: 'https://kineticscout.com.evil.example', secFetchSite: null }).ok).toBe(false)
  })
  it('accepts same-origin requests and Fetch Metadata fallback', () => {
    expect(checkRequestOrigin({ ...base, method: 'POST', origin: 'https://kineticscout.com', secFetchSite: null }).ok).toBe(true)
    expect(checkRequestOrigin({ ...base, method: 'DELETE', origin: null, secFetchSite: 'same-origin' }).ok).toBe(true)
  })
  it('exempts signature-authenticated webhooks', () => {
    expect(checkRequestOrigin({ ...base, pathname: '/api/webhooks/stripe', method: 'POST', origin: null, secFetchSite: null }).ok).toBe(true)
  })
})

describe('safeRedirectPath', () => {
  it.each([
    ['/dashboard/matchmaker?x=1', '/dashboard/matchmaker?x=1'],
    ['//evil.example', '/dashboard'],
    ['https://evil.example/path', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['/ok\nSet-Cookie: x', '/dashboard'],
    [null, '/dashboard'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })
})

describe('cookie hardening', () => {
  it('forces HttpOnly, SameSite=Lax and path=/ regardless of library defaults', () => {
    const hardened = hardenCookieOptions({ httpOnly: false, sameSite: 'none', path: '/x', maxAge: 10 }, true)
    expect(hardened).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 10 })
  })
})

describe('input sanitization', () => {
  it('strips control, bidi and zero-width characters and normalizes', () => {
    expect(sanitizeText('  Ja​ke‮  \u0007Smith ')).toBe('Jake Smith')
    expect(sanitizeText('line1\nline2')).toBe('line1 line2')
    expect(sanitizeText('line1\nline2', { multiline: true })).toBe('line1\nline2')
    expect(sanitizeText('ｆｕｌｌ')).toBe('full')
  })
  it('normalizes emails and escapes HTML for server-built emails', () => {
    expect(normalizeEmail(' Coach@Example.COM ')).toBe('coach@example.com')
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
  })
})

describe('memory rate limiter', () => {
  it('enforces a sliding window', async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(3, 60_000, () => now)
    const results = []
    for (let i = 0; i < 4; i++) results.push((await limiter.limit('k')).success)
    expect(results).toEqual([true, true, true, false])
    now = 61_000
    expect((await limiter.limit('k')).success).toBe(true)
    expect((await limiter.limit('other')).success).toBe(true)
  })
  it('parses durations', () => {
    expect(durationToMs('10 m')).toBe(600_000)
    expect(durationToMs('1 h')).toBe(3_600_000)
  })
})
