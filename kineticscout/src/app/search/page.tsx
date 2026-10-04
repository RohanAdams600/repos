import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { inputClass } from '@/components/ui/field'
import { siteSearch } from '@/lib/search'
import { normalizeQuery, SEARCH_LIMITS } from '@/lib/search/score'
import { rateLimit } from '@/lib/security/rate-limit'
import { hashedClientIp } from '@/lib/security/request'
import { contentMessages } from '@/i18n/messages/content'
import { getLocale, messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(contentMessages)).search.title, robots: { index: false, follow: true } }
}

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const params = await searchParams
  const locale = await getLocale()
  const m = (await messages(contentMessages)).search
  const query = normalizeQuery(typeof params.q === 'string' ? params.q : '')
  const limited = query ? !(await rateLimit('search', await hashedClientIp())).success : false
  const results = query && !limited ? await siteSearch(query, locale) : []

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-4xl font-bold">{m.title}</h1>
      <form role="search" action="/search" method="get" className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          {m.label}
        </label>
        <input id="q" name="q" type="search" defaultValue={query} maxLength={SEARCH_LIMITS.maxLength} placeholder="" className={inputClass} autoComplete="off" />
        <Button type="submit">{m.button}</Button>
      </form>
      {limited && <Alert tone="error">{m.limited}</Alert>}
      {query && query.length < SEARCH_LIMITS.minLength && <p className="text-fg-muted">{m.minLength(SEARCH_LIMITS.minLength)}</p>}
      {query.length >= SEARCH_LIMITS.minLength && !limited && (
        <section aria-labelledby="results-title" className="flex flex-col gap-4">
          <h2 id="results-title" className="text-xl font-bold" aria-live="polite">
            {m.results(results.length, query)}
          </h2>
          {results.length === 0 ? (
            <EmptyState title={m.nothingTitle}>
              {m.nothing} <Link href="/faq">{m.faq}</Link>.
            </EmptyState>
          ) : (
            <ol className="flex flex-col divide-y-2 divide-border-subtle border-y-2 border-border-subtle">
              {results.map((r) => (
                <li key={r.href} className="py-4">
                  <p className="text-xs font-bold tracking-wide text-fg-muted uppercase">{r.section}</p>
                  <Link href={r.href} className="text-lg font-bold">
                    {r.title}
                  </Link>
                  <p className="mt-1 text-fg-muted">{r.description}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  )
}
