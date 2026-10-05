import 'server-only'
import { activeDeletionRequest, cancelDeletion, scheduleDeletion } from '@/lib/account/deletion'
import type { DeletionRequester, Prisma } from '@/generated/prisma/client'
import { audit } from '@/lib/audit'
import { endContactOperations } from '@/lib/coach/contact'
import { endTeamOperations } from '@/lib/teams/service'
import { stripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderLocalizedEmail, withLocale, type LocalizedEmail } from '@/lib/email/localized'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { isLocale, type Locale } from '@/i18n/config'
import type { Localized } from '@/i18n/define'
import { randomToken, sha256Hex } from '@/lib/security/hash'

/**
 * Ongoing guardian controls. After consenting, a parent or guardian receives a private management
 * link (valid 1 year, re-issued on request) to withdraw consent, give it again, cancel the teen's
 * subscription, or request deletion of the account, without needing a KineticScout login.
 */

const MANAGE_TTL_MS = 365 * 24 * 3600_000

export function manageUrl(token: string): string {
  return `${env().APP_URL}/consent/guardian/manage?token=${encodeURIComponent(token)}`
}

async function issueManageToken(consentId: string): Promise<string> {
  const token = randomToken()
  await db.guardianConsent.update({
    where: { id: consentId },
    data: { manageTokenHash: sha256Hex(token), manageTokenExpiresAt: new Date(Date.now() + MANAGE_TTL_MS) },
  })
  return token
}

async function safeSend(to: string, locale: Locale, message: LocalizedEmail, key: string) {
  const { subject, text, html } = renderLocalizedEmail(message, locale)
  try {
    await sendEmail({ to, subject, text, html, idempotencyKey: key })
  } catch (error) {
    logger.error(errorFields(error), 'guardian email failed')
  }
}

/** Sent right after consent is granted: confirmation plus the management link. */
export async function sendConsentConfirmation(consentId: string): Promise<void> {
  const consent = await db.guardianConsent.findUniqueOrThrow({
    where: { id: consentId },
    select: { guardianEmail: true, locale: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  const token = await issueManageToken(consentId)
  const first = consent.user.athleteProfile?.firstName
  const en = first ?? 'your teen'
  const es = first ?? 'tu hijo o hija'
  await safeSend(
    consent.guardianEmail,
    isLocale(consent.locale) ? consent.locale : 'en',
    {
      subject: { en: `Consent recorded for ${en}'s KineticScout account`, es: `Consentimiento registrado para la cuenta de KineticScout de ${es}` },
      paragraphs: [
        { en: `Thank you. Your consent for ${en}'s KineticScout account is recorded.`, es: `Gracias. Quedó registrado tu consentimiento para la cuenta de KineticScout de ${es}.` },
        {
          en: 'Keep this email. The link below lets you withdraw consent, cancel a subscription, or ask us to delete the account at any time, without signing in. It works for one year; you can request a new one from our website.',
          es: 'Guarda este correo. El enlace de abajo te permite retirar el consentimiento, cancelar una suscripción o pedirnos que eliminemos la cuenta en cualquier momento, sin iniciar sesión. Funciona durante un año; puedes pedir uno nuevo desde nuestro sitio web.',
        },
      ],
      action: { label: { en: 'Manage consent', es: 'Gestionar el consentimiento' }, url: manageUrl(token) },
    },
    `guardian-confirmation-${consentId}-${token.slice(0, 8)}`,
  )
}

/** Emails fresh management links for every athlete linked to this guardian address. Same answer whether or not any exist. */
export async function requestManageLinks(guardianEmail: string): Promise<void> {
  const consents = await db.guardianConsent.findMany({
    where: { guardianEmail, status: { in: ['GRANTED', 'REVOKED'] } },
    select: { id: true, locale: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  if (consents.length === 0) return
  const locale = isLocale(consents[0]!.locale) ? consents[0]!.locale : 'en'
  const links: Localized[] = []
  for (const consent of consents) {
    const token = await issueManageToken(consent.id)
    const url = manageUrl(token)
    const first = consent.user.athleteProfile?.firstName
    links.push({ en: `${first ?? 'Athlete'}: ${url}`, es: `${first ?? 'Atleta'}: ${withLocale(url, 'es')}` })
  }
  await safeSend(
    guardianEmail,
    locale,
    {
      subject: { en: 'Your KineticScout consent management links', es: 'Tus enlaces para gestionar el consentimiento en KineticScout' },
      paragraphs: [
        { en: 'Here are your private links to manage consent for each KineticScout account you are listed on. Each works for one year.', es: 'Estos son tus enlaces privados para gestionar el consentimiento de cada cuenta de KineticScout en la que apareces. Cada uno funciona durante un año.' },
        ...links,
        { en: 'If you did not ask for these links, you can ignore this email.', es: 'Si no pediste estos enlaces, puedes ignorar este correo.' },
      ],
    },
    `guardian-links-${sha256Hex(guardianEmail).slice(0, 16)}-${Math.floor(Date.now() / 3_600_000)}`,
  )
  await audit('guardian.manage_link_sent', { targetType: 'guardian_consent', targetId: consents[0]!.id, metadata: { count: consents.length } })
}

export type ManageContext = {
  consentId: string
  userId: string
  athleteFirstName: string | null
  status: 'PENDING' | 'GRANTED' | 'REVOKED'
  deletionScheduledFor: Date | null
  deletionRequestedBy: DeletionRequester | null
  liveSubscriptionId: string | null
  cancelAtPeriodEnd: boolean
}

const manageSelect = {
  id: true,
  userId: true,
  status: true,
  manageTokenExpiresAt: true,
  user: {
    select: {
      athleteProfile: { select: { firstName: true } },
      subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } }, select: { id: true, cancelAtPeriodEnd: true }, take: 1 },
    },
  },
} satisfies Prisma.GuardianConsentSelect

export async function lookupManageToken(token: string): Promise<ManageContext | null> {
  if (token.length < 20 || token.length > 100) return null
  const consent = await db.guardianConsent.findUnique({ where: { manageTokenHash: sha256Hex(token) }, select: manageSelect })
  if (!consent || !consent.manageTokenExpiresAt || consent.manageTokenExpiresAt.getTime() < Date.now()) return null
  return manageContext(consent)
}

/** For a signed-in guardian account. The caller has already checked guardedAthlete(). */
export async function manageContextForConsent(consentId: string): Promise<ManageContext | null> {
  const consent = await db.guardianConsent.findUnique({ where: { id: consentId }, select: manageSelect })
  return consent ? manageContext(consent) : null
}

async function manageContext(consent: { id: string; userId: string; status: ManageContext['status']; user: { athleteProfile: { firstName: string } | null; subscriptions: { id: string; cancelAtPeriodEnd: boolean }[] } }): Promise<ManageContext> {
  const live = consent.user.subscriptions[0]
  const deletion = await activeDeletionRequest(consent.userId)
  return {
    consentId: consent.id,
    userId: consent.userId,
    athleteFirstName: consent.user.athleteProfile?.firstName ?? null,
    status: consent.status,
    deletionScheduledFor: deletion?.scheduledFor ?? null,
    deletionRequestedBy: deletion?.requestedBy ?? null,
    liveSubscriptionId: live?.id ?? null,
    cancelAtPeriodEnd: live?.cancelAtPeriodEnd ?? false,
  }
}

/**
 * Withdraws consent. Effective immediately: the profile becomes private, purchases and coach
 * outreach are blocked (see permissions.ts), open coach contact requests are declined, email
 * addresses already shared are removed from coaches' pages, and team memberships end. Optionally
 * stops the subscription from renewing.
 */
export async function revokeConsent(ctx: ManageContext, options: { cancelSubscription: boolean; guardianUserId?: string }): Promise<void> {
  const now = new Date()
  await db.$transaction([
    db.guardianConsent.update({ where: { id: ctx.consentId }, data: { status: 'REVOKED', revokedAt: now } }),
    db.athleteProfile.updateMany({ where: { userId: ctx.userId }, data: { isPublic: false } }),
    ...endContactOperations(ctx.userId, 'guardian', now),
    ...endTeamOperations(ctx.userId, now),
  ])
  if (options.cancelSubscription && ctx.liveSubscriptionId && !ctx.cancelAtPeriodEnd) {
    await stripe().subscriptions.update(ctx.liveSubscriptionId, { cancel_at_period_end: true }, { idempotencyKey: `guardian-cancel-${ctx.liveSubscriptionId}` })
    await db.subscription.update({ where: { id: ctx.liveSubscriptionId }, data: { cancelAtPeriodEnd: true } })
  }
  await audit('guardian.consent_revoked', { actorId: options.guardianUserId, targetType: 'guardian_consent', targetId: ctx.consentId, metadata: { cancelSubscription: options.cancelSubscription, via: options.guardianUserId ? 'account' : 'link' } })
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, locale: true } })
  if (user) {
    await safeSend(
      user.email,
      isLocale(user.locale) ? user.locale : 'en',
      {
        subject: { en: 'Your parent or guardian withdrew consent', es: 'Tu padre, madre o tutor retiró el consentimiento' },
        paragraphs: [
          { en: 'Your parent or guardian has withdrawn consent for your KineticScout account.', es: 'Tu padre, madre o tutor retiró el consentimiento para tu cuenta de KineticScout.' },
          {
            en: 'Your profile is now private, and purchases and messages to coaches are paused. You can still log metrics and see your own numbers. Talk with your parent or guardian if you think this was a mistake.',
            es: 'Tu perfil ahora es privado, y las compras y los mensajes a entrenadores están en pausa. Todavía puedes registrar métricas y ver tus propias cifras. Habla con tu padre, madre o tutor si crees que fue un error.',
          },
        ],
      },
      `guardian-revoked-${ctx.consentId}-${Date.now()}`,
    )
  }
}

export async function regrantConsent(ctx: ManageContext, guardianUserId?: string): Promise<void> {
  await db.guardianConsent.update({ where: { id: ctx.consentId }, data: { status: 'GRANTED', grantedAt: new Date(), revokedAt: null } })
  await audit('guardian.consent_granted', { actorId: guardianUserId, targetType: 'guardian_consent', targetId: ctx.consentId, metadata: { via: guardianUserId ? 'account' : 'manage-link' } })
}

/**
 * First consent given from a guardian account rather than the emailed link. Same effect as the
 * link: the request's single-use token stops working and the confirmation email (with the
 * management link, for use without signing in) is sent.
 */
export async function grantConsentFromAccount(ctx: ManageContext, guardianUserId: string): Promise<boolean> {
  const result = await db.guardianConsent.updateMany({ where: { id: ctx.consentId, status: 'PENDING' }, data: { status: 'GRANTED', grantedAt: new Date(), tokenHash: sha256Hex(randomToken()), expiresAt: new Date() } })
  if (result.count !== 1) return false
  await audit('guardian.consent_granted', { actorId: guardianUserId, targetType: 'guardian_consent', targetId: ctx.consentId, metadata: { via: 'account' } })
  await sendConsentConfirmation(ctx.consentId)
  return true
}

export async function guardianRequestDeletion(ctx: ManageContext): Promise<Date> {
  const { scheduledFor } = await scheduleDeletion(ctx.userId, 'GUARDIAN')
  return scheduledFor
}

export async function guardianCancelDeletion(ctx: ManageContext): Promise<boolean> {
  return (await cancelDeletion(ctx.userId, 'GUARDIAN')) === 'canceled'
}
