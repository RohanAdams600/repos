import 'server-only'
import { ageBand } from '@/lib/auth/age'
import { db } from '@/lib/db'
import { oneClickUnsubscribeUrl, preferencesUrl } from '@/lib/email/preferences'
import { sendEmail } from '@/lib/email/send'
import { renderEmail, type EmailContent } from '@/lib/email/templates'
import { businessDetails } from '@/lib/legal'

export type MarketingSendResult = 'sent' | 'not-opted-in' | 'minor-without-consent' | 'account-closing' | 'no-user'

/**
 * The only way to send a marketing email. It re-checks consent at send time and adds what the law
 * requires (CAN-SPAM, RFC 8058): a one-click unsubscribe header, a visible unsubscribe link, and the
 * sender's postal address. Minors receive marketing only with guardian consent on file.
 */
export async function sendMarketingEmail(
  userId: string,
  message: { subject: string; campaignId: string } & Pick<EmailContent, 'paragraphs' | 'action'>,
): Promise<MarketingSendResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, marketingEmailOptIn: true, dateOfBirth: true, deletionScheduledFor: true, guardianConsent: { select: { status: true } } },
  })
  if (!user) return 'no-user'
  if (!user.marketingEmailOptIn) return 'not-opted-in'
  if (user.deletionScheduledFor) return 'account-closing'
  if (ageBand(user.dateOfBirth) !== 'ADULT' && user.guardianConsent?.status !== 'GRANTED') return 'minor-without-consent'

  const business = businessDetails()
  const preferences = preferencesUrl(userId)
  const { text, html } = renderEmail({
    paragraphs: message.paragraphs,
    action: message.action,
    footer: [
      'You are receiving this because you opted in to KineticScout product news.',
      `Unsubscribe or change your email preferences: ${preferences}`,
      `${business.legalName}, ${business.postalAddress}`,
    ],
  })
  await sendEmail({
    to: user.email,
    subject: message.subject,
    text,
    html,
    idempotencyKey: `marketing-${message.campaignId}-${userId}`,
    unsubscribeUrl: oneClickUnsubscribeUrl(userId),
  })
  return 'sent'
}
