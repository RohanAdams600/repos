import type { Locale } from '@/i18n/config'

/**
 * A message catalogue for one area of the app: the English entries define the shape, and the
 * Spanish entries must match it exactly (same keys, same function parameters), so a missing or
 * mistyped translation is a compile error. Entries are strings, or functions for values and
 * plurals; functions may return JSX for sentences with links.
 */
export type Catalog<T> = { en: T; es: T }

export function defineMessages<T>(en: T, es: NoInfer<T>): Catalog<T> {
  return { en, es }
}

export function pick<T>(catalog: Catalog<T>, locale: Locale): T {
  return catalog[locale]
}

/** Text in both languages, for content built at one time and shown later (notifications). */
export type Localized = { en: string; es: string }

export function localized(value: string | Localized, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale]
}
