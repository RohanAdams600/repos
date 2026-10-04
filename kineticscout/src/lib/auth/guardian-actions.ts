'use server'

import { redirect } from 'next/navigation'
import {
  guardianCancelDeletion,
  guardianRequestDeletion,
  lookupManageToken,
  regrantConsent,
  requestManageLinks,
  revokeConsent,
} from '@/lib/auth/guardian-manage'
import { fieldErrorsFrom, formValues, type FormState } from '@/lib/forms'
import { errorFields, logger } from '@/lib/logger'
import { pepperedHash } from '@/lib/security/hash'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { guardianLinkRequestSchema } from '@/lib/validation/guardian'

const LINK_SENT = 'If that address is on file for a KineticScout account, we just emailed it a new management link. It can take a few minutes to arrive.'
const INVALID_LINK = 'This link is not valid or has expired. Request a new one below.'

/** Same answer whether or not the address is on file, so the form cannot be used to look up accounts. */
export async function requestGuardianLinksAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData)
  const parsed = guardianLinkRequestSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { status: 'error', message: 'Check the highlighted fields.', fieldErrors: fieldErrorsFrom(parsed.error), values }
  const email = parsed.data.email
  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit('guardianManage', await hashedClientIp()),
    rateLimit('guardianManage', `email:${pepperedHash(email)}`),
  ])
  if (!ipLimit.success || !emailLimit.success) return { status: 'error', message: 'Too many requests. Wait an hour and try again.', values }
  try {
    await requestManageLinks(email)
  } catch (error) {
    logger.error(errorFields(error), 'guardian management link request failed')
  }
  return { status: 'success', message: LINK_SENT }
}

export async function guardianManageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get('token') ?? '')
  const intent = String(formData.get('intent') ?? '')
  if (!(await rateLimit('guardianManage', await hashedClientIp())).success) return { status: 'error', message: 'Too many requests. Wait an hour and try again.' }
  const ctx = await lookupManageToken(token)
  if (!ctx) return { status: 'error', message: INVALID_LINK }
  const name = ctx.athleteFirstName ?? 'your teen'

  switch (intent) {
    case 'revoke': {
      if (ctx.status !== 'GRANTED') return { status: 'error', message: 'Consent is not currently given for this account.' }
      await revokeConsent(ctx, { cancelSubscription: formData.get('cancelSubscription') === 'on' })
      break
    }
    case 'regrant': {
      if (ctx.status === 'GRANTED') return { status: 'error', message: 'Consent is already given for this account.' }
      if (formData.get('attest') !== 'on') return { status: 'error', message: 'Check the box to confirm.', fieldErrors: { attest: 'Required to give consent' } }
      await regrantConsent(ctx)
      break
    }
    case 'delete': {
      if (ctx.deletionScheduledFor) return { status: 'error', message: 'Deletion is already scheduled for this account.' }
      if (formData.get('confirmDelete') !== 'on') return { status: 'error', message: 'Check the box to confirm.', fieldErrors: { confirmDelete: 'Required to request deletion' } }
      await guardianRequestDeletion(ctx)
      break
    }
    case 'cancel-deletion': {
      if (ctx.deletionRequestedBy !== 'GUARDIAN') return { status: 'error', message: `This deletion was requested by ${name}. Only they can cancel it.` }
      if (!(await guardianCancelDeletion(ctx))) return { status: 'error', message: 'There is no pending deletion to cancel.' }
      break
    }
    default:
      return { status: 'error', message: 'Unknown request.' }
  }
  // Fresh render with the new state; the page shows the outcome from `done`.
  redirect(`/consent/guardian/manage?token=${encodeURIComponent(token)}&done=${intent}`)
}
