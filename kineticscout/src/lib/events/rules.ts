import { z } from 'zod'
import type { Division, EventKind, RecruitingPeriodKind, Sport } from '@/generated/prisma/enums'
import { sanitizeText } from '@/lib/security/sanitize'
import { US_STATES } from '@/lib/us-states'

export const EVENT_POLICY = {
  /** Open submissions per account awaiting review. */
  maxPendingPerSubmitter: 10,
  maxDurationDays: 31,
  /** How far ahead an event can be listed. */
  maxLeadDays: 548,
  /** Attendance is deleted this long after an event ends. */
  attendanceRetentionDays: 365,
  /** Events are deleted this long after they end (rejected ones sooner). */
  eventRetentionDays: 730,
  rejectedRetentionDays: 90,
  pageSize: 20,
} as const

export const EVENT_KIND_LABEL: Record<EventKind, string> = { SHOWCASE: 'Showcase', CAMP: 'Camp', COMBINE: 'Combine', TOURNAMENT: 'Tournament' }
export const PERIOD_LABEL: Record<RecruitingPeriodKind, string> = { CONTACT: 'Contact period', EVALUATION: 'Evaluation period', QUIET: 'Quiet period', DEAD: 'Dead period' }
export const DIVISIONS: readonly Division[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']
export const SPORTS: readonly Sport[] = ['BASEBALL', 'HOCKEY', 'FOOTBALL']
const STATE_CODES = new Set(US_STATES.map(([code]) => code))
const DAY = 86_400_000

const text = (max: number, label: string) =>
  z
    .string({ error: `Enter ${label}` })
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(1, `Enter ${label}`).max(max, `Use at most ${max} characters`))
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v) : ''))
    .pipe(z.string().max(max, `Use at most ${max} characters`))
    .transform((v) => v || null)
const dateOnly = (label: string) =>
  z
    .string({ error: `Enter the ${label}` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label}`)
    .transform((v, ctx) => {
      const d = new Date(`${v}T00:00:00Z`)
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
        ctx.addIssue({ code: 'custom', message: `Enter a valid ${label}` })
        return z.NEVER
      }
      return d
    })
const httpsUrl = z
  .string({ error: 'Enter the link' })
  .trim()
  .max(500, 'Use a shorter link')
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password
    } catch {
      return false
    }
  }, 'Enter a full https:// link')
const gradYear = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null
    const n = Number(v)
    if (!Number.isInteger(n) || n < 2020 || n > 2045) {
      ctx.addIssue({ code: 'custom', message: 'Enter a class year between 2020 and 2045' })
      return z.NEVER
    }
    return n
  })

/** Validates an event listing. `today` bounds the dates: no past events, nothing too far ahead. */
export function eventInputSchema(today: Date) {
  return z
    .object({
      name: text(120, 'the event name'),
      kind: z.enum(['SHOWCASE', 'CAMP', 'COMBINE', 'TOURNAMENT'], { error: 'Choose the type of event' }),
      sport: z.enum(['BASEBALL', 'HOCKEY', 'FOOTBALL'], { error: 'Choose a sport' }),
      organizer: text(120, 'the organizer'),
      officialUrl: httpsUrl,
      startDate: dateOnly('start date'),
      endDate: dateOnly('end date'),
      city: text(80, 'the city'),
      state: z.string({ error: 'Choose a state' }).refine((v) => STATE_CODES.has(v), 'Choose a state'),
      venue: optionalText(120),
      gradYearMin: gradYear,
      gradYearMax: gradYear,
      costText: optionalText(80),
      description: z
        .string({ error: 'Describe the event' })
        .transform((v) => sanitizeText(v, { multiline: true }))
        .pipe(z.string().min(20, 'Describe the event in at least 20 characters').max(1000, 'Use at most 1000 characters')),
    })
    .superRefine((v, ctx) => {
      const start = v.startDate.getTime()
      const end = v.endDate.getTime()
      if (end < start) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date is before the start date' })
      else if ((end - start) / DAY > EVENT_POLICY.maxDurationDays) ctx.addIssue({ code: 'custom', path: ['endDate'], message: `Events can last at most ${EVENT_POLICY.maxDurationDays} days` })
      if (end < today.getTime()) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'This event has already ended' })
      if ((start - today.getTime()) / DAY > EVENT_POLICY.maxLeadDays) ctx.addIssue({ code: 'custom', path: ['startDate'], message: 'Events can be listed up to 18 months ahead' })
      if (v.gradYearMin && v.gradYearMax && v.gradYearMin > v.gradYearMax) ctx.addIssue({ code: 'custom', path: ['gradYearMax'], message: 'The last class year is before the first' })
    })
}
export type EventInput = z.output<ReturnType<typeof eventInputSchema>>

export const periodInputSchema = z
  .object({
    sport: z.enum(['BASEBALL', 'HOCKEY', 'FOOTBALL']),
    division: z.enum(['D1', 'D2', 'D3', 'NAIA', 'JUCO']),
    kind: z.enum(['CONTACT', 'EVALUATION', 'QUIET', 'DEAD']),
    startDate: dateOnly('start date'),
    endDate: dateOnly('end date'),
    sourceUrl: httpsUrl,
    sourceTitle: text(160, 'the source title'),
    note: optionalText(300),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date is before the start date' })
export type PeriodInput = z.output<typeof periodInputSchema>

/** UTC midnight of a date, the unit all event and period dates use. */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function overlaps(a: { startDate: Date; endDate: Date }, b: { startDate: Date; endDate: Date }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate
}

export function formatEventDates(start: Date, end: Date, locale = 'en-US'): string {
  const opts = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' } as const
  if (start.getTime() === end.getTime()) return start.toLocaleDateString(locale, opts)
  return `${start.toLocaleDateString(locale, opts)} to ${end.toLocaleDateString(locale, opts)}`
}

/** schema.org Event for search results. Only facts from the staff-checked listing. */
export function eventJsonLd(event: { name: string; startDate: Date; endDate: Date; city: string; state: string; venue: string | null; organizer: string; officialUrl: string; description: string; status: 'PUBLISHED' | 'CANCELED' }, pageUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    startDate: event.startDate.toISOString().slice(0, 10),
    endDate: event.endDate.toISOString().slice(0, 10),
    eventStatus: event.status === 'CANCELED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: event.venue ?? `${event.city}, ${event.state}`, address: { '@type': 'PostalAddress', addressLocality: event.city, addressRegion: event.state, addressCountry: 'US' } },
    organizer: { '@type': 'Organization', name: event.organizer, url: event.officialUrl },
    description: event.description,
    url: pageUrl,
  }
}
