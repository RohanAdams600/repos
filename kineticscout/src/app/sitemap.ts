import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const staticRoutes = ['/', '/pricing', '/faq', '/about', '/contact', '/reviews', '/case-studies', '/blog', '/sign-up', '/legal/privacy', '/legal/terms', '/legal/refunds', '/legal/cookies', '/legal/your-data', '/tools/percentile-calculator', '/events', '/recruiting-calendar'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: 'weekly' as const,
  }))
  const posts = await db.blogPost
    .findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, kind: true }, orderBy: { publishedAt: 'desc' }, take: 5_000 })
    .catch(() => [])
  const events = await db.event
    .findMany({ where: { status: 'PUBLISHED', endDate: { gte: new Date() } }, select: { id: true, updatedAt: true }, orderBy: { startDate: 'asc' }, take: 5_000 })
    .catch(() => [])
  return [...staticRoutes, ...events.map((e) => ({ url: `${base}/events/${e.id}`, lastModified: e.updatedAt, changeFrequency: 'weekly' as const })), ...posts.map((p) => ({ url: `${base}/${p.kind === 'CASE_STUDY' ? 'case-studies' : 'blog'}/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const }))]
}
