import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import ReactMarkdown from 'react-markdown'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

const getPost = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  return db.blogPost.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: { slug: true, title: true, metaDescription: true, bodyMarkdown: true, publishedAt: true, updatedAt: true, generatedBy: true },
  })
})

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
      {/* react-markdown renders Markdown only: raw HTML in the source is shown as text, never executed. */}
      <div className="flex flex-col gap-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg-muted">
        <ReactMarkdown
          skipHtml
          components={{
            a: ({ href, children }) => (href?.startsWith('/') ? <a href={href}>{children}</a> : <span>{children}</span>),
            img: () => null,
          }}
        >
          {post.bodyMarkdown}
        </ReactMarkdown>
      </div>
    </article>
  )
}
