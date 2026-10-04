'use client'

import { useLocale } from '@/i18n/client'
import { translateServerText } from '@/i18n/messages/server-text'

/** Translates a message the server sent back (errors, confirmations) into the reader's language. */
export function useServerText(): (text: string) => string {
  const locale = useLocale()
  return (text) => translateServerText(text, locale)
}
