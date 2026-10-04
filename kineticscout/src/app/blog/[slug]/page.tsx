import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleBody } from '@/components/article-body'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ScrollProgress } from '@/components/marketing/scroll-progress'
import { getPublishedPost } from '@/lib/content/posts'
import { env } from '@/lib/env'

const getPost = (slug: string) => getPublishedPost('DATA_REPORT', slug)

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const post = await getPost((await params).slug)
  if (!post) return { title: 'Report not found', robots: { index: false } }
  return {
    title: post.title,
    description: post.metaDescription,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', title: post.title, description: post.metaDescription, publishedTime: post.publishedAt?.toISOString(), modifiedTime: post.updatedAt.toISOString() },
  }
}

export default async function BlogPostPage({ params }: PageProps<'/blog/[slug]'>) {
  const post = await getPost((await params).slug)
  if (!post) notFound()
  const url = `${env().APP_URL}/blog/${post.slug}`

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
          mainEntityOfPage: url,
          author: { '@type': 'Organization', name: 'KineticScout' },
          publisher: { '@type': 'Organization', name: 'KineticScout' },
        }}
      />
      <Breadcrumbs items={[{ label: 'Data reports', href: '/blog' }, { label: post.title }]} />
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{post.title}</h1>
        <p className="text-sm text-fg-muted">
          {post.publishedAt && (
            <>
              Published <time dateTime={post.publishedAt.toISOString()}>{post.publishedAt.toISOString().slice(0, 10)}</time>.{' '}
            </>
          )}
          Last updated <time dateTime={post.updatedAt.toISOString()}>{post.updatedAt.toISOString().slice(0, 10)}</time>.
        </p>
      </header>
      <ArticleBody markdown={post.bodyMarkdown} />
    </article>
  )
}
