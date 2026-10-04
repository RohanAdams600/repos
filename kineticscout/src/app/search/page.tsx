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

export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } }

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const params = await searchParams
  const query = normalizeQuery(typeof params.q === 'string' ? params.q : '')
  const limited = query ? !(await rateLimit('search', await hashedClientIp())).success : false
  const results = query && !limited ? await siteSearch(query) : []

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-4xl font-bold">Search</h1>
      <form role="search" action="/search" method="get" className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          Search KineticScout
        </label>
        <input id="q" name="q" type="search" defaultValue={query} maxLength={SEARCH_LIMITS.maxLength} placeholder="" className={inputClass} autoComplete="off" />
        <Button type="submit">Search</Button>
      </form>
      {limited && <Alert tone="error">Too many searches in a short time. Wait a minute and try again.</Alert>}
      {query && query.length < SEARCH_LIMITS.minLength && <p className="text-fg-muted">Enter at least {SEARCH_LIMITS.minLength} characters.</p>}
      {query.length >= SEARCH_LIMITS.minLength && !limited && (
        <section aria-labelledby="results-title" className="flex flex-col gap-4">
          <h2 id="results-title" className="text-xl font-bold" aria-live="polite">
            {results.length} {results.length === 1 ? 'result' : 'results'} for &ldquo;{query}&rdquo;
          </h2>
          {results.length === 0 ? (
            <EmptyState title="Nothing matched">
              Try a broader word such as &ldquo;percentile&rdquo;, &ldquo;refund&rdquo; or &ldquo;video&rdquo;, or browse the <Link href="/faq">FAQ</Link>.
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
