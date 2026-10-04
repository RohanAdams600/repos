import { describe, expect, it } from 'vitest'
import { ageBand, ageOn, isPlausibleDateOfBirth, parseDateOnly } from '@/lib/auth/age'
import {
  canDraftOutreach,
  canPublishProfile,
  canPurchase,
  canUseMatchmaker,
  canUseVideoAnalysis,
  metricLoggingQuota,
  type SessionUser,
} from '@/lib/auth/permissions'
import { signUpSchema } from '@/lib/validation/auth'
import { athleteProfileSchema } from '@/lib/validation/profile'

const now = new Date(Date.UTC(2026, 9, 4))
const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: '00000000-0000-0000-0000-000000000001',
  email: 'a@example.com',
  role: 'ATHLETE',
  tier: 'FREE',
  ageBand: 'ADULT',
  guardianConsent: 'NOT_REQUIRED',
  hasAthleteProfile: true,
  ...overrides,
})

describe('age rules (COPPA)', () => {
  it('computes age on calendar dates', () => {
    expect(ageOn(parseDateOnly('2013-10-04')!, now)).toBe(13)
    expect(ageOn(parseDateOnly('2013-10-05')!, now)).toBe(12)
    expect(ageOn(parseDateOnly('2008-10-04')!, now)).toBe(18)
  })
  it('bands ages at 13 and 18', () => {
    expect(ageBand(parseDateOnly('2013-10-05')!, now)).toBe('UNDER_13')
    expect(ageBand(parseDateOnly('2013-10-04')!, now)).toBe('MINOR')
    expect(ageBand(parseDateOnly('2008-10-05')!, now)).toBe('MINOR')
    expect(ageBand(parseDateOnly('2008-10-04')!, now)).toBe('ADULT')
  })
  it('rejects impossible and implausible dates', () => {
    expect(parseDateOnly('2010-02-30')).toBeNull()
    expect(parseDateOnly('10/04/2010')).toBeNull()
    expect(isPlausibleDateOfBirth(parseDateOnly('2030-01-01')!, now)).toBe(false)
    expect(isPlausibleDateOfBirth(parseDateOnly('1900-01-01')!, now)).toBe(false)
  })
})

describe('permissions', () => {
  it('requires guardian consent for minors to purchase, publish or send outreach', () => {
    const minor = user({ ageBand: 'MINOR', guardianConsent: 'PENDING', tier: 'PRO' })
    expect(canPurchase(minor)).toBe(false)
    expect(canPublishProfile(minor)).toBe(false)
    expect(canDraftOutreach(minor)).toBe(false)
    const approved = { ...minor, guardianConsent: 'GRANTED' as const }
    expect(canPurchase(approved)).toBe(true)
    expect(canPublishProfile(approved)).toBe(true)
    expect(canDraftOutreach(approved)).toBe(true)
  })
  it('gates Pro tools on tier and athlete profile', () => {
    expect(canUseVideoAnalysis(user())).toBe(false)
    expect(canUseVideoAnalysis(user({ tier: 'PRO' }))).toBe(true)
    expect(canUseMatchmaker(user({ tier: 'PRO', hasAthleteProfile: false }))).toBe(false)
    expect(canUseMatchmaker(user({ tier: 'PRO', role: 'COACH' }))).toBe(false)
    expect(canUseMatchmaker(user({ role: 'ADMIN' }))).toBe(true)
  })
  it('limits free athletes to 3 metrics per month', () => {
    expect(metricLoggingQuota(user(), 0)).toEqual({ allowed: true, limit: 3, remaining: 3 })
    expect(metricLoggingQuota(user(), 3)).toEqual({ allowed: false, limit: 3, remaining: 0 })
    expect(metricLoggingQuota(user({ tier: 'PRO' }), 500).allowed).toBe(true)
    expect(metricLoggingQuota(user({ role: 'COACH' }), 0).allowed).toBe(false)
  })
})

describe('sign-up validation', () => {
  const valid = {
    accountType: 'ATHLETE',
    email: ' Player@Example.com ',
    password: 'correct horse battery staple',
    dateOfBirth: '2009-05-01',
    guardianEmail: 'parent@example.com',
    acceptTerms: 'on',
  }
  it('normalizes and accepts a valid submission', () => {
    const parsed = signUpSchema.parse(valid)
    expect(parsed.email).toBe('player@example.com')
    expect(parsed.dateOfBirth.toISOString()).toBe('2009-05-01T00:00:00.000Z')
  })
  it('requires terms, a long password and a guardian email different from the athlete', () => {
    expect(signUpSchema.safeParse({ ...valid, acceptTerms: undefined }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false)
    const same = signUpSchema.safeParse({ ...valid, guardianEmail: 'player@example.com' })
    expect(same.success).toBe(false)
  })
  it('never accepts ADMIN as a self-selected role', () => {
    expect(signUpSchema.safeParse({ ...valid, accountType: 'ADMIN' }).success).toBe(false)
  })
})

describe('athlete profile validation', () => {
  const base = { firstName: 'Mateo', lastName: "O'Neil-Ruiz", sport: 'BASEBALL', primaryPosition: 'SHORTSTOP', gradYear: String(new Date().getUTCFullYear() + 2) }
  it('accepts names with apostrophes and hyphens, and empty optionals', () => {
    const parsed = athleteProfileSchema.parse({ ...base, heightInches: '', gpa: '', twitterHandle: '@mateo_ss' })
    expect(parsed.twitterHandle).toBe('mateo_ss')
    expect(parsed.heightInches).toBeUndefined()
  })
  it('rejects markup in names, invalid GPA and positions from another sport', () => {
    expect(athleteProfileSchema.safeParse({ ...base, firstName: '<script>' }).success).toBe(false)
    expect(athleteProfileSchema.safeParse({ ...base, gpa: '4.123' }).success).toBe(false)
    expect(athleteProfileSchema.safeParse({ ...base, gpa: '5.5' }).success).toBe(false)
    expect(athleteProfileSchema.safeParse({ ...base, primaryPosition: 'GOALIE' }).success).toBe(false)
  })
})
