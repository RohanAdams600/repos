import 'server-only'
import type { DeletionRequester, Prisma } from '@/generated/prisma/client'
import { audit } from '@/lib/audit'
import { deleteAuthUser } from '@/lib/auth/supabase-admin'
import { stripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { pepperedHash } from '@/lib/security/hash'
import { deleteObject, deletePrefix } from '@/lib/storage/gcs'

/**
 * Account deletion.
 *
 * A request (by the user, their guardian, or an admin acting on a written request) schedules
 * deletion 7 days out. During that window the account still works, the profile is forced private,
 * and the person can cancel by signing in; a confirmation email goes out immediately so a hijacked
 * account cannot be erased silently, and any subscription is set not to renew (restored if the request
 * is canceled). The worker then removes, in order: the Stripe customer (which
 * cancels any subscription), stored videos, the Supabase login, and finally every database row
 * (cascading). External steps run first and are recorded on the receipt, so a failed run resumes
 * where it stopped. Only a receipt with a keyed hash of the user id remains.
 */

export const DELETION_GRACE_DAYS = 7
const DAY_MS = 24 * 3600_000
type Step = 'stripe' | 'storage' | 'auth' | 'database'

export function deletionSubjectHash(userId: string): string {
  return pepperedHash(`deletion-subject:${userId}`)
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

const LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const
/** Marks renewals we switched off for a pending deletion, so canceling the deletion restores only those. */
const PAUSE_FLAG = 'ks_deletion_pause'

/** No renewal charge should land inside the 7-day window for an account that is about to disappear. */
async function pauseRenewals(userId: string): Promise<void> {
  const subs = await db.subscription.findMany({ where: { userId, status: { in: [...LIVE_STATUSES] }, cancelAtPeriodEnd: false }, select: { id: true } })
  for (const { id } of subs) {
    try {
      await stripe().subscriptions.update(id, { cancel_at_period_end: true, metadata: { [PAUSE_FLAG]: '1' } })
      await db.subscription.update({ where: { id }, data: { cancelAtPeriodEnd: true } })
    } catch (error) {
      logger.error({ subscriptionId: id, ...errorFields(error) }, 'could not pause renewal for pending deletion')
    }
  }
}

async function resumeRenewals(userId: string): Promise<void> {
  const subs = await db.subscription.findMany({ where: { userId, status: { in: [...LIVE_STATUSES] }, cancelAtPeriodEnd: true }, select: { id: true } })
  for (const { id } of subs) {
    try {
      const remote = await stripe().subscriptions.retrieve(id)
      if (remote.metadata[PAUSE_FLAG] !== '1' || !remote.cancel_at_period_end || remote.status === 'canceled') continue
      // An empty string removes the metadata key.
      await stripe().subscriptions.update(id, { cancel_at_period_end: false, metadata: { [PAUSE_FLAG]: '' } })
      await db.subscription.update({ where: { id }, data: { cancelAtPeriodEnd: false } })
    } catch (error) {
      logger.error({ subscriptionId: id, ...errorFields(error) }, 'could not resume renewal after canceled deletion')
    }
  }
}

async function notify(to: string, subject: string, paragraphs: string[], key: string, action?: { label: string; url: string }) {
  const { text, html } = renderEmail({ paragraphs, action })
  try {
    await sendEmail({ to, subject, text, html, idempotencyKey: key })
  } catch (error) {
    logger.error(errorFields(error), 'deletion notification failed')
  }
}

export async function scheduleDeletion(
  userId: string,
  requestedBy: DeletionRequester,
  now: Date = new Date(),
  /** Staff member entering a request received by email or post (requestedBy ADMIN). */
  adminActorId?: string,
): Promise<{ scheduledFor: Date; alreadyScheduled: boolean }> {
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, deletionScheduledFor: true, guardianConsent: { select: { guardianEmail: true, status: true } } },
    })
    if (user.deletionScheduledFor) return { scheduledFor: user.deletionScheduledFor, alreadyScheduled: true, user }
    const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY_MS)
    await tx.user.update({ where: { id: userId }, data: { deletionScheduledFor: scheduledFor, marketingEmailOptIn: false, marketingOptInUpdatedAt: now } })
    await tx.athleteProfile.updateMany({ where: { userId }, data: { isPublic: false } })
    await tx.dataDeletionReceipt.create({
      data: { subjectHash: deletionSubjectHash(userId), requestedBy, requestedAt: now, scheduledFor },
    })
    return { scheduledFor, alreadyScheduled: false, user }
  })

  if (!result.alreadyScheduled) {
    await pauseRenewals(userId)
    const actorId = requestedBy === 'USER' ? userId : requestedBy === 'ADMIN' ? (adminActorId ?? null) : null
    await audit('account.deletion_scheduled', { actorId, targetType: 'user', targetId: userId, metadata: { requestedBy } })
    const when = formatDate(result.scheduledFor)
    const signIn = `${env().APP_URL}/dashboard/settings`
    await notify(
      result.user.email,
      'Your KineticScout account is scheduled for deletion',
      [
        requestedBy === 'GUARDIAN'
          ? 'Your parent or guardian asked us to delete your KineticScout account.'
          : 'We received a request to delete your KineticScout account.',
        `Your account and all of its data (profile, metrics, videos, analyses and billing details) will be permanently deleted on ${when}. Until then your profile is private, and any Pro subscription is set not to renew.`,
        requestedBy === 'GUARDIAN'
          ? 'Only your parent or guardian can cancel this request, using the link in their consent emails. Talk with them if you think this is a mistake.'
          : 'Changed your mind, or did not make this request? Sign in and cancel the deletion before that date. If you did not request this, also change your password.',
      ],
      `deletion-scheduled-${userId}-${result.scheduledFor.getTime()}`,
      requestedBy === 'GUARDIAN' ? undefined : { label: 'Review or cancel deletion', url: signIn },
    )
    const guardian = result.user.guardianConsent
    if (guardian && requestedBy !== 'GUARDIAN') {
      await notify(
        guardian.guardianEmail,
        "Your teen's KineticScout account is scheduled for deletion",
        [`The KineticScout account you are listed as parent or guardian for will be permanently deleted on ${when}, at the account holder's request. No action is needed.`],
        `deletion-scheduled-guardian-${userId}-${result.scheduledFor.getTime()}`,
      )
    }
  }
  return { scheduledFor: result.scheduledFor, alreadyScheduled: result.alreadyScheduled }
}

export type DeletionRequest = { scheduledFor: Date; requestedBy: DeletionRequester }

/** The open (not yet completed or canceled) deletion request for an account, if any. */
export async function activeDeletionRequest(userId: string): Promise<DeletionRequest | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deletionScheduledFor: true } })
  if (!user?.deletionScheduledFor) return null
  const receipt = await db.dataDeletionReceipt.findFirst({
    where: { subjectHash: deletionSubjectHash(userId), completedAt: null, canceledAt: null },
    orderBy: { createdAt: 'desc' },
    select: { requestedBy: true },
  })
  return { scheduledFor: user.deletionScheduledFor, requestedBy: receipt?.requestedBy ?? 'USER' }
}

export type CancelResult = 'canceled' | 'not-scheduled' | 'guardian-requested' | 'user-requested'

/**
 * Cancels a pending deletion. Only the side that asked can withdraw the request: a guardian's
 * request cannot be overridden by the teen signing in, and a guardian cannot stop the account
 * holder's own deletion. Admin-entered requests act for the account holder, who may cancel them.
 */
export async function cancelDeletion(userId: string, by: 'USER' | 'GUARDIAN', now: Date = new Date()): Promise<CancelResult> {
  const request = await activeDeletionRequest(userId)
  if (!request || request.scheduledFor.getTime() <= now.getTime()) return 'not-scheduled'
  const allowed = request.requestedBy === 'GUARDIAN' ? by === 'GUARDIAN' : by === 'USER'
  if (!allowed) return request.requestedBy === 'GUARDIAN' ? 'guardian-requested' : 'user-requested'
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { deletionScheduledFor: null } }),
    db.dataDeletionReceipt.updateMany({ where: { subjectHash: deletionSubjectHash(userId), completedAt: null, canceledAt: null }, data: { canceledAt: now } }),
  ])
  await resumeRenewals(userId)
  await audit('account.deletion_canceled', { actorId: by === 'USER' ? userId : null, targetType: 'user', targetId: userId, metadata: { by } })
  await notify(
    user.email,
    'Your KineticScout account will not be deleted',
    [
      by === 'GUARDIAN'
        ? 'Your parent or guardian canceled the deletion request for your KineticScout account. Your data is unchanged.'
        : 'The deletion request for your KineticScout account was canceled. Your data is unchanged.',
      'Your profile stays private until you choose to make it public again. If a Pro subscription was set not to renew because of the deletion request, renewal is switched back on.',
    ],
    `deletion-canceled-${userId}-${now.getTime()}`,
  )
  return 'canceled'
}

export type DeletionDeps = {
  deleteStripeCustomer: (customerId: string) => Promise<void>
  deleteStoredVideos: (userId: string, objectKeys: string[]) => Promise<void>
  deleteAuthUser: (userId: string) => Promise<void>
  notify: (to: string, subject: string, paragraphs: string[], key: string) => Promise<void>
}

export const defaultDeletionDeps: DeletionDeps = {
  async deleteStripeCustomer(customerId) {
    try {
      // Deleting the customer cancels every subscription immediately. Stripe keeps invoices for accounting.
      await stripe().customers.del(customerId)
    } catch (error) {
      if ((error as { code?: string }).code !== 'resource_missing') throw error
    }
  },
  async deleteStoredVideos(userId, objectKeys) {
    for (const key of objectKeys) await deleteObject(key)
    await deletePrefix(`videos/${userId}/`)
  },
  async deleteAuthUser(userId) {
    try {
      await deleteAuthUser(userId)
    } catch (error) {
      if (!/not found/i.test((error as Error).message)) throw error
    }
  },
  notify,
}

/** Executes a due deletion. Safe to retry: completed steps are skipped. */
export async function executeDeletion(userId: string, deps: DeletionDeps = defaultDeletionDeps, now: Date = new Date()): Promise<'deleted' | 'not-due'> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      stripeCustomerId: true,
      deletionScheduledFor: true,
      guardianConsent: { select: { guardianEmail: true } },
      athleteProfile: { select: { videoAnalyses: { select: { objectKey: true } } } },
    },
  })
  if (!user?.deletionScheduledFor || user.deletionScheduledFor.getTime() > now.getTime()) return 'not-due'

  const subjectHash = deletionSubjectHash(userId)
  const receipt =
    (await db.dataDeletionReceipt.findFirst({ where: { subjectHash, completedAt: null, canceledAt: null }, orderBy: { createdAt: 'desc' } })) ??
    (await db.dataDeletionReceipt.create({ data: { subjectHash, requestedBy: 'USER', requestedAt: now, scheduledFor: user.deletionScheduledFor } }))
  const done = new Set<Step>(Array.isArray(receipt.steps) ? (receipt.steps as Step[]) : [])
  const mark = async (step: Step) => {
    done.add(step)
    await db.dataDeletionReceipt.update({ where: { id: receipt.id }, data: { steps: [...done] as Prisma.InputJsonValue } })
  }

  if (!done.has('stripe')) {
    if (user.stripeCustomerId) await deps.deleteStripeCustomer(user.stripeCustomerId)
    await mark('stripe')
  }
  if (!done.has('storage')) {
    await deps.deleteStoredVideos(userId, user.athleteProfile?.videoAnalyses.map((v) => v.objectKey) ?? [])
    await mark('storage')
  }
  if (!done.has('auth')) {
    await deps.deleteAuthUser(userId)
    await mark('auth')
  }

  await db.$transaction([
    db.contactMessage.deleteMany({ where: { email: user.email } }),
    db.user.delete({ where: { id: userId } }),
    db.dataDeletionReceipt.update({ where: { id: receipt.id }, data: { steps: [...done, 'database'] as Prisma.InputJsonValue, completedAt: now } }),
  ])
  await audit('account.deleted', { targetType: 'data_deletion_receipt', targetId: receipt.id })

  await deps.notify(
    user.email,
    'Your KineticScout account has been deleted',
    [
      'Your KineticScout account and its data have been permanently deleted: profile, metrics, videos, analyses, recruiting pipeline and login. Any subscription was canceled.',
      `For our records we keep only an anonymous receipt (reference ${receipt.id}) showing that the request was completed.`,
    ],
    `deletion-completed-${receipt.id}`,
  )
  if (user.guardianConsent) {
    await deps.notify(user.guardianConsent.guardianEmail, "Your teen's KineticScout account has been deleted", ['The KineticScout account you were listed as parent or guardian for has been permanently deleted.'], `deletion-completed-guardian-${receipt.id}`)
  }
  return 'deleted'
}

/** Called by the worker sweep. Processes a bounded batch; failures are logged and retried next sweep. */
export async function processDueDeletions(now: Date = new Date(), deps: DeletionDeps = defaultDeletionDeps): Promise<{ deleted: number; failed: number }> {
  const due = await db.user.findMany({ where: { deletionScheduledFor: { lte: now } }, select: { id: true }, take: 20, orderBy: { deletionScheduledFor: 'asc' } })
  let deleted = 0
  let failed = 0
  for (const { id } of due) {
    try {
      if ((await executeDeletion(id, deps, now)) === 'deleted') deleted++
    } catch (error) {
      failed++
      logger.error({ ...errorFields(error) }, 'account deletion step failed; will retry')
    }
  }
  return { deleted, failed }
}
