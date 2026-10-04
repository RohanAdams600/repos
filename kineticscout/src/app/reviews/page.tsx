import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Reviews',
  description: 'What KineticScout athletes and parents say, published with their permission.',
  alternates: { canonical: '/reviews' },
}

const PAGE_SIZE = 20

export default async function ReviewsPage({ searchParams }: PageProps<'/reviews'>) {
  const params = await searchParams
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
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Reviews' }]} />
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Reviews</h1>
        <p className="text-lg text-fg-muted">
          Every review here comes from a KineticScout account holder who gave us permission to publish it. We do not edit what people say, pay for
          reviews, or remove critical ones that follow our <a href="/legal/terms">terms</a>.
        </p>
      </div>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews published yet">
          We are a new product and only publish reviews from real users with their permission. Check back soon.
        </EmptyState>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {reviews.map((r) => (
            <li key={r.id}>
              <figure className="flex h-full flex-col gap-4 border-2 border-border-subtle p-6">
                {r.rating && (
                  <p className="tabular text-sm" aria-label={`Rated ${r.rating} out of 5`}>
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
        <nav aria-label="Review pages" className="flex gap-4">
          {page > 1 && <a href={`/reviews?page=${page - 1}`}>Newer</a>}
          <span className="tabular text-sm">Page {page} of {pageCount}</span>
          {page < pageCount && <a href={`/reviews?page=${page + 1}`}>Older</a>}
        </nav>
      )}
    </div>
  )
}
