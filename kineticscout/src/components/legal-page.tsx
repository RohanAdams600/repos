import type { ReactNode } from 'react'
import { ScrollProgress } from '@/components/marketing/scroll-progress'
import { LEGAL_LAST_UPDATED } from '@/lib/legal'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg-muted [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:text-fg-muted">
      <ScrollProgress />
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">{title}</h1>
        <p className="text-sm text-fg-muted">Last updated {LEGAL_LAST_UPDATED}</p>
      </header>
      {children}
    </article>
  )
}
