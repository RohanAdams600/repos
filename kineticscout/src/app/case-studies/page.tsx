import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Case studies',
  description: 'How athletes and families have used KineticScout, told with their consent.',
  alternates: { canonical: '/case-studies' },
}

export default async function CaseStudiesPage() {
  const studies = await db.blogPost.findMany({
    where: { kind: 'CASE_STUDY', status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    select: { slug: true, title: true, metaDescription: true, publishedAt: true },
  })
  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Case studies' }]} />
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-4xl font-bold">Case studies</h1>
        <p className="text-lg text-fg-muted">
          Real athletes, real numbers, published only with written consent from the athlete and, for anyone under 18, their parent or guardian.
        </p>
      </div>
      {studies.length === 0 ? (
        <EmptyState title="No case studies yet">
          We publish case studies only when an athlete and their family agree to share their story. The first ones are on the way.
        </EmptyState>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {studies.map((s) => (
            <li key={s.slug} className="flex flex-col gap-2 border-2 border-border-subtle p-6 hover:border-fg">
              <h2 className="text-xl font-bold">
                <Link href={`/case-studies/${s.slug}`}>{s.title}</Link>
              </h2>
              <p className="text-fg-muted">{s.metaDescription}</p>
              {s.publishedAt && (
                <time dateTime={s.publishedAt.toISOString()} className="tabular text-sm text-fg-muted">
                  {s.publishedAt.toISOString().slice(0, 10)}
                </time>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
