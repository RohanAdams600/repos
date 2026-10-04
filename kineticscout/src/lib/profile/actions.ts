'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { getAuthState } from '@/lib/auth/session'
import type { FormState } from '@/lib/forms'
import { rotateProfileSlug, setProfileVisibility } from '@/lib/profile/public'
import { rateLimit } from '@/lib/security/rate-limit'

async function athlete() {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect('/sign-in?next=/dashboard/profile')
  if (state.status === 'needs-account') redirect('/onboarding')
  if (!state.user.termsCurrent) redirect('/terms-update?next=/dashboard/profile')
  return state.user
}

export async function updateVisibilityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await athlete()
  if (!(await rateLimit('apiWrite', user.id)).success) return { status: 'error', message: 'Too many changes. Try again in a minute.' }
  const choice = { isPublic: formData.get('isPublic') === 'on', showGpa: formData.get('showGpa') === 'on', showSchool: formData.get('showSchool') === 'on' }
  const result = await setProfileVisibility(user, choice)
  if (!result.ok) {
    const messages = {
      'consent-required': 'A parent or guardian must give consent before your profile can be public.',
      'deletion-pending': 'Your account is scheduled for deletion, so the profile stays private.',
      'no-profile': 'Create your athlete profile first.',
    } as const
    return { status: 'error', message: messages[result.reason] }
  }
  await audit('profile.visibility_changed', { actorId: user.id, targetType: 'athlete_profile', targetId: user.id, metadata: choice })
  revalidatePath('/dashboard/profile')
  return { status: 'success', message: choice.isPublic ? 'Saved. Your profile link is live.' : 'Saved. Your profile is private; the link shows nothing.' }
}

export async function rotateLinkAction(): Promise<void> {
  const user = await athlete()
  if (!user.hasAthleteProfile) redirect('/onboarding')
  if (!(await rateLimit('apiWrite', user.id)).success) redirect('/dashboard/profile?error=rate-limited')
  await rotateProfileSlug(user.id)
  await audit('profile.link_rotated', { actorId: user.id, targetType: 'athlete_profile', targetId: user.id })
  redirect('/dashboard/profile?notice=link-rotated')
}
