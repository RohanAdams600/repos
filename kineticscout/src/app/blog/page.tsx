import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { db } from '@/lib/db'

export const metadata: Metadata = {
  title: 'Data reports',
  description: 'Weekly percentile reports on exit velocity, pitch velocity and speed, built from anonymized KineticScout athlete data.',
  alternates: { canonical: '/blog' },
}

const PAGE_SIZE = 12

export default async function BlogIndex({ searchParams }: PageProps<'/blog'>) {
  const params = await searchParams
  const page = Math.max(1, Math.min(500, Number(params.page) || 1))
  const [posts, total] = await Promise.all([
    db.blogPost.findMany({
      where: { status: 'PUBLISHED', kind: 'DATA_REPORT' },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { slug: true, title: true, metaDescription: true, publishedAt: true },
    }),
    db.blogPost.count({ where: { status: 'PUBLISHED', kind: 'DATA_REPORT' } }),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Data reports</h1>
        <p className="max-w-2xl text-fg-muted">What the numbers look like across KineticScout athletes, by graduating class and position. Every figure comes from anonymized groups of at least 25 athletes.</p>
      </div>
      {posts.length === 0 ? (
        <EmptyState title="No reports published yet">The first report is published once enough athletes have logged data to keep every group anonymous.</EmptyState>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {posts.map((post) => (
            <li key={post.slug} className="border-2 border-border-subtle p-6 hover:border-fg">
              <article className="flex flex-col gap-2">
                <h2 className="text-xl font-bold">
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className="text-fg-muted">{post.metaDescription}</p>
                {post.publishedAt && <time dateTime={post.publishedAt.toISOString()} className="tabular text-sm text-fg-muted">{post.publishedAt.toISOString().slice(0, 10)}</time>}
              </article>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav aria-label="Report pages" className="flex items-center gap-4">
          {page > 1 && <Link href={`/blog?page=${page - 1}`}>Newer reports</Link>}
          <span className="tabular text-sm">Page {page} of {pageCount}</span>
          {page < pageCount && <Link href={`/blog?page=${page + 1}`}>Older reports</Link>}
        </nav>
      )}
    </div>
  )
}
