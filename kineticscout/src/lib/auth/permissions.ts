import type { AgeBand } from '@/lib/auth/age'

/**
 * Authorization policy. Pure functions over the session user so every rule is unit-tested and
 * the same rule is applied in pages, Server Actions, Route Handlers and tRPC procedures.
 */

export type Role = 'ATHLETE' | 'COACH' | 'ADMIN'
export type Tier = 'FREE' | 'PRO'
export type GuardianConsentState = 'NOT_REQUIRED' | 'PENDING' | 'GRANTED' | 'REVOKED'

export type SessionUser = {
  id: string
  email: string
  role: Role
  tier: Tier
  ageBand: Exclude<AgeBand, 'UNDER_13'>
  guardianConsent: GuardianConsentState
  hasAthleteProfile: boolean
}

export const FREE_MONTHLY_METRIC_LIMIT = 3

export function isAdmin(user: SessionUser): boolean {
  return user.role === 'ADMIN'
}

export function hasProAccess(user: SessionUser): boolean {
  return user.tier === 'PRO' || user.role === 'ADMIN'
}

/** Adults, or minors whose parent or guardian has consented. */
export function hasAdultOrGuardianApproval(user: SessionUser): boolean {
  return user.ageBand === 'ADULT' || user.guardianConsent === 'GRANTED'
}

export function canPurchase(user: SessionUser): boolean {
  return hasAdultOrGuardianApproval(user)
}

export function canPublishProfile(user: SessionUser): boolean {
  return user.role === 'ATHLETE' && user.hasAthleteProfile && hasAdultOrGuardianApproval(user)
}

/** Outreach drafts are addressed to third parties (college coaches) on the athlete's behalf. */
export function canDraftOutreach(user: SessionUser): boolean {
  return user.role === 'ATHLETE' && hasProAccess(user) && hasAdultOrGuardianApproval(user)
}

export function canUseVideoAnalysis(user: SessionUser): boolean {
  return user.role !== 'COACH' && user.hasAthleteProfile && hasProAccess(user)
}

export function canUseMatchmaker(user: SessionUser): boolean {
  return user.role !== 'COACH' && user.hasAthleteProfile && hasProAccess(user)
}

export type MetricQuota = { allowed: boolean; limit: number | null; remaining: number | null }

export function metricLoggingQuota(user: SessionUser, loggedThisMonth: number): MetricQuota {
  if (user.role === 'COACH' || !user.hasAthleteProfile) return { allowed: false, limit: 0, remaining: 0 }
  if (hasProAccess(user)) return { allowed: true, limit: null, remaining: null }
  const remaining = Math.max(0, FREE_MONTHLY_METRIC_LIMIT - loggedThisMonth)
  return { allowed: remaining > 0, limit: FREE_MONTHLY_METRIC_LIMIT, remaining }
}

/** Ownership check for athlete-scoped resources. Admins may read but this helper is for writes. */
export function ownsAthleteResource(user: SessionUser, athleteId: string): boolean {
  return user.id === athleteId
}
