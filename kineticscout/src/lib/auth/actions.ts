'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { ageBand } from '@/lib/auth/age'
import { AGE_SCREEN_COOKIE, AGE_SCREEN_COOKIE_MAX_AGE, hardenCookieOptions, isSecureCookieEnvironment } from '@/lib/auth/cookies'
import { recordGuardianContact } from '@/lib/auth/guardian'
import { getAuthIdentity } from '@/lib/auth/session'
import { deleteAuthUser } from '@/lib/auth/supabase-admin'
import { createSupabaseServerClient } from '@/lib/auth/supabase'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { fieldErrorsFrom, formValues, type FormState } from '@/lib/forms'
import { UTM_COOKIE } from '@/lib/consent'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'
import { parseUtm } from '@/lib/marketing/utm'
import { errorFields, logger } from '@/lib/logger'
import { pepperedHash } from '@/lib/security/hash'
import { safeRedirectPath } from '@/lib/security/origin'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { getLocale } from '@/i18n/server'
import {
  accountCompletionSchema,
  passwordResetRequestSchema,
  passwordUpdateSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'

const SECRET_FIELDS = ['password', 'confirmPassword'] as const

// The message for a failed age screen is deliberately neutral: it does not reveal the cutoff
// or invite the visitor to try a different date (FTC guidance on neutral age screens).
const AGE_SCREEN_MESSAGE = "Sorry, we can't create a KineticScout account for you."

const TOO_MANY = 'Too many attempts. Wait a few minutes and try again.'

async function setAgeScreenCookie(): Promise<void> {
  const store = await cookies()
  store.set(AGE_SCREEN_COOKIE, '1', {
    ...hardenCookieOptions({}, isSecureCookieEnvironment(env().APP_URL)),
    maxAge: AGE_SCREEN_COOKIE_MAX_AGE,
  })
}

/** First-touch UTM values; the cookie only exists if the visitor granted analytics consent. */
async function acquisitionFromCookie(): Promise<Record<string, string> | undefined> {
  const raw = (await cookies()).get(UTM_COOKIE)?.value
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const utm = parseUtm(new URLSearchParams(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string')))
    return Object.keys(utm).length ? utm : undefined
  } catch {
    return undefined
  }
}

async function ageScreenAlreadyFailed(): Promise<boolean> {
  return (await cookies()).get(AGE_SCREEN_COOKIE)?.value === '1'
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, SECRET_FIELDS)

  if (!(await rateLimit('signUp', await hashedClientIp())).success) {
    return { status: 'error', message: TOO_MANY, values }
  }
  if (await ageScreenAlreadyFailed()) return { status: 'error', message: AGE_SCREEN_MESSAGE }

  const parsed = signUpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const input = parsed.data
  const locale = await getLocale()

  const band = ageBand(input.dateOfBirth)
  if (band === 'UNDER_13') {
    // Nothing from this submission is stored or sent anywhere.
    await setAgeScreenCookie()
    await audit('auth.age_screen_refused')
    return { status: 'error', message: AGE_SCREEN_MESSAGE }
  }
  if (input.accountType !== 'ATHLETE' && band !== 'ADULT') {
    return { status: 'error', message: 'Coach and parent accounts are for adults.', fieldErrors: { accountType: 'Choose Athlete' }, values }
  }
  if (band === 'MINOR' && !input.guardianEmail) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { guardianEmail: "Enter a parent or guardian's email address" },
      values,
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: `${env().APP_URL}/auth/confirm?next=/onboarding` },
  })

  if (error) {
    if (error.code === 'weak_password') {
      return {
        status: 'error',
        message: 'Choose a stronger password.',
        fieldErrors: { password: 'This password is too common or has appeared in a data breach. Choose a different one.' },
        values,
      }
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return { status: 'error', message: TOO_MANY, values }
    }
    logger.error({ code: error.code, status: error.status }, 'supabase sign-up failed')
    return { status: 'error', message: 'We could not create your account. Try again in a moment.', values }
  }

  // An existing confirmed address comes back as an obfuscated user with no identities. Treat it
  // exactly like a new sign-up so the response does not reveal whether an email is registered.
  const authUser = data.user
  if (authUser && (authUser.identities?.length ?? 0) > 0) {
    try {
      await db.user.upsert({
        where: { id: authUser.id },
        create: {
          id: authUser.id,
          email: input.email,
          role: input.accountType,
          dateOfBirth: input.dateOfBirth,
          marketingEmailOptIn: input.marketingOptIn === 'on',
          marketingOptInUpdatedAt: new Date(),
          termsVersion: CURRENT_TERMS_VERSION,
          locale,
          termsAcceptedAt: new Date(),
          acquisition: await acquisitionFromCookie(),
        },
        // Never overwrite an existing row from an unauthenticated request.
        update: {},
      })
      if (band === 'MINOR' && input.guardianEmail) await recordGuardianContact(authUser.id, input.guardianEmail, input.guardianLocale ?? locale)
      await audit('auth.sign_up', { actorId: authUser.id, metadata: { role: input.accountType, minor: band === 'MINOR' } })
    } catch (dbError) {
      // The account can still be completed at /onboarding after the email is confirmed.
      logger.error(errorFields(dbError), 'failed to provision application user at sign-up')
    }
  }

  redirect('/sign-up/check-email')
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, SECRET_FIELDS)
  const parsed = signInSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const { email, password, next } = parsed.data

  // Two limits: per IP (spraying many accounts) and per account (guessing one password).
  const [ipLimit, accountLimit] = await Promise.all([
    rateLimit('signIn', await hashedClientIp()),
    rateLimit('signIn', `acct:${pepperedHash(email)}`),
  ])
  if (!ipLimit.success || !accountLimit.success) return { status: 'error', message: TOO_MANY, values }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return { status: 'error', message: 'Confirm your email address first. Check your inbox for the link we sent.', values }
    }
    await audit('auth.sign_in_failed', { metadata: { reason: error.code ?? 'unknown' } })
    return { status: 'error', message: 'Email or password is incorrect.', values }
  }

  redirect(safeRedirectPath(next))
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/')
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData)
  const parsed = passwordResetRequestSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const [ipLimit, accountLimit] = await Promise.all([
    rateLimit('passwordReset', await hashedClientIp()),
    rateLimit('passwordReset', `acct:${pepperedHash(parsed.data.email)}`),
  ])
  if (!ipLimit.success || !accountLimit.success) return { status: 'error', message: TOO_MANY, values }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env().APP_URL}/auth/confirm?next=/reset-password`,
  })
  if (error) logger.warn({ code: error.code }, 'password reset request failed')

  // Same answer whether or not the address has an account.
  return {
    status: 'success',
    message: 'If an account exists for that address, a reset link is on its way. It expires in 1 hour.',
  }
}

export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const identity = await getAuthIdentity()
  if (!identity) return { status: 'error', message: 'Your reset link has expired. Request a new one.' }

  const parsed = passwordUpdateSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error) }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'weak_password' || error.code === 'same_password') {
      return {
        status: 'error',
        message: 'Choose a different password.',
        fieldErrors: { password: 'Use a password you have not used before and that has not appeared in a data breach.' },
      }
    }
    logger.error({ code: error.code }, 'password update failed')
    return { status: 'error', message: 'We could not update your password. Request a new reset link.' }
  }
  // Sign out other devices after a password change.
  await supabase.auth.signOut({ scope: 'others' })
  redirect('/dashboard?notice=password-updated')
}

// ---------------------------------------------------------------------------
// Account completion (authenticated with Supabase, no application row yet)
// ---------------------------------------------------------------------------

export async function completeAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const identity = await getAuthIdentity()
  if (!identity) redirect('/sign-in?next=/onboarding')

  const values = formValues(formData)
  const parsed = accountCompletionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  }
  const input = parsed.data
  const locale = await getLocale()
  const band = ageBand(input.dateOfBirth)

  if (band === 'UNDER_13') {
    // Remove the authentication record too: no personal information is retained.
    const supabase = await createSupabaseServerClient()
    await supabase.auth.signOut({ scope: 'global' })
    try {
      await deleteAuthUser(identity.id)
    } catch (error) {
      logger.error(errorFields(error), 'failed to delete auth user after age screen')
    }
    await setAgeScreenCookie()
    await audit('auth.age_screen_refused')
    redirect('/sign-up?notice=unavailable')
  }
  if (input.accountType !== 'ATHLETE' && band !== 'ADULT') {
    return { status: 'error', message: 'Coach and parent accounts are for adults.', fieldErrors: { accountType: 'Choose Athlete' }, values }
  }
  if (band === 'MINOR' && !input.guardianEmail) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { guardianEmail: "Enter a parent or guardian's email address" }, values }
  }
  if (input.guardianEmail && input.guardianEmail === identity.email) {
    return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: { guardianEmail: "Use your parent or guardian's email address, not your own" }, values }
  }

  await db.user.upsert({
    where: { id: identity.id },
    create: {
      id: identity.id,
      email: identity.email,
      role: input.accountType,
      dateOfBirth: input.dateOfBirth,
      marketingEmailOptIn: input.marketingOptIn === 'on',
      marketingOptInUpdatedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      locale,
      termsAcceptedAt: new Date(),
      acquisition: await acquisitionFromCookie(),
    },
    update: {},
  })
  if (band === 'MINOR' && input.guardianEmail) await recordGuardianContact(identity.id, input.guardianEmail, input.guardianLocale ?? locale)
  await audit('auth.account_completed', { actorId: identity.id })
  redirect('/onboarding')
}

// ---------------------------------------------------------------------------
// Email link confirmation (sign-up confirmation and password recovery)
// ---------------------------------------------------------------------------

const EMAIL_LINK_TYPES = new Set(['signup', 'email', 'recovery', 'email_change'])

/**
 * Verifies a one-time email link. Runs on POST from a button the person clicks, never on GET,
 * because email security scanners prefetch links and would otherwise burn the one-time token.
 */
export async function verifyEmailLinkAction(formData: FormData): Promise<void> {
  const tokenHash = formData.get('token_hash')
  const type = formData.get('type')
  const next = formData.get('next')
  if (typeof tokenHash !== 'string' || typeof type !== 'string' || !EMAIL_LINK_TYPES.has(type) || tokenHash.length > 200) {
    redirect('/sign-in?notice=link-expired')
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as 'signup' | 'email' | 'recovery' | 'email_change',
  })
  if (error) redirect('/sign-in?notice=link-expired')
  redirect(safeRedirectPath(typeof next === 'string' ? next : null, type === 'recovery' ? '/reset-password' : '/onboarding'))
}
