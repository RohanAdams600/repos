import { describe, expect, it } from 'vitest'
import { maskEmail, oneClickUnsubscribeUrl, preferencesToken, verifyPreferencesToken } from '@/lib/email/preferences'
import { renderEmail } from '@/lib/email/templates'
import { checkRequestOrigin } from '@/lib/security/origin'
import { signSubject, verifySubject } from '@/lib/security/signed-token'

const SECRET = 'unit-test-secret-0123456789abcdef0123456789'
const USER = '0192f0a1-7c3e-7a10-9b2c-3d4e5f607182'

describe('signed subject tokens', () => {
  it('verifies only the exact purpose and subject it was issued for', () => {
    const token = signSubject(SECRET, 'email-preferences-v1', USER)
    expect(verifySubject(SECRET, 'email-preferences-v1', USER, token)).toBe(true)
    expect(verifySubject(SECRET, 'other-purpose', USER, token)).toBe(false)
    expect(verifySubject(SECRET, 'email-preferences-v1', '0192f0a1-7c3e-7a10-9b2c-3d4e5f607183', token)).toBe(false)
    expect(verifySubject('a-different-secret-0123456789abcdef0123', 'email-preferences-v1', USER, token)).toBe(false)
  })

  it('rejects tampered, empty and oversized tokens without throwing', () => {
    const token = signSubject(SECRET, 'p', USER)
    const flipped = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    expect(verifySubject(SECRET, 'p', USER, flipped)).toBe(false)
    expect(verifySubject(SECRET, 'p', USER, '')).toBe(false)
    expect(verifySubject(SECRET, 'p', USER, token.slice(0, 10))).toBe(false)
    expect(verifySubject(SECRET, 'p', USER, 'x'.repeat(500))).toBe(false)
  })

  it('cannot be confused by moving the separator between purpose and subject', () => {
    expect(signSubject(SECRET, 'ab', 'c')).not.toBe(signSubject(SECRET, 'a', 'bc'))
  })
})

describe('email preference links', () => {
  it('round-trips and refuses non-uuid subjects', () => {
    const token = preferencesToken(USER)
    expect(verifyPreferencesToken(USER, token)).toBe(true)
    expect(verifyPreferencesToken('not-a-uuid', token)).toBe(false)
    expect(oneClickUnsubscribeUrl(USER)).toBe(`http://localhost:3000/api/email/unsubscribe?u=${USER}&t=${token}`)
  })

  it('masks the address shown on the preference centre', () => {
    expect(maskEmail('jordan.smith@example.com')).toBe('j***@example.com')
  })
})

describe('email rendering', () => {
  it('escapes every interpolated value in the HTML part and keeps the text part readable', () => {
    const { text, html } = renderEmail({
      paragraphs: ['Hi <script>alert(1)</script> & welcome'],
      action: { label: 'Open "settings"', url: 'https://app.example/x?a=1&b=<2>' },
      footer: ['Unsubscribe: https://app.example/u'],
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; welcome')
    expect(html).toContain('href="https://app.example/x?a=1&amp;b=&lt;2&gt;"')
    expect(html).toContain('Open &quot;settings&quot;')
    expect(text).toContain('Hi <script>alert(1)</script> & welcome')
    expect(text).toContain('Open "settings": https://app.example/x?a=1&b=<2>')
    expect(text).toContain('---\n\nUnsubscribe: https://app.example/u')
  })
})

describe('CSRF exemption for one-click unsubscribe', () => {
  const base = { method: 'POST', origin: null, secFetchSite: null, appOrigin: 'https://kineticscout.example' }
  it('lets mail providers POST to the unsubscribe endpoint without an Origin header', () => {
    expect(checkRequestOrigin({ ...base, pathname: '/api/email/unsubscribe' })).toEqual({ ok: true })
  })
  it('keeps every other email and account route protected', () => {
    expect(checkRequestOrigin({ ...base, pathname: '/api/email/preferences' })).toEqual({ ok: false, reason: 'missing-origin' })
    expect(checkRequestOrigin({ ...base, pathname: '/api/account/export' })).toEqual({ ok: false, reason: 'missing-origin' })
    expect(checkRequestOrigin({ ...base, pathname: '/api/account/export', origin: 'https://evil.example' })).toEqual({ ok: false, reason: 'cross-origin' })
  })
})
