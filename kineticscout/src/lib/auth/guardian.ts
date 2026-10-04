import 'server-only'
import { audit } from '@/lib/audit'
import { sendConsentConfirmation } from '@/lib/auth/guardian-manage'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { notifyGuardianAccount } from '@/lib/family/notify'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { escapeHtml } from '@/lib/security/sanitize'

const CONSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Stores the guardian address at sign-up without emailing yet (the teen has not confirmed their own email). */
export async function recordGuardianContact(userId: string, guardianEmail: string): Promise<void> {
  await db.guardianConsent.upsert({
    where: { userId },
    create: {
      userId,
      guardianEmail,
      tokenHash: sha256Hex(randomToken()),
      status: 'PENDING',
      expiresAt: new Date(),
    },
    update: {},
  })
}

/**
 * Issues a fresh single-use consent link and emails it to the guardian. Any earlier link stops
 * working because only the newest token hash is stored.
 */
export async function sendGuardianConsentRequest(userId: string): Promise<'sent' | 'already-granted' | 'no-guardian'> {
  const consent = await db.guardianConsent.findUnique({
    where: { userId },
    select: { guardianEmail: true, status: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  if (!consent) return 'no-guardian'
  if (consent.status === 'GRANTED') return 'already-granted'

  const token = randomToken()
  const tokenHash = sha256Hex(token)
  await db.guardianConsent.update({
    where: { userId },
    data: { tokenHash, status: 'PENDING', expiresAt: new Date(Date.now() + CONSENT_TTL_MS), revokedAt: null },
  })

  const appUrl = env().APP_URL
  const link = `${appUrl}/consent/guardian?token=${encodeURIComponent(token)}`
  const athleteName = consent.user.athleteProfile?.firstName ?? 'Your teen'
  const lines = [
    `${athleteName} created a KineticScout account and listed you as their parent or guardian.`,
    '',
    'KineticScout lets high school athletes record performance numbers (for example exit velocity or 60-yard dash time), see how they compare with other athletes, and share a profile with college coaches.',
    '',
    'Until you give consent, the account stays private: the profile cannot be made public, no messages can be sent to coaches, and no purchase can be made.',
    '',
    `To review what we collect and give consent, open this link within 7 days:\n${link}`,
    '',
    `Privacy policy: ${appUrl}/legal/privacy`,
    '',
    `If you have a KineticScout parent account under this email address, you can also answer from your Family page: ${appUrl}/dashboard/family`,
    '',
    'If you do not recognise this request, ignore this email. Nothing becomes public without your consent.',
  ]

  await sendEmail({
    to: consent.guardianEmail,
    subject: `Consent request for ${athleteName}'s KineticScout account`,
    text: lines.join('\n'),
    html: lines
      .map((line) => (line === '' ? '<br>' : `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`))
      .join('\n'),
    idempotencyKey: `guardian-consent-${tokenHash.slice(0, 32)}`,
  })
  await audit('guardian.consent_requested', { actorId: userId, targetType: 'guardian_consent', targetId: userId })
  await notifyGuardianAccount(userId, { title: `${athleteName} listed you as their parent or guardian`, body: 'Review what we collect and give or decline consent on your Family page.', dedupeKey: `guardian-consent-${tokenHash.slice(0, 32)}` })
  return 'sent'
}

export type ConsentLookup =
  | { state: 'invalid' }
  | { state: 'expired' }
  | { state: 'granted' }
  | { state: 'pending'; athleteFirstName: string | null }

export async function lookupGuardianConsent(token: string): Promise<ConsentLookup> {
  if (token.length < 20 || token.length > 100) return { state: 'invalid' }
  const consent = await db.guardianConsent.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { status: true, expiresAt: true, user: { select: { athleteProfile: { select: { firstName: true } } } } },
  })
  if (!consent || consent.status === 'REVOKED') return { state: 'invalid' }
  if (consent.status === 'GRANTED') return { state: 'granted' }
  if (consent.expiresAt.getTime() < Date.now()) return { state: 'expired' }
  return { state: 'pending', athleteFirstName: consent.user.athleteProfile?.firstName ?? null }
}

/** Grants consent atomically; a token can only ever be used once and only while unexpired. */
export async function grantGuardianConsent(token: string): Promise<boolean> {
  const tokenHash = sha256Hex(token)
  const result = await db.guardianConsent.updateMany({
    where: { tokenHash, status: 'PENDING', expiresAt: { gt: new Date() } },
    data: { status: 'GRANTED', grantedAt: new Date() },
  })
  if (result.count !== 1) return false
  const consent = await db.guardianConsent.findUnique({ where: { tokenHash }, select: { id: true, userId: true } })
  await audit('guardian.consent_granted', { targetType: 'guardian_consent', targetId: consent?.userId })
  // The confirmation carries the guardian's management link (withdraw, cancel, delete).
  if (consent) await sendConsentConfirmation(consent.id)
  return true
}
