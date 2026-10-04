import { describe, expect, it } from 'vitest'
import { allowedNumbersFrom, extractNumbers, factCheck, slugify } from '@/lib/content/fact-check'
import { checkAsset, stripEmDashes, type DraftAsset } from '@/lib/marketing/compliance'
import { parseUtm, withUtm } from '@/lib/marketing/utm'

const now = new Date(Date.UTC(2026, 9, 6))
const asset = (overrides: Partial<DraftAsset> = {}): DraftAsset => ({
  channel: 'META_AD',
  topic: 'fall showcase season',
  region: 'Texas',
  primaryText: 'See how your exit velocity compares with your class, then target programs that fit.',
  headline: 'Know where you stand',
  description: 'Free to start',
  callToAction: 'LEARN_MORE',
  hashtags: ['baseball'],
  feature: 'college_matchmaker',
  ...overrides,
})

describe('marketing compliance checker', () => {
  it('passes clean copy', () => {
    const result = checkAsset(asset(), now)
    expect(result.blocked).toBe(false)
    expect(result.issues).toEqual([])
  })

  it.each([
    ['Get a scholarship with KineticScout.', 'RECRUITING_PROMISE'],
    ['Guaranteed to raise your velocity.', 'GUARANTEE'],
    ['The #1 recruiting app.', 'UNSUPPORTED_SUPERLATIVE'],
    ['Last chance to sign up!', 'FAKE_URGENCY'],
    ['Used at Perfect Game events.', 'THIRD_PARTY_TRADEMARK'],
    ['Players gain 12% velocity.', 'UNSUPPORTED_NUMBER'],
    ['Join 10,000 athletes.', 'UNSUPPORTED_NUMBER'],
  ])('blocks %j', (text, code) => {
    const result = checkAsset(asset({ primaryText: text }), now)
    expect(result.blocked).toBe(true)
    expect(result.issues.map((i) => i.code)).toContain(code)
  })

  it('allows approved numbers: prices, free limit and class years', () => {
    const result = checkAsset(asset({ primaryText: 'Pro is $14.99 a month. Free plan logs 3 metrics. Class of 2028.' }), now)
    expect(result.issues.map((i) => i.code)).not.toContain('UNSUPPORTED_NUMBER')
  })

  it('applies brand rules: no em dashes, no emoji in headlines, max 5 hashtags', () => {
    const result = checkAsset(asset({ primaryText: 'Track it — then improve it.', headline: 'Fast ⚾ start', hashtags: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'] }), now)
    expect(result.asset.primaryText).toBe('Track it, then improve it.')
    expect(result.asset.headline).toBe('Fast start')
    expect(result.asset.hashtags).toHaveLength(5)
    expect(stripEmDashes('a — b')).toBe('a, b')
  })

  it('enforces the X character limit including hashtags', () => {
    const result = checkAsset(asset({ channel: 'X_POST', headline: '', description: '', primaryText: 'x'.repeat(275), hashtags: ['baseball'] }), now)
    expect(result.issues.map((i) => i.code)).toContain('TOO_LONG')
  })
})

describe('article fact checker', () => {
  const snapshot = { metricLabel: '60-yard dash', national: { athletes: 412, median: 7.12, p90: 6.71 }, byClass: [{ classOf: 2027, median: 7.05 }] }
  const allowed = allowedNumbersFrom(snapshot, [2026, 12])

  it('accepts text whose numbers all come from the snapshot', () => {
    const text = 'Across 412 athletes the median 60-yard dash was 7.12 seconds; the class of 2027 median was 7.05. The 90th percentile ran 6.71.'
    expect(factCheck(text, allowed, 'https://kineticscout.com').ok).toBe(true)
  })

  it('flags invented numbers, HTML, external links and guarantees', () => {
    const report = factCheck('Athletes improve by 0.3 seconds. <script>x</script> [link](https://evil.example) Guaranteed.', allowed, 'https://kineticscout.com')
    expect(report.ok).toBe(false)
    expect(report.unknownNumbers).toContain('0.3')
    expect(report.containsHtml).toBe(true)
    expect(report.externalLinks).toEqual(['https://evil.example'])
    expect(report.bannedPhrases).toContain('guarantee')
  })

  it('normalizes numbers and slugs', () => {
    expect(extractNumbers('1,204 athletes at 92.50 mph')).toEqual(['1204', '92.5'])
    expect(slugify('Exit Velocity Percentiles: Class of 2027!')).toBe('exit-velocity-percentiles-class-of-2027')
  })
})

describe('UTM tracking', () => {
  it('tags links and parses only safe values', () => {
    const url = withUtm('https://kineticscout.com/pricing', { source: 'Facebook', medium: 'paid social', campaign: 'growth 2026-10-06', content: 'abc' })
    expect(url).toBe('https://kineticscout.com/pricing?utm_source=facebook&utm_medium=paid-social&utm_campaign=growth-2026-10-06&utm_content=abc')
    expect(parseUtm(new URLSearchParams('utm_source=<script>&utm_medium=email'))).toEqual({ utm_source: 'script', utm_medium: 'email' })
  })
})
