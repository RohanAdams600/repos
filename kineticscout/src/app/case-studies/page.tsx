import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { db } from '@/lib/db'
import { chromeMessages } from '@/i18n/messages/chrome'
import { contentMessages } from '@/i18n/messages/content'
import { getLocale, messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const m = (await messages(contentMessages)).caseStudies
  return { title: m.title, description: m.description, alternates: { canonical: '/case-studies' } }
}

export default async function CaseStudiesPage() {
  const locale = await getLocale()
  const m = (await messages(contentMessages)).caseStudies
  const c = await messages(chromeMessages)
  const studies = await db.blogPost.findMany({
    where: { kind: 'CASE_STUDY', status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    select: { slug: true, title: true, metaDescription: true, publishedAt: true },
  })
  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.title }]} />
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">
          {m.lead}
        </p>
      </div>
      {studies.length === 0 ? (
        <EmptyState title={m.emptyTitle}>{m.empty}</EmptyState>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2" lang={locale === 'en' ? undefined : 'en'}>
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
