import { describe, expect, it } from 'vitest'
import { eventInputSchema, eventJsonLd, formatEventDates, overlaps, periodInputSchema } from '@/lib/events/rules'

const today = new Date('2026-10-06T00:00:00Z')
const valid = {
  name: 'Fall Prospect Showcase',
  kind: 'SHOWCASE',
  sport: 'BASEBALL',
  organizer: 'Example Baseball Events',
  officialUrl: 'https://events.example.org/fall-showcase',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  city: 'Austin',
  state: 'TX',
  venue: '',
  gradYearMin: '2027',
  gradYearMax: '2029',
  costText: '$195 per player',
  description: 'Two days of defensive work, batting practice and a timed 60-yard run.',
}

describe('event listings', () => {
  const schema = eventInputSchema(today)
  it('accepts a complete listing and normalises optional fields', () => {
    const parsed = schema.parse(valid)
    expect(parsed.venue).toBeNull()
    expect(parsed.gradYearMin).toBe(2027)
    expect(parsed.startDate.toISOString()).toBe('2026-11-07T00:00:00.000Z')
  })
  it('refuses links that are not https, impossible dates and past or far-off events', () => {
    const issue = (patch: Partial<typeof valid>) => schema.safeParse({ ...valid, ...patch }).error?.issues.map((i) => i.path.join('.'))
    expect(issue({ officialUrl: 'http://events.example.org/x' })).toEqual(['officialUrl'])
    expect(issue({ officialUrl: 'javascript:alert(1)' })).toEqual(['officialUrl'])
    expect(issue({ startDate: '2026-02-30' })).toEqual(['startDate'])
    expect(issue({ endDate: '2026-11-06' })).toEqual(['endDate'])
    expect(issue({ startDate: '2026-09-01', endDate: '2026-09-02' })).toEqual(['endDate'])
    expect(issue({ startDate: '2026-11-01', endDate: '2026-12-15' })).toEqual(['endDate'])
    expect(issue({ startDate: '2028-06-01', endDate: '2028-06-01' })).toEqual(['startDate'])
    expect(issue({ gradYearMin: '2030', gradYearMax: '2027' })).toEqual(['gradYearMax'])
    expect(issue({ state: 'ZZ' })).toEqual(['state'])
    expect(issue({ description: 'Too short' })).toEqual(['description'])
  })
  it('describes the event for search engines from the listing only, including cancellation', () => {
    const ld = eventJsonLd({ ...schema.parse(valid), status: 'CANCELED' }, 'https://kineticscout.example/events/1')
    expect(ld).toMatchObject({ '@type': 'SportsEvent', startDate: '2026-11-07', eventStatus: 'https://schema.org/EventCancelled', location: { address: { addressRegion: 'TX' } } })
  })
  it('formats one-day and multi-day dates', () => {
    const d = new Date('2026-11-07T00:00:00Z')
    expect(formatEventDates(d, d)).toBe('November 7, 2026')
    expect(formatEventDates(d, new Date('2026-11-08T00:00:00Z'))).toBe('November 7, 2026 to November 8, 2026')
  })
})

describe('recruiting periods', () => {
  it('need an https source and ordered dates', () => {
    const base = { sport: 'BASEBALL', division: 'D1', kind: 'DEAD', startDate: '2026-11-10', endDate: '2026-11-13', sourceUrl: 'https://ncaa.example.org/calendar.pdf', sourceTitle: '2026-27 Calendar' }
    expect(periodInputSchema.safeParse(base).success).toBe(true)
    expect(periodInputSchema.safeParse({ ...base, endDate: '2026-11-09' }).success).toBe(false)
    expect(periodInputSchema.safeParse({ ...base, sourceUrl: 'ftp://x.example' }).success).toBe(false)
  })
  it('overlap on shared days', () => {
    const a = { startDate: new Date('2026-11-01'), endDate: new Date('2026-11-10') }
    expect(overlaps(a, { startDate: new Date('2026-11-10'), endDate: new Date('2026-11-12') })).toBe(true)
    expect(overlaps(a, { startDate: new Date('2026-11-11'), endDate: new Date('2026-11-12') })).toBe(false)
  })
})
