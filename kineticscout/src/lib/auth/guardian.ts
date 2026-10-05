import 'server-only'
import { audit } from '@/lib/audit'
import { sendConsentConfirmation } from '@/lib/auth/guardian-manage'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { env } from '@/lib/env'
import { notifyGuardianAccount } from '@/lib/family/notify'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { guardianLocale } from '@/i18n/recipient'
import { renderLocalizedEmail, withLocale } from '@/lib/email/localized'

const CONSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Stores the guardian address at sign-up without emailing yet (the teen has not confirmed their own email). */
export async function recordGuardianContact(userId: string, guardianEmail: string, locale: 'en' | 'es' = 'en'): Promise<void> {
  await db.guardianConsent.upsert({
    where: { userId },
    create: {
      userId,
      guardianEmail,
      locale,
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
  const locale = await guardianLocale(userId)
  const first = consent.user.athleteProfile?.firstName
  const name = { en: first ?? 'Your teen', es: first ?? 'Tu hijo o hija' }
  const message = renderLocalizedEmail(
    {
      subject: { en: `Consent request for ${first ? `${first}'s` : 'your teen’s'} KineticScout account`, es: `Solicitud de consentimiento para la cuenta de KineticScout de ${first ?? 'tu hijo o hija'}` },
      paragraphs: [
        { en: `${name.en} created a KineticScout account and listed you as their parent or guardian.`, es: `${name.es} creó una cuenta de KineticScout y te indicó como su padre, madre o tutor.` },
        {
          en: 'KineticScout lets high school athletes record performance numbers (for example exit velocity or 60-yard dash time), see how they compare with other athletes, and share a profile with college coaches.',
          es: 'KineticScout permite a atletas de secundaria registrar cifras de rendimiento (por ejemplo, la velocidad de salida o el tiempo en 60 yardas), ver cómo se comparan con otros atletas y compartir un perfil con entrenadores universitarios.',
        },
        {
          en: 'Until you give consent, the account stays private: the profile cannot be made public, no messages can be sent to coaches, and no purchase can be made.',
          es: 'Hasta que des tu consentimiento, la cuenta sigue siendo privada: el perfil no se puede hacer público, no se pueden enviar mensajes a entrenadores y no se puede hacer ninguna compra.',
        },
        { en: 'To review what we collect and give consent, open the link below within 7 days.', es: 'Para revisar qué datos recopilamos y dar tu consentimiento, abre el enlace de abajo en un plazo de 7 días.' },
        { en: `Privacy policy: ${appUrl}/legal/privacy`, es: `Política de privacidad: ${withLocale(`${appUrl}/legal/privacy`, 'es')}` },
        {
          en: `If you have a KineticScout parent account under this email address, you can also answer from your Family page: ${appUrl}/dashboard/family`,
          es: `Si tienes una cuenta de padre en KineticScout con este correo, también puedes responder desde tu página Familia: ${withLocale(`${appUrl}/dashboard/family`, 'es')}`,
        },
        { en: 'If you do not recognise this request, ignore this email. Nothing becomes public without your consent.', es: 'Si no reconoces esta solicitud, ignora este correo. Nada se hace público sin tu consentimiento.' },
      ],
      action: { label: { en: 'Review and give consent', es: 'Revisar y dar el consentimiento' }, url: link },
    },
    locale,
  )

  await sendEmail({ to: consent.guardianEmail, subject: message.subject, text: message.text, html: message.html, idempotencyKey: `guardian-consent-${tokenHash.slice(0, 32)}` })
  await audit('guardian.consent_requested', { actorId: userId, targetType: 'guardian_consent', targetId: userId })
  await notifyGuardianAccount(userId, {
    title: { en: `${name.en} listed you as their parent or guardian`, es: `${name.es} te indicó como su padre, madre o tutor` },
    body: { en: 'Review what we collect and give or decline consent on your Family page.', es: 'Revisa qué datos recopilamos y da o rechaza el consentimiento en tu página Familia.' },
    dedupeKey: `guardian-consent-${tokenHash.slice(0, 32)}`,
  })
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
