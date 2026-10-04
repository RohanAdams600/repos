import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleBody } from '@/components/article-body'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ScrollProgress } from '@/components/marketing/scroll-progress'
import { getPublishedPost } from '@/lib/content/posts'
import { env } from '@/lib/env'

export async function generateMetadata({ params }: PageProps<'/case-studies/[slug]'>): Promise<Metadata> {
  const post = await getPublishedPost('CASE_STUDY', (await params).slug)
  if (!post) return { title: 'Case study not found', robots: { index: false } }
  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `/case-studies/${post.slug}` },
    openGraph: { type: 'article', title: post.title, description: post.metaDescription, modifiedTime: post.updatedAt.toISOString() },
  }
}

export default async function CaseStudyPage({ params }: PageProps<'/case-studies/[slug]'>) {
  const post = await getPublishedPost('CASE_STUDY', (await params).slug)
  if (!post) notFound()
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6">
      <ScrollProgress />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.metaDescription,
          datePublished: post.publishedAt?.toISOString(),
          dateModified: post.updatedAt.toISOString(),
          mainEntityOfPage: `${env().APP_URL}/case-studies/${post.slug}`,
          publisher: { '@type': 'Organization', name: 'KineticScout' },
        }}
      />
      <Breadcrumbs items={[{ label: 'Case studies', href: '/case-studies' }, { label: post.title }]} />
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{post.title}</h1>
        <p className="text-sm text-fg-muted">
          Last updated <time dateTime={post.updatedAt.toISOString()}>{post.updatedAt.toISOString().slice(0, 10)}</time>. Published with the athlete&apos;s
          written consent.
        </p>
      </header>
      <ArticleBody markdown={post.bodyMarkdown} />
    </article>
  )
}
