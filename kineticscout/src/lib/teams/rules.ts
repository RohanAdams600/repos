import { z } from 'zod'
import { Sport, TeamOrgType } from '@/generated/prisma/enums'

/** Team accounts (Phase 6), pure rules shared by the server and the forms. */
export const TEAM_POLICY = {
  maxTeamsPerCoach: 5,
  /** Active plus pending members. */
  maxRoster: 80,
  maxMetricsPerSession: 8,
  guardianLinkDays: 14,
  /** Testing days can be entered up to a year after they happened. */
  sessionMaxAgeDays: 366,
} as const

export const JOIN_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const JOIN_CODE_PATTERN = /^[a-hjkmnp-z2-9]{10}$/

/** Accepts the code as people type it: any case, with spaces or a hyphen in the middle. */
export function normalizeJoinCode(input: string): string {
  return input.toLowerCase().replace(/[\s-]+/g, '')
}

export function isJoinCode(value: string): boolean {
  return JOIN_CODE_PATTERN.test(value)
}

/** Shown as two groups of five, which is easier to read aloud at practice. */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

export const US_STATES: readonly (readonly [string, string])[] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'],
  ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'],
  ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]
const STATE_CODES = new Set(US_STATES.map(([code]) => code))

export const teamDetailsSchema = z.object({
  name: z.string().trim().min(3, 'Name the team, for example "Westlake High School Varsity Baseball"').max(120),
  sport: z.enum(Sport, { error: 'Choose a sport' }),
  orgType: z.enum(TeamOrgType, { error: 'Choose school or club' }),
  organization: z.string().trim().min(3, 'Enter the school or club name').max(160),
  state: z.string().trim().refine((v) => STATE_CODES.has(v), 'Choose a state'),
  coachName: z.string().trim().min(3, 'Your name as it appears on the staff page').max(120),
  coachTitle: z.string().trim().min(2, 'Your title, for example Head Coach').max(80),
  directoryUrl: z.url({ protocol: /^https$/, error: 'Link to the https staff page that lists you' }).max(512),
})
export type TeamDetails = z.infer<typeof teamDetailsSchema>

/** Attribution stored with an accepted value, so it survives even if the team is later deleted. */
export function recordedByLabel(team: { coachName: string; organization: string }, session: { label: string; date: Date }): string {
  return `${team.coachName}, ${team.organization}, ${session.label} on ${session.date.toISOString().slice(0, 10)}`.slice(0, 200)
}
