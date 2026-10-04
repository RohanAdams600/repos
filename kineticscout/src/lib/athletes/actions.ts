'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { grantGuardianConsent, sendGuardianConsentRequest } from '@/lib/auth/guardian'
import { getAuthState } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { EmailDeliveryError } from '@/lib/email/send'
import { fieldErrorsFrom, formValues, type FormState } from '@/lib/forms'
import { errorFields, logger } from '@/lib/logger'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { athleteProfileSchema } from '@/lib/validation/profile'

export async function createAthleteProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect('/sign-in?next=/onboarding')
  if (state.status === 'needs-account') redirect('/onboarding')
  const user = state.user
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  if (user.hasAthleteProfile) redirect('/dashboard')

  const values = formValues(formData)
  const parsed = athleteProfileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const input = parsed.data

  await db.athleteProfile.create({
    data: {
      userId: user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      sport: input.sport,
      primaryPosition: input.primaryPosition,
      gradYear: input.gradYear,
      heightInches: input.heightInches,
      weightLbs: input.weightLbs,
      gpa: input.gpa,
      highSchool: input.highSchool,
      twitterHandle: input.twitterHandle,
      bats: input.bats,
      throws: input.throws,
      // Private until the athlete chooses otherwise (and, for minors, a guardian consents).
      isPublic: false,
    },
  })
  await audit('profile.created', { actorId: user.id, targetType: 'athlete_profile', targetId: user.id })

  if (user.ageBand === 'MINOR' && user.guardianConsent !== 'GRANTED') {
    try {
      await sendGuardianConsentRequest(user.id)
    } catch (error) {
      // The dashboard shows a resend button; profile creation must not fail on email delivery.
      logger.error(errorFields(error), 'guardian consent email failed after profile creation')
    }
  }
  redirect('/dashboard?notice=profile-created')
}

/** Correcting profile details (right to rectification). Empty optional fields clear the stored value. */
export async function updateAthleteProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect('/sign-in?next=/dashboard/profile')
  if (state.status === 'needs-account') redirect('/onboarding')
  const user = state.user
  if (!user.termsCurrent) redirect('/terms-update?next=/dashboard/profile')
  if (!user.hasAthleteProfile) redirect('/onboarding')

  const values = formValues(formData)
  const parsed = athleteProfileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const input = parsed.data
  const baseball = input.sport === 'BASEBALL'
  await db.athleteProfile.update({
    where: { userId: user.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      sport: input.sport,
      primaryPosition: input.primaryPosition,
      gradYear: input.gradYear,
      heightInches: input.heightInches ?? null,
      weightLbs: input.weightLbs ?? null,
      gpa: input.gpa ?? null,
      highSchool: input.highSchool ?? null,
      twitterHandle: input.twitterHandle ?? null,
      bats: baseball ? (input.bats ?? null) : null,
      throws: baseball ? (input.throws ?? null) : null,
    },
  })
  await audit('profile.updated', { actorId: user.id, targetType: 'athlete_profile', targetId: user.id })
  revalidatePath('/dashboard', 'layout')
  return { status: 'success', message: 'Profile saved.' }
}

export async function resendGuardianConsentAction(_prev: FormState): Promise<FormState> {
  const state = await getAuthState()
  if (state.status !== 'ready') redirect('/sign-in?next=/dashboard')
  const user = state.user
  if (user.ageBand !== 'MINOR') return { status: 'error', message: 'Guardian consent is not needed for this account.' }

  const limit = await rateLimit('guardianEmail', user.id)
  if (!limit.success) return { status: 'error', message: 'A consent email was sent recently. Wait an hour before sending another.' }

  try {
    const result = await sendGuardianConsentRequest(user.id)
    if (result === 'already-granted') return { status: 'success', message: 'Your parent or guardian has already given consent.' }
    if (result === 'no-guardian') return { status: 'error', message: 'No parent or guardian email is on file. Contact support to add one.' }
    return { status: 'success', message: 'Consent email sent. Ask your parent or guardian to check their inbox.' }
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return { status: 'error', message: 'We could not send the email right now. Try again in a few minutes.' }
    }
    throw error
  }
}

export async function grantGuardianConsentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const limit = await rateLimit('guardianEmail', `grant:${await hashedClientIp()}`)
  if (!limit.success) return { status: 'error', message: 'Too many attempts. Try again later.' }

  const token = formData.get('token')
  const attested = formData.get('attest') === 'on'
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) {
    return { status: 'error', message: 'This consent link is not valid.' }
  }
  if (!attested) {
    return {
      status: 'error',
      message: 'Confirm that you are the parent or legal guardian to continue.',
      fieldErrors: { attest: 'Required to give consent' },
    }
  }
  const granted = await grantGuardianConsent(token)
  if (!granted) return { status: 'error', message: 'This consent link has expired or was already used. Ask your teen to send a new one.' }
  return { status: 'success', message: 'Thank you. Consent is recorded.' }
}
