import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { db } from '@/lib/db'
import { chromeMessages } from '@/i18n/messages/chrome'
import { contentMessages } from '@/i18n/messages/content'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = (await messages(contentMessages)).reviews
  return { title: m.title, description: m.description, alternates: { canonical: '/reviews' } }
}

const PAGE_SIZE = 20

export default async function ReviewsPage({ searchParams }: PageProps<'/reviews'>) {
  const params = await searchParams
  const m = (await messages(contentMessages)).reviews
  const c = await messages(chromeMessages)
  const page = Math.max(1, Math.min(200, Number(params.page) || 1))
  const [reviews, total] = await Promise.all([
    db.testimonial.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, displayName: true, descriptor: true, quote: true, rating: true, publishedAt: true },
    }),
    db.testimonial.count({ where: { status: 'PUBLISHED' } }),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.title }]} />
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">
          {m.lead} <a href="/legal/terms">{m.terms}</a>.
        </p>
      </div>
      {reviews.length === 0 ? (
        <EmptyState title={m.emptyTitle}>{m.empty}</EmptyState>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <figure className="flex h-full flex-col gap-4 border-2 border-border-subtle p-6">
                {r.rating && (
                  <p className="tabular text-sm" aria-label={m.rated(r.rating)}>
                    {r.rating}/5
                  </p>
                )}
                <blockquote className="text-lg">&ldquo;{r.quote}&rdquo;</blockquote>
                <figcaption className="mt-auto text-sm text-fg-muted">
                  <span className="font-bold text-fg">{r.displayName}</span>, {r.descriptor}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav aria-label={m.pages} className="flex gap-4">
          {page > 1 && <a href={`/reviews?page=${page - 1}`}>{m.newer}</a>}
          <span className="tabular text-sm">{m.page(page, pageCount)}</span>
          {page < pageCount && <a href={`/reviews?page=${page + 1}`}>{m.older}</a>}
        </nav>
      )}
    </div>
  )
}
