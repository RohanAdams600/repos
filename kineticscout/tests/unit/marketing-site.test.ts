import { describe, expect, it } from 'vitest'
import { directionsUrl, formatPhone, telHref } from '@/lib/business-links'
import { analyticsAllowedOn, parseConsent, serializeConsent } from '@/lib/consent'
import { FAQS, faqJsonLd } from '@/lib/content/faq'
import { TEAM } from '@/lib/content/team'
import { buildCsp, generateNonce } from '@/lib/security/csp'
import { normalizeQuery, rankDocuments, scoreDocument, tokenize } from '@/lib/search/score'
import { contactSchema } from '@/lib/validation/contact'

describe('FAQ', () => {
  it('has exactly five detailed answers and valid FAQPage structured data', () => {
    expect(FAQS).toHaveLength(5)
    for (const faq of FAQS) {
      expect(faq.answer.join(' ').length).toBeGreaterThan(300)
      expect(faq.answer.join(' ')).not.toMatch(/—/)
      expect(faq.id).toMatch(/^[a-z-]+$/)
    }
    const ld = faqJsonLd() as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toHaveLength(5)
    expect(ld.mainEntity[0]!.acceptedAnswer.text.length).toBeGreaterThan(100)
  })
  it('never promises outcomes', () => {
    const text = FAQS.flatMap((f) => f.answer).join(' ')
    expect(text).not.toMatch(/\bguarantee/i)
    expect(text).toMatch(/not as a prediction/)
  })
})

describe('analytics consent', () => {
  it('round-trips and rejects malformed or outdated values', () => {
    expect(parseConsent(serializeConsent(true, 1_790_000_000_000))).toEqual({ analytics: true, version: 1, decidedAt: 1_790_000_000_000 })
    expect(parseConsent(serializeConsent(false))?.analytics).toBe(false)
    expect(parseConsent(undefined)).toBeNull()
    expect(parseConsent('v0.granted.1790000000')).toBeNull()
    expect(parseConsent('v1.granted')).toBeNull()
    expect(parseConsent('granted')).toBeNull()
  })
  it('allows analytics on public marketing pages only', () => {
    for (const path of ['/', '/pricing', '/faq', '/blog', '/blog/exit-velocity-2026', '/case-studies/x', '/contact/thanks']) expect(analyticsAllowedOn(path)).toBe(true)
    for (const path of ['/dashboard', '/dashboard/analysis', '/admin', '/sign-up', '/onboarding', '/consent/guardian', '/auth/confirm']) expect(analyticsAllowedOn(path)).toBe(false)
  })
  it('opens Google Analytics endpoints in the CSP only when analytics is on', () => {
    const nonce = generateNonce()
    const off = buildCsp({ nonce, isDev: false })
    const on = buildCsp({ nonce, isDev: false, analytics: true })
    expect(off).not.toContain('google-analytics')
    expect(on).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com/)
    expect(on).toMatch(/img-src [^;]*https:\/\/www\.googletagmanager\.com/)
    expect(on).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic';/)
  })
})

describe('site search scoring', () => {
  const docs = [
    { href: '/pricing', section: 'Page', title: 'Pricing', description: 'Plans and cancellation', keywords: 'refund cost' },
    { href: '/legal/refunds', section: 'Legal', title: 'Refund Policy', description: 'Refund windows' },
    { href: '/faq#video', section: 'FAQ', title: 'How does video analysis work?', description: 'Pose landmarks' },
  ]
  it('requires every token and weights titles highest', () => {
    expect(rankDocuments(docs, 'refund').map((r) => r.href)).toEqual(['/legal/refunds', '/pricing'])
    expect(rankDocuments(docs, 'video pose').map((r) => r.href)).toEqual(['/faq#video'])
    expect(rankDocuments(docs, 'refund video')).toEqual([])
    expect(scoreDocument(docs[0]!, [])).toBe(0)
  })
  it('normalizes and bounds queries', () => {
    expect(normalizeQuery('  exit\u0000 velo  ')).toBe('exit velo')
    expect(normalizeQuery('x'.repeat(300))).toHaveLength(100)
    expect(tokenize('60-yard DASH!')).toEqual(['60', 'yard', 'dash'])
  })
})

describe('contact form validation', () => {
  const valid = { name: '  Dana  ', email: 'Dana@Example.com', topic: 'billing', message: 'I was charged twice this month.' }
  it('accepts and normalizes a valid message', () => {
    expect(contactSchema.parse(valid)).toEqual({ name: 'Dana', email: 'dana@example.com', topic: 'billing', message: 'I was charged twice this month.' })
  })
  it('rejects unknown topics, short or oversized messages', () => {
    expect(contactSchema.safeParse({ ...valid, topic: 'sales-spam' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, message: 'hi' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, message: 'x'.repeat(4001) }).success).toBe(false)
  })
})

describe('business links and team', () => {
  it('builds directions and phone links', () => {
    expect(directionsUrl('100 Main St, Austin, TX')).toBe('https://www.google.com/maps/dir/?api=1&destination=100%20Main%20St%2C%20Austin%2C%20TX')
    expect(telHref('+15125550123')).toBe('tel:+15125550123')
    expect(formatPhone('+15125550123')).toBe('(512) 555-0123')
  })
  it('ships with no placeholder team members', () => {
    expect(TEAM).toEqual([])
  })
})
