/**
 * Supported interface languages. English is the default and the governing language of legal
 * documents; Spanish is a full translation of everything except the staff console.
 */
export const LOCALES = ['en', 'es'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
/**
 * Spanish is switched on once every page it covers is translated. While false, every request is
 * served in English and the language switch is hidden, so no one sees a half-translated page.
 */
export const SPANISH_ENABLED = true
/** Set when someone chooses a language; read on the server only. */
/** Set by the proxy from an emailed link's ?lang= parameter. */
export const LINK_LOCALE_HEADER = 'x-ks-link-locale'

export const LOCALE_COOKIE = 'ks_locale'

/** BCP 47 tags for dates and numbers. Spanish uses US conventions (dates, inches, mph). */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-US' }
export const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', es: 'Español' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Picks the best supported language from an Accept-Language header (q-values respected). */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())).find(Boolean)
      return { lang: (tag ?? '').toLowerCase().split('-')[0] ?? '', q: q ? Number(q[1]) : 1 }
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q)
  for (const { lang } of ranked) if (isLocale(lang)) return lang
  return DEFAULT_LOCALE
}
