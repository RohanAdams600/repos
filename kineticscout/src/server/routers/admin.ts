import { TRPCError } from '@trpc/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { adminProcedure, createRouter } from '@/server/trpc'

export const adminRouter = createRouter({
  marketingAssets: adminProcedure
    .input(z.object({ status: z.enum(['DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED', 'FAILED']).default('DRAFT'), page: z.number().int().min(1).default(1) }))
    .query(async ({ input }) => {
      const pageSize = 20
      const [items, total] = await Promise.all([
        db.marketingAsset.findMany({
          where: { status: input.status },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * pageSize,
          take: pageSize,
          select: { id: true, channel: true, status: true, topic: true, payload: true, complianceIssues: true, externalId: true, createdAt: true },
        }),
        db.marketingAsset.count({ where: { status: input.status } }),
      ])
      return { items, total, page: input.page, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
    }),

  reviewMarketingAsset: adminProcedure
    .input(z.object({ id: z.uuid(), decision: z.enum(['APPROVED', 'REJECTED']) }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.marketingAsset.updateMany({
        where: { id: input.id, status: { in: ['DRAFT', 'APPROVED'] } },
        data: { status: input.decision },
      })
      if (result.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'This asset can no longer be changed.' })
      await audit('admin.marketing_asset_reviewed', { actorId: ctx.user.id, targetType: 'marketing_asset', targetId: input.id, metadata: { decision: input.decision } })
      return { ok: true }
    }),

  blogDrafts: adminProcedure.query(() =>
    db.blogPost.findMany({
      where: { status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, slug: true, title: true, metaDescription: true, bodyMarkdown: true, validationReport: true, createdAt: true },
    }),
  ),

  reviewBlogPost: adminProcedure
    .input(z.object({ id: z.uuid(), decision: z.enum(['PUBLISHED', 'REJECTED']) }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.blogPost.findFirst({ where: { id: input.id, status: 'DRAFT' }, select: { slug: true } })
      if (!post) throw new TRPCError({ code: 'CONFLICT', message: 'This draft can no longer be changed.' })
      await db.blogPost.update({
        where: { id: input.id },
        data: { status: input.decision, publishedAt: input.decision === 'PUBLISHED' ? new Date() : null },
      })
      await audit('admin.blog_post_reviewed', { actorId: ctx.user.id, targetType: 'blog_post', targetId: input.id, metadata: { decision: input.decision } })
      if (input.decision === 'PUBLISHED') {
        revalidatePath('/blog')
        revalidatePath(`/blog/${post.slug}`)
      }
      return { ok: true }
    }),
})
