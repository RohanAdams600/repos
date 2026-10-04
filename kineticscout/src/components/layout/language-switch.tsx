'use client'

import { LANGUAGE_NAME, SPANISH_ENABLED, type Locale } from '@/i18n/config'
import { useLocale } from '@/i18n/client'
import { setLocaleAction } from '@/i18n/actions'

/**
 * Switches to the other language and returns to the same page (query string included, so emailed
 * links with tokens keep working). The label is written in its own language and marked with lang.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const current = useLocale()
  const other: Locale = current === 'en' ? 'es' : 'en'
  if (!SPANISH_ENABLED) return null
  return (
    <form
      action={setLocaleAction}
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem('returnTo')
        if (input instanceof HTMLInputElement) input.value = window.location.pathname + window.location.search
      }}
    >
      <input type="hidden" name="locale" value={other} />
      <input type="hidden" name="returnTo" value="" />
      <button type="submit" lang={other} className={className ?? 'min-h-11 px-2 font-bold underline underline-offset-[3px] hover:decoration-2'}>
        {LANGUAGE_NAME[other]}
      </button>
    </form>
  )
}
