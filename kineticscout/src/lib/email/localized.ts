import type { Locale } from '@/i18n/config'
import { textIn, type Text } from '@/i18n/recipient'
import { renderEmail } from '@/lib/email/templates'

/** An email written in both languages (or fixed strings), rendered in the recipient's language when it is sent. */
export type LocalizedEmail = { subject: Text; paragraphs: Text[]; action?: { label: Text; url: string }; footer?: Text[] }

/** Links in a Spanish email open the page in Spanish (see LINK_LOCALE_HEADER). */
export function withLocale(url: string, locale: Locale): string {
  if (locale === 'en') return url
  const parsed = new URL(url)
  parsed.searchParams.set('lang', locale)
  return parsed.toString()
}

export function renderLocalizedEmail(email: LocalizedEmail, locale: Locale): { subject: string; text: string; html: string } {
  const { text, html } = renderEmail({
    paragraphs: email.paragraphs.map((p) => textIn(p, locale)),
    action: email.action ? { label: textIn(email.action.label, locale), url: withLocale(email.action.url, locale) } : undefined,
    footer: email.footer?.map((line) => textIn(line, locale)),
    lang: locale,
  })
  return { subject: textIn(email.subject, locale), text, html }
}
