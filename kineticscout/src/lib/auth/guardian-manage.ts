import 'server-only'
import { activeDeletionRequest, cancelDeletion, scheduleDeletion } from '@/lib/account/deletion'
import type { DeletionRequester } from '@/generated/prisma/client'
import { audit } from '@/lib/audit'
import { endContactOperations } from '@/lib/coach/contact'
import { endTeamOperations } from '@/lib/teams/service'
import { stripe } from '@/lib/billing/stripe'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
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

async function safeSend(to: string, subject: string, paragraphs: string[], key: string, action?: { label: string; url: string }) {
  const { text, html } = renderEmail({ paragraphs, action })
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
    select: { guardianEmail: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  const token = await issueManageToken(consentId)
  const name = consent.user.athleteProfile?.firstName ?? 'your teen'
  await safeSend(
    consent.guardianEmail,
    `Consent recorded for ${name}'s KineticScout account`,
    [
      `Thank you. Your consent for ${name}'s KineticScout account is recorded.`,
      'Keep this email. The link below lets you withdraw consent, cancel a subscription, or ask us to delete the account at any time, without signing in. It works for one year; you can request a new one from our website.',
    ],
    `guardian-confirmation-${consentId}-${token.slice(0, 8)}`,
    { label: 'Manage consent', url: manageUrl(token) },
  )
}

/** Emails fresh management links for every athlete linked to this guardian address. Same answer whether or not any exist. */
export async function requestManageLinks(guardianEmail: string): Promise<void> {
  const consents = await db.guardianConsent.findMany({
    where: { guardianEmail, status: { in: ['GRANTED', 'REVOKED'] } },
    select: { id: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  if (consents.length === 0) return
  const links: string[] = []
  for (const consent of consents) {
    const token = await issueManageToken(consent.id)
    links.push(`${consent.user.athleteProfile?.firstName ?? 'Athlete'}: ${manageUrl(token)}`)
  }
  await safeSend(
    guardianEmail,
    'Your KineticScout consent management links',
    ['Here are your private links to manage consent for each KineticScout account you are listed on. Each works for one year.', ...links, 'If you did not ask for these links, you can ignore this email.'],
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

export async function lookupManageToken(token: string): Promise<ManageContext | null> {
  if (token.length < 20 || token.length > 100) return null
  const consent = await db.guardianConsent.findUnique({
    where: { manageTokenHash: sha256Hex(token) },
    select: {
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
    },
  })
  if (!consent || !consent.manageTokenExpiresAt || consent.manageTokenExpiresAt.getTime() < Date.now()) return null
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
export async function revokeConsent(ctx: ManageContext, options: { cancelSubscription: boolean }): Promise<void> {
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
  await audit('guardian.consent_revoked', { targetType: 'guardian_consent', targetId: ctx.consentId, metadata: { cancelSubscription: options.cancelSubscription } })
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } })
  if (user) {
    await safeSend(
      user.email,
      'Your parent or guardian withdrew consent',
      [
        'Your parent or guardian has withdrawn consent for your KineticScout account.',
        'Your profile is now private, and purchases and messages to coaches are paused. You can still log metrics and see your own numbers. Talk with your parent or guardian if you think this was a mistake.',
      ],
      `guardian-revoked-${ctx.consentId}-${Date.now()}`,
    )
  }
}

export async function regrantConsent(ctx: ManageContext): Promise<void> {
  await db.guardianConsent.update({ where: { id: ctx.consentId }, data: { status: 'GRANTED', grantedAt: new Date(), revokedAt: null } })
  await audit('guardian.consent_granted', { targetType: 'guardian_consent', targetId: ctx.consentId, metadata: { via: 'manage-link' } })
}

export async function guardianRequestDeletion(ctx: ManageContext): Promise<Date> {
  const { scheduledFor } = await scheduleDeletion(ctx.userId, 'GUARDIAN')
  return scheduledFor
}

export async function guardianCancelDeletion(ctx: ManageContext): Promise<boolean> {
  return (await cancelDeletion(ctx.userId, 'GUARDIAN')) === 'canceled'
}
