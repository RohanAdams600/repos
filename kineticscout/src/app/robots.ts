import type { MetadataRoute } from 'next'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const indexable = process.env.DEPLOY_ENV === 'production'
  return {
    // Staging and previews are never indexed.
    rules: indexable
      ? [{ userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard', '/admin', '/onboarding', '/auth/', '/consent/', '/reset-password'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  }
}
