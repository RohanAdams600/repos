'use server'

import { redirect } from 'next/navigation'
import {
  grantConsentFromAccount,
  guardianCancelDeletion,
  guardianRequestDeletion,
  manageContextForConsent,
  regrantConsent,
  revokeConsent,
} from '@/lib/auth/guardian-manage'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { guardianDecideContactRequest } from '@/lib/coach/contact'
import { db } from '@/lib/db'
import { isEngaged } from '@/lib/family/service'
import type { FormState } from '@/lib/forms'
import { guardianAccountCloseThread, guardianAccountReport } from '@/lib/messaging/service'
import { rateLimit } from '@/lib/security/rate-limit'
import { guardianDecideTeamMember } from '@/lib/teams/service'

const NOT_FOUND = 'This athlete is not linked to your account.'
const str = (formData: FormData, key: string) => String(formData.get(key) ?? '')

/**
 * Every guardian action from the Family pages. Authority is re-checked on each call: the athlete's
 * guardian consent must name this account's email (guardedAthlete), and each item (team request,
 * contact request, conversation) must belong to that athlete.
 */
export async function familyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireGuardian()
  if (!(await rateLimit('familyAction', user.id)).success) return { status: 'error', message: 'Too many requests. Wait a few minutes and try again.' }
  const athlete = await guardedAthlete(user, str(formData, 'athleteId'))
  if (!athlete) return { status: 'error', message: NOT_FOUND }
  const ctx = await manageContextForConsent(athlete.consentId)
  if (!ctx) return { status: 'error', message: NOT_FOUND }
  const intent = str(formData, 'intent')
  const name = athlete.firstName
  const back = `/dashboard/family/${athlete.athleteId}`

  // Before consent, the only action is giving it. Ongoing controls follow the guardian's decision.
  if (intent !== 'grant' && !isEngaged(athlete.consentStatus)) return { status: 'error', message: `Give or decline consent for ${name}'s account first.` }

  switch (intent) {
    case 'grant': {
      if (athlete.consentStatus !== 'PENDING') return { status: 'error', message: 'Consent has already been answered for this account.' }
      if (formData.get('attest') !== 'on') return { status: 'error', message: 'Check the box to confirm.', fieldErrors: { attest: 'Required to give consent' } }
      if (!(await grantConsentFromAccount(ctx, user.id))) return { status: 'error', message: 'Consent has already been answered for this account.' }
      break
    }
    case 'revoke': {
      if (ctx.status !== 'GRANTED') return { status: 'error', message: 'Consent is not currently given for this account.' }
      await revokeConsent(ctx, { cancelSubscription: formData.get('cancelSubscription') === 'on', guardianUserId: user.id })
      break
    }
    case 'regrant': {
      if (ctx.status !== 'REVOKED') return { status: 'error', message: 'Consent is already given for this account.' }
      if (formData.get('attest') !== 'on') return { status: 'error', message: 'Check the box to confirm.', fieldErrors: { attest: 'Required to give consent' } }
      await regrantConsent(ctx, user.id)
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
    case 'team-approve':
    case 'team-decline': {
      const memberId = str(formData, 'itemId')
      const owned = /^[0-9a-f-]{36}$/i.test(memberId) && (await db.teamMember.count({ where: { id: memberId, athleteId: athlete.athleteId } })) === 1
      const result = owned ? await guardianDecideTeamMember(memberId, intent === 'team-approve', new Date(), user.id) : 'invalid'
      if (result === 'invalid') return { status: 'error', message: 'This request was already answered or has expired.' }
      break
    }
    case 'contact-approve':
    case 'contact-decline': {
      const requestId = str(formData, 'itemId')
      const owned = /^[0-9a-f-]{36}$/i.test(requestId) && (await db.contactRequest.count({ where: { id: requestId, athleteId: athlete.athleteId } })) === 1
      const result = owned ? await guardianDecideContactRequest(requestId, intent === 'contact-approve', new Date(), user.id) : 'invalid'
      if (result === 'invalid') return { status: 'error', message: 'This request was already answered or has expired.' }
      break
    }
    case 'close-thread': {
      const threadId = str(formData, 'itemId')
      if (!(await guardianAccountCloseThread(user.id, athlete.athleteId, threadId))) return { status: 'error', message: 'This conversation has already ended.' }
      redirect(`${back}/messages/${threadId}?done=close-thread`)
    }
    case 'report': {
      const threadId = str(formData, 'itemId')
      const reason = str(formData, 'reason').trim()
      if (reason.length < 5) return { status: 'error', message: 'Tell us briefly what is wrong.', fieldErrors: { reason: 'At least 5 characters' } }
      if (!(await rateLimit('messageReport', user.id)).success) return { status: 'error', message: 'Too many reports. Wait an hour and try again, or use our contact page.' }
      if (!(await guardianAccountReport(user.id, athlete.athleteId, threadId, str(formData, 'messageId'), reason))) return { status: 'error', message: 'We could not find that message.' }
      redirect(`${back}/messages/${threadId}?done=report`)
    }
    default:
      return { status: 'error', message: 'Unknown request.' }
  }
  redirect(`${back}?done=${intent}`)
}
