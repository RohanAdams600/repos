import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { ageBand } from '@/lib/auth/age'
import {
  canUseMatchmaker,
  canUseVideoAnalysis,
  hasProAccess,
  isAdmin,
  type GuardianConsentState,
  type SessionUser,
} from '@/lib/auth/permissions'
import { createSupabaseServerClient } from '@/lib/auth/supabase'
import { db } from '@/lib/db'

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
