import 'server-only'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { signSubject, verifySubject } from '@/lib/security/signed-token'

const PURPOSE = 'email-preferences-v1'

export function preferencesToken(userId: string): string {
  return signSubject(env().HASH_PEPPER, PURPOSE, userId)
}

export function verifyPreferencesToken(userId: string, token: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(userId) && verifySubject(env().HASH_PEPPER, PURPOSE, userId, token)
}

/** Preference centre reachable from any email without signing in. */
export function preferencesUrl(userId: string): string {
  return `${env().APP_URL}/email/preferences?u=${userId}&t=${preferencesToken(userId)}`
}

/** RFC 8058 one-click endpoint used in the List-Unsubscribe header. */
export function oneClickUnsubscribeUrl(userId: string): string {
  return `${env().APP_URL}/api/email/unsubscribe?u=${userId}&t=${preferencesToken(userId)}`
}

export type PreferenceChangeSource = 'settings' | 'preference-link' | 'one-click'

/**
 * Records a marketing email choice with its timestamp. Opting in is refused while the account is
 * scheduled for deletion. Returns false when nothing was updated.
 */
export async function setMarketingOptIn(userId: string, optIn: boolean, via: PreferenceChangeSource): Promise<boolean> {
  const result = await db.user.updateMany({
    where: { id: userId, ...(optIn ? { deletionScheduledFor: null } : {}) },
    data: { marketingEmailOptIn: optIn, marketingOptInUpdatedAt: new Date() },
  })
  if (result.count === 0) return false
  await audit('email.preferences_updated', { actorId: via === 'settings' ? userId : null, targetType: 'user', targetId: userId, metadata: { marketing: optIn, via } })
  return true
}

/** a***@example.com, so a forwarded preference link does not display the full address. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}
