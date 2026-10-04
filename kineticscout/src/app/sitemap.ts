import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const staticRoutes = ['/', '/pricing', '/faq', '/about', '/contact', '/reviews', '/case-studies', '/blog', '/sign-up', '/legal/privacy', '/legal/terms', '/legal/refunds', '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'weekly' as const,
  }))
  const posts = await db.blogPost
    .findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, kind: true }, orderBy: { publishedAt: 'desc' }, take: 5_000 })
    .catch(() => [])
  return [...staticRoutes, ...posts.map((p) => ({ url: `${base}/${p.kind === 'CASE_STUDY' ? 'case-studies' : 'blog'}/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const }))]
}
