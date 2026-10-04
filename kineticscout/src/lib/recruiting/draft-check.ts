import type { OutreachChannel } from '@/generated/prisma/enums'
import { allowedNumbersFrom, extractNumbers } from '@/lib/content/fact-check'

/** Pure checks for AI outreach drafts (see outreach.ts). */

export type OutreachFacts = {
  athlete: {
    name: string
    gradYear: number
    position: string
    height: string | null
    weightLbs: number | null
    gpa: number | null
    highSchool: string | null
    measurements: { label: string; value: string; measuredOn: string; verified: boolean }[]
    profileUrl: string | null
  }
  program: {
    school: string
    division: string
    conference: string | null
    headCoachName: string | null
    /** Sourced background on the coach; the only coach information the draft may use. */
    headCoachBackground: string | null
    recentSeason: string | null
  }
  occasion: { kind: 'MANUAL' } | { kind: 'COACH_CHANGE'; newCoach: string } | { kind: 'ROSTER_NEED'; need: string }
}

export const DRAFT_LIMITS = { EMAIL: { subject: 120, body: 2000 }, DM: { subject: 0, body: 600 } } as const

export const draftJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'body'],
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
} as const

const BANNED = [/\bguarantee/i, /\bscholarship offer\b/i, /\bcommit(ted)? to you\b/i, /\u2014/]

/**
 * Rejects drafts that use numbers absent from the fact sheet, name a coach other than the one on
 * file, or include an em dash or a promise. Returns the problems found (empty means acceptable).
 */
export function checkDraft(draft: { subject: string; body: string }, facts: OutreachFacts, channel: OutreachChannel): string[] {
  const problems: string[] = []
  const text = `${draft.subject}\n${draft.body}`
  const allowed = allowedNumbersFrom(facts)
  const unknown = [...new Set(extractNumbers(text).filter((n) => !allowed.has(n)))]
  if (unknown.length) problems.push(`numbers not in the fact sheet: ${unknown.join(', ')}`)
  for (const pattern of BANNED) if (pattern.test(text)) problems.push(`banned wording: ${pattern.source}`)
  if (channel === 'EMAIL' && draft.subject.trim().length < 5) problems.push('email needs a subject')
  if (draft.body.length > DRAFT_LIMITS[channel].body) problems.push(`body longer than ${DRAFT_LIMITS[channel].body} characters`)
  if (facts.program.headCoachName) {
    const lastName = facts.program.headCoachName.trim().split(/\s+/).pop()!
    if (!draft.body.includes(lastName)) problems.push('draft does not address the head coach on file')
  }
  if (facts.athlete.profileUrl && !draft.body.includes(facts.athlete.profileUrl)) problems.push('draft must include the profile link')
  return problems
}

export function mailtoHref(to: string | null, subject: string | null, body: string): string | null {
  if (!to) return null
  // The address comes from validated program data, so it is used as is (encoding the @ breaks some clients).
  const href = `mailto:${to}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(body)}`
  // Some mail apps truncate or refuse very long mailto links; fall back to copy and paste.
  return href.length <= 1900 ? href : null
}
