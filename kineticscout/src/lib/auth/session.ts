import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { ageBand } from '@/lib/auth/age'
import {
  canUseMatchmaker,
  canUseVideoAnalysis,
  hasProAccess,
  isAdmin,
  isGuardian,
  isGuardianOf,
  type GuardianConsentState,
  type SessionUser,
} from '@/lib/auth/permissions'
import { cookies } from 'next/headers'
import { E2E_SESSION_COOKIE, e2eStubEnabled, readE2eSession } from '@/lib/auth/e2e-stub'
import { createSupabaseServerClient } from '@/lib/auth/supabase'
import { db } from '@/lib/db'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

/**
 * Data Access Layer for identity. Every page, Server Action, Route Handler and tRPC procedure
 * resolves the caller through here. The proxy only does coarse redirects; it is never trusted
 * as the authorization boundary.
 */

export type AuthState =
  | { status: 'anonymous' }
  /** Authenticated with Supabase but no application account row yet (sign-up interrupted). */
  | { status: 'needs-account'; authUserId: string; email: string }
  | { status: 'ready'; user: SessionUser }

/** Verified identity from the session JWT (signature and expiry checked by Supabase). */
export const getAuthIdentity = cache(async (): Promise<{ id: string; email: string } | null> => {
  if (e2eStubEnabled()) {
    const userId = readE2eSession((await cookies()).get(E2E_SESSION_COOKIE)?.value, process.env.HASH_PEPPER)
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
      return user ? { id: userId, email: user.email } : null
    }
  }
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  const email = typeof data.claims.email === 'string' ? data.claims.email.toLowerCase() : ''
  return { id: data.claims.sub, email }
})

export const getAuthState = cache(async (): Promise<AuthState> => {
  const identity = await getAuthIdentity()
  if (!identity) return { status: 'anonymous' }

  const row = await db.user.findUnique({
    where: { id: identity.id },
    select: {
      id: true,
      email: true,
      role: true,
      subscriptionTier: true,
      dateOfBirth: true,
      termsVersion: true,
      deletionScheduledFor: true,
      guardianConsent: { select: { status: true } },
      athleteProfile: { select: { userId: true } },
    },
  })
  if (!row) return { status: 'needs-account', authUserId: identity.id, email: identity.email }

  const band = ageBand(row.dateOfBirth)
  // Accounts are never created for under-13s, so this only triggers for corrupted data.
  if (band === 'UNDER_13') return { status: 'anonymous' }

  const guardianConsent: GuardianConsentState =
    band === 'ADULT' ? 'NOT_REQUIRED' : (row.guardianConsent?.status ?? 'PENDING')

  return {
    status: 'ready',
    user: {
      id: row.id,
      email: row.email,
      role: row.role,
      tier: row.subscriptionTier,
      ageBand: band,
      guardianConsent,
      hasAthleteProfile: row.athleteProfile !== null,
      termsCurrent: row.termsVersion === CURRENT_TERMS_VERSION,
      deletionScheduledFor: row.deletionScheduledFor,
    },
  }
})

export async function getSessionUser(): Promise<SessionUser | null> {
  const state = await getAuthState()
  return state.status === 'ready' ? state.user : null
}

/** For pages: signed-in user with a complete account, otherwise redirect. */
export async function requireUser(nextPath = '/dashboard'): Promise<SessionUser> {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  if (state.status === 'needs-account') redirect('/onboarding')
  if (!state.user.termsCurrent) redirect(`/terms-update?next=${encodeURIComponent(nextPath)}`)
  return state.user
}

/** Athletes must finish their profile before using athlete features. */
export async function requireAthlete(nextPath = '/dashboard'): Promise<SessionUser> {
  const user = await requireUser(nextPath)
  if (user.role === 'ATHLETE' && !user.hasAthleteProfile) redirect('/onboarding')
  return user
}

export async function requirePro(feature: 'video-analysis' | 'matchmaker', nextPath: string): Promise<SessionUser> {
  const user = await requireAthlete(nextPath)
  const allowed = feature === 'video-analysis' ? canUseVideoAnalysis(user) : canUseMatchmaker(user)
  if (!allowed) {
    if (!hasProAccess(user)) redirect(`/pricing?feature=${feature}`)
    // Pro but not eligible (coach accounts): athlete-only tools are not offered.
    redirect('/dashboard')
  }
  return user
}

/** Admin pages answer 404 to everyone else so the admin surface is not discoverable. */
export async function requireAdmin(): Promise<SessionUser> {
  const state = await getAuthState()
  if (state.status !== 'ready' || !isAdmin(state.user)) notFound()
  return state.user
}

/** Parent or guardian pages. Other roles go to their own dashboard. */
export async function requireGuardian(nextPath = '/dashboard/family'): Promise<SessionUser> {
  const user = await requireUser(nextPath)
  if (!isGuardian(user)) redirect('/dashboard')
  return user
}

export type GuardedAthlete = {
  consentId: string
  athleteId: string
  firstName: string
  lastName: string
  consentStatus: 'PENDING' | 'GRANTED' | 'REVOKED'
}

/**
 * The athlete a guardian account may act for, or null. Used by every guardian page, action and
 * route before touching an athlete's data; callers answer 404 on null so other athletes' ids
 * reveal nothing.
 */
export async function guardedAthlete(user: SessionUser, athleteId: string): Promise<GuardedAthlete | null> {
  if (!isGuardian(user) || !/^[0-9a-f-]{36}$/i.test(athleteId)) return null
  const consent = await db.guardianConsent.findUnique({
    where: { userId: athleteId },
    select: { id: true, guardianEmail: true, status: true, user: { select: { role: true, athleteProfile: { select: { firstName: true, lastName: true } } } } },
  })
  if (!consent || !isGuardianOf(user, consent) || consent.user.role !== 'ATHLETE' || !consent.user.athleteProfile) return null
  return { consentId: consent.id, athleteId, firstName: consent.user.athleteProfile.firstName, lastName: consent.user.athleteProfile.lastName, consentStatus: consent.status }
}
