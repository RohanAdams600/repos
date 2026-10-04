/**
 * Age rules.
 *
 * - Under 13: no account. COPPA requires verifiable parental consent before collecting personal
 *   information from children under 13; KineticScout does not offer accounts to that group at all,
 *   and nothing typed into the sign-up form is stored when the age screen fails.
 * - 13 to 17: account allowed, private by default. A parent or guardian must consent by email
 *   before the profile can go public, outreach can be sent, or a purchase can be made.
 * - 18 and over: full access.
 */

export const MINIMUM_ACCOUNT_AGE = 13
export const ADULT_AGE = 18

export type AgeBand = 'UNDER_13' | 'MINOR' | 'ADULT'

/** Parses a strict YYYY-MM-DD calendar date into a UTC midnight Date. Rejects impossible dates. */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

/** Whole years between dateOfBirth and `on`, using calendar dates in UTC. */
export function ageOn(dateOfBirth: Date, on: Date): number {
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDiff = on.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1
  return age
}

export function ageBand(dateOfBirth: Date, now: Date = new Date()): AgeBand {
  const age = ageOn(dateOfBirth, now)
  if (age < MINIMUM_ACCOUNT_AGE) return 'UNDER_13'
  if (age < ADULT_AGE) return 'MINOR'
  return 'ADULT'
}

/** Sanity bounds for a date of birth: not in the future and not more than 100 years ago. */
export function isPlausibleDateOfBirth(dateOfBirth: Date, now: Date = new Date()): boolean {
  const age = ageOn(dateOfBirth, now)
  return dateOfBirth.getTime() <= now.getTime() && age <= 100
}
