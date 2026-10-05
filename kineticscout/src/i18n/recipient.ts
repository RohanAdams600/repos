import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config'
import type { Localized } from '@/i18n/define'
import { db } from '@/lib/db'

/**
 * The language to write to someone in when there is no request to read it from (emails,
 * notifications, background jobs). Users have the language saved on their account; a parent or
 * guardian without an account has the language the athlete chose for them at sign-up.
 */
export async function recipientLocale(userId: string): Promise<Locale> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { locale: true } })
  return row && isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
}

/** Language for emails to an athlete's parent or guardian. */
export async function guardianLocale(athleteId: string): Promise<Locale> {
  const row = await db.guardianConsent.findUnique({ where: { userId: athleteId }, select: { locale: true } })
  return row && isLocale(row.locale) ? row.locale : DEFAULT_LOCALE
}

/** Text that is either one fixed string (staff-written, names) or written in both languages. */
export type Text = string | Localized

export function textIn(value: Text, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale]
}

export function isLocalized(value: Text | undefined): value is Localized {
  return typeof value === 'object' && value !== null
}
