import 'server-only'
import { cache } from 'react'
import type { ContentKind } from '@/generated/prisma/enums'
import { db } from '@/lib/db'

/** A published article or case study by slug, or null. Slugs are validated before touching the database. */
export const getPublishedPost = cache(async (kind: ContentKind, slug: string) => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  return db.blogPost.findFirst({
    where: { slug, kind, status: 'PUBLISHED' },
    select: { slug: true, title: true, metaDescription: true, bodyMarkdown: true, publishedAt: true, updatedAt: true, generatedBy: true },
  })
})
