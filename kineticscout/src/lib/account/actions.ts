'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cancelDeletion, scheduleDeletion } from '@/lib/account/deletion'
import { audit } from '@/lib/audit'
import { verifyPassword } from '@/lib/auth/reauth'
import { getAuthState } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { setMarketingOptIn, verifyPreferencesToken } from '@/lib/email/preferences'
import { type FormState } from '@/lib/forms'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { safeRedirectPath } from '@/lib/security/origin'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'

/** Typed confirmation for account deletion; matched case-insensitively. */
const DELETE_CONFIRMATION = 'DELETE'

async function readyUser(nextPath: string) {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`)
  if (state.status === 'needs-account') redirect('/onboarding')
  return state.user
}

// ---------------------------------------------------------------------------
// Email preferences
// ---------------------------------------------------------------------------

export async function updateMarketingPreferenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await readyUser('/dashboard/settings')
  if (!(await rateLimit('emailPreferences', user.id)).success) return { status: 'error', message: 'Too many changes. Try again later.' }
  const optIn = formData.get('marketing') === 'on'
  const updated = await setMarketingOptIn(user.id, optIn, 'settings')
  if (!updated) return { status: 'error', message: 'Product emails cannot be turned on while your account is scheduled for deletion.' }
  revalidatePath('/dashboard/settings')
  return { status: 'success', message: optIn ? 'You will receive occasional product emails.' : 'You will no longer receive product emails.' }
}

/** Preference centre reached from an email link; authenticated by the signed token, not a session. */
export async function updatePreferencesByLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const userId = String(formData.get('u') ?? '')
  const token = String(formData.get('t') ?? '')
  if (!verifyPreferencesToken(userId, token)) return { status: 'error', message: 'This preferences link is not valid. Use the link in a recent email, or sign in and open Settings.' }
  if (!(await rateLimit('emailPreferences', await hashedClientIp())).success) return { status: 'error', message: 'Too many changes. Try again later.' }
  const optIn = formData.get('marketing') === 'on'
  const updated = await setMarketingOptIn(userId, optIn, 'preference-link')
  if (!updated && optIn) return { status: 'error', message: 'Product emails cannot be turned on for this account right now.' }
  return { status: 'success', message: optIn ? 'Saved. You will receive occasional product emails.' : 'Saved. You are unsubscribed from product emails.' }
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await readyUser('/dashboard/settings')
  const password = formData.get('password')
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  const values = { confirmation }

  if (confirmation.toUpperCase() !== DELETE_CONFIRMATION) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { confirmation: `Type ${DELETE_CONFIRMATION} to confirm` }, values }
  }
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { password: 'Enter your password' }, values }
  }
  if (!(await rateLimit('accountDelete', user.id)).success) {
    return { status: 'error', message: 'Too many attempts. Wait an hour and try again.', values }
  }
  if (!(await verifyPassword(user.email, password))) {
    await audit('auth.reauth_failed', { actorId: user.id, metadata: { purpose: 'account-deletion' } })
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { password: 'That password is not correct' }, values }
  }

  await scheduleDeletion(user.id, 'USER')
  redirect(user.termsCurrent ? '/dashboard/settings?notice=deletion-scheduled' : '/terms-update')
}

export async function cancelDeletionAction(_prev: FormState): Promise<FormState> {
  const user = await readyUser('/dashboard/settings')
  const result = await cancelDeletion(user.id, 'USER')
  if (result === 'guardian-requested') {
    return { status: 'error', message: 'Your parent or guardian made this request, so only they can cancel it, using the link in their consent emails.' }
  }
  if (result === 'not-scheduled') return { status: 'error', message: 'There is no pending deletion to cancel.' }
  if (result === 'user-requested') return { status: 'error', message: 'This request cannot be canceled from here. Contact support.' }
  redirect('/dashboard/settings?notice=deletion-canceled')
}

// ---------------------------------------------------------------------------
// Updated terms
// ---------------------------------------------------------------------------

export async function acceptTermsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const next = safeRedirectPath(typeof formData.get('next') === 'string' ? String(formData.get('next')) : null)
  const user = await readyUser(`/terms-update?next=${encodeURIComponent(next)}`)
  if (formData.get('accept') !== 'on') {
    return { status: 'error', message: 'Check the box to accept the updated terms.', fieldErrors: { accept: 'Required to keep using KineticScout' } }
  }
  if (!user.termsCurrent) {
    await db.user.update({ where: { id: user.id }, data: { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() } })
    await audit('legal.terms_accepted', { actorId: user.id, targetType: 'user', targetId: user.id, metadata: { version: CURRENT_TERMS_VERSION } })
  }
  redirect(next)
}
