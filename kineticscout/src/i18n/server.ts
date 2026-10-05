import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { getAuthIdentity } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { DEFAULT_LOCALE, SPANISH_ENABLED, isLocale, LINK_LOCALE_HEADER, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from '@/i18n/config'
import { pick, type Catalog } from '@/i18n/define'

/**
 * The request's language: an explicit choice (cookie) first, then the language of the emailed link
 * that opened the page, then the signed-in account's saved language, then the browser's
 * Accept-Language, then English.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  if (!SPANISH_ENABLED) return DEFAULT_LOCALE
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  const requestHeaders = await headers()
  const fromLink = requestHeaders.get(LINK_LOCALE_HEADER)
  if (isLocale(fromLink)) return fromLink
  const identity = await getAuthIdentity().catch(() => null)
  if (identity) {
    const row = await db.user.findUnique({ where: { id: identity.id }, select: { locale: true } }).catch(() => null)
    if (row && isLocale(row.locale) && row.locale !== DEFAULT_LOCALE) return row.locale
  }
  return localeFromAcceptLanguage(requestHeaders.get('accept-language'))
})

export async function messages<T>(catalog: Catalog<T>): Promise<T> {
  return pick(catalog, await getLocale())
}

/** Language for email to an account holder. */
