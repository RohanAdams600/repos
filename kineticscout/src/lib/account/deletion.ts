import 'server-only'
import type { DeletionRequester, Prisma } from '@/generated/prisma/client'
import { audit } from '@/lib/audit'
import { deleteAuthUser } from '@/lib/auth/supabase-admin'
import { stripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderLocalizedEmail, type LocalizedEmail } from '@/lib/email/localized'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { pepperedHash } from '@/lib/security/hash'
import { isLocale, type Locale } from '@/i18n/config'
import type { Localized } from '@/i18n/define'
import { formatDay } from '@/i18n/messages/domain'
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

function formatDate(date: Date): Localized {
  return { en: formatDay(date, 'en'), es: formatDay(date, 'es') }
}

const asLocale = (value: string | null | undefined): Locale => (isLocale(value) ? value : 'en')

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

async function notify(to: string, locale: Locale, message: LocalizedEmail, key: string) {
  const { subject, text, html } = renderLocalizedEmail(message, locale)
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
      select: { email: true, locale: true, deletionScheduledFor: true, guardianConsent: { select: { guardianEmail: true, status: true, locale: true } } },
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
    const byGuardian = requestedBy === 'GUARDIAN'
    await notify(
      result.user.email,
      asLocale(result.user.locale),
      {
        subject: { en: 'Your KineticScout account is scheduled for deletion', es: 'Tu cuenta de KineticScout está programada para eliminarse' },
        paragraphs: [
          byGuardian
            ? { en: 'Your parent or guardian asked us to delete your KineticScout account.', es: 'Tu padre, madre o tutor nos pidió eliminar tu cuenta de KineticScout.' }
            : { en: 'We received a request to delete your KineticScout account.', es: 'Recibimos una solicitud para eliminar tu cuenta de KineticScout.' },
          {
            en: `Your account and all of its data (profile, metrics, videos, analyses and billing details) will be permanently deleted on ${when.en}. Until then your profile is private, and any Pro subscription is set not to renew.`,
            es: `Tu cuenta y todos sus datos (perfil, métricas, videos, análisis y datos de facturación) se eliminarán de forma permanente el ${when.es}. Hasta entonces tu perfil es privado, y cualquier suscripción Pro queda sin renovación.`,
          },
          byGuardian
            ? {
                en: 'Only your parent or guardian can cancel this request, using the link in their consent emails. Talk with them if you think this is a mistake.',
                es: 'Solo tu padre, madre o tutor puede cancelar esta solicitud, con el enlace de sus correos de consentimiento. Habla con esa persona si crees que es un error.',
              }
            : {
                en: 'Changed your mind, or did not make this request? Sign in and cancel the deletion before that date. If you did not request this, also change your password.',
                es: '¿Cambiaste de opinión o no hiciste esta solicitud? Inicia sesión y cancela la eliminación antes de esa fecha. Si no la solicitaste, cambia también tu contraseña.',
              },
        ],
        action: byGuardian ? undefined : { label: { en: 'Review or cancel deletion', es: 'Revisar o cancelar la eliminación' }, url: signIn },
      },
      `deletion-scheduled-${userId}-${result.scheduledFor.getTime()}`,
    )
    const guardian = result.user.guardianConsent
    if (guardian && !byGuardian) {
      await notify(
        guardian.guardianEmail,
        asLocale(guardian.locale),
        {
          subject: { en: "Your teen's KineticScout account is scheduled for deletion", es: 'La cuenta de KineticScout de tu hijo o hija está programada para eliminarse' },
          paragraphs: [
            {
              en: `The KineticScout account you are listed as parent or guardian for will be permanently deleted on ${when.en}, at the account holder's request. No action is needed.`,
              es: `La cuenta de KineticScout en la que apareces como padre, madre o tutor se eliminará de forma permanente el ${when.es}, a petición del titular de la cuenta. No necesitas hacer nada.`,
            },
          ],
        },
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
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, locale: true } })
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { deletionScheduledFor: null } }),
    db.dataDeletionReceipt.updateMany({ where: { subjectHash: deletionSubjectHash(userId), completedAt: null, canceledAt: null }, data: { canceledAt: now } }),
  ])
  await resumeRenewals(userId)
  await audit('account.deletion_canceled', { actorId: by === 'USER' ? userId : null, targetType: 'user', targetId: userId, metadata: { by } })
  await notify(
    user.email,
    asLocale(user.locale),
    {
      subject: { en: 'Your KineticScout account will not be deleted', es: 'Tu cuenta de KineticScout no se eliminará' },
      paragraphs: [
        by === 'GUARDIAN'
          ? { en: 'Your parent or guardian canceled the deletion request for your KineticScout account. Your data is unchanged.', es: 'Tu padre, madre o tutor canceló la solicitud para eliminar tu cuenta de KineticScout. Tus datos no cambiaron.' }
          : { en: 'The deletion request for your KineticScout account was canceled. Your data is unchanged.', es: 'Se canceló la solicitud para eliminar tu cuenta de KineticScout. Tus datos no cambiaron.' },
        {
          en: 'Your profile stays private until you choose to make it public again. If a Pro subscription was set not to renew because of the deletion request, renewal is switched back on.',
          es: 'Tu perfil sigue siendo privado hasta que decidas hacerlo público de nuevo. Si una suscripción Pro quedó sin renovación por la solicitud de eliminación, la renovación vuelve a activarse.',
        },
      ],
    },
    `deletion-canceled-${userId}-${now.getTime()}`,
  )
  return 'canceled'
}

export type DeletionDeps = {
  deleteStripeCustomer: (customerId: string) => Promise<void>
  deleteStoredVideos: (userId: string, objectKeys: string[]) => Promise<void>
  deleteAuthUser: (userId: string) => Promise<void>
  notify: (to: string, locale: Locale, message: LocalizedEmail, key: string) => Promise<void>
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
      locale: true,
      stripeCustomerId: true,
      deletionScheduledFor: true,
      guardianConsent: { select: { guardianEmail: true, locale: true } },
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
    asLocale(user.locale),
    {
      subject: { en: 'Your KineticScout account has been deleted', es: 'Se eliminó tu cuenta de KineticScout' },
      paragraphs: [
        {
          en: 'Your KineticScout account and its data have been permanently deleted: profile, metrics, videos, analyses, recruiting pipeline and login. Any subscription was canceled.',
          es: 'Tu cuenta de KineticScout y sus datos se eliminaron de forma permanente: perfil, métricas, videos, análisis, lista de reclutamiento y acceso. Cualquier suscripción se canceló.',
        },
        {
          en: `For our records we keep only an anonymous receipt (reference ${receipt.id}) showing that the request was completed.`,
          es: `Para nuestros registros solo guardamos un comprobante anónimo (referencia ${receipt.id}) que muestra que la solicitud se completó.`,
        },
      ],
    },
    `deletion-completed-${receipt.id}`,
  )
  if (user.guardianConsent) {
    await deps.notify(
      user.guardianConsent.guardianEmail,
      asLocale(user.guardianConsent.locale),
      {
        subject: { en: "Your teen's KineticScout account has been deleted", es: 'Se eliminó la cuenta de KineticScout de tu hijo o hija' },
        paragraphs: [{ en: 'The KineticScout account you were listed as parent or guardian for has been permanently deleted.', es: 'La cuenta de KineticScout en la que aparecías como padre, madre o tutor se eliminó de forma permanente.' }],
      },
      `deletion-completed-guardian-${receipt.id}`,
    )
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
