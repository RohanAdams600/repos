import type { ReactNode } from 'react'
import { ScrollProgress } from '@/components/marketing/scroll-progress'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale } from '@/i18n/server'
import { LEGAL_LAST_UPDATED, LEGAL_UPDATED_ON } from '@/lib/legal'

/**
 * Legal pages are written in English. The Spanish versions are courtesy translations, and each one says
 * that the English text governs if the two differ.
 */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const locale = await getLocale()
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg-muted [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:text-fg-muted">
      <ScrollProgress />
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">{title}</h1>
        <p className="text-sm text-fg-muted">
          {locale === 'es' ? `Última actualización: ${formatDay(LEGAL_UPDATED_ON, locale)}` : `Last updated ${LEGAL_LAST_UPDATED}`}
        </p>
        {locale === 'es' && (
          <p className="border-l-4 border-border-strong pl-4 text-sm text-fg-muted">
            Esta es una traducción de cortesía. El texto en inglés es el que rige; si las dos versiones difieren, prevalece la versión en inglés.
          </p>
        )}
      </header>
      {children}
    </article>
  )
}
