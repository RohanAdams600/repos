import { TRPCError } from '@trpc/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { scheduleDeletion } from '@/lib/account/deletion'
import { parseDateOnly } from '@/lib/auth/age'
import { slugify } from '@/lib/content/fact-check'
import { sanitizeText } from '@/lib/security/sanitize'
import { emailSchema } from '@/lib/validation/auth'
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
      select: { id: true, slug: true, kind: true, title: true, metaDescription: true, bodyMarkdown: true, validationReport: true, consentRecordedAt: true, createdAt: true },
    }),
  ),

  reviewBlogPost: adminProcedure
    .input(z.object({ id: z.uuid(), decision: z.enum(['PUBLISHED', 'REJECTED']) }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.blogPost.findFirst({ where: { id: input.id, status: 'DRAFT' }, select: { slug: true, kind: true, consentRecordedAt: true } })
      if (!post) throw new TRPCError({ code: 'CONFLICT', message: 'This draft can no longer be changed.' })
      if (input.decision === 'PUBLISHED' && post.kind === 'CASE_STUDY' && !post.consentRecordedAt) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Record the athlete’s written consent before publishing a case study.' })
      }
      await db.blogPost.update({
        where: { id: input.id },
        data: { status: input.decision, publishedAt: input.decision === 'PUBLISHED' ? new Date() : null },
      })
      await audit('admin.blog_post_reviewed', { actorId: ctx.user.id, targetType: 'blog_post', targetId: input.id, metadata: { decision: input.decision } })
      if (input.decision === 'PUBLISHED') {
        const base = post.kind === 'CASE_STUDY' ? '/case-studies' : '/blog'
        revalidatePath(base)
        revalidatePath(`${base}/${post.slug}`)
      }
      return { ok: true }
    }),

  createCaseStudy: adminProcedure
    .input(
      z.object({
        title: z.string().transform((v) => sanitizeText(v)).pipe(z.string().min(10).max(120)),
        metaDescription: z.string().transform((v) => sanitizeText(v)).pipe(z.string().min(50).max(160)),
        bodyMarkdown: z
          .string()
          .min(200)
          .max(20_000)
          .refine((v) => !/<\s*[a-z!/]/i.test(v), 'Use Markdown only, no HTML'),
        /** Date written consent was received from the athlete (and guardian for minors). */
        consentRecordedOn: z.string().refine((v) => parseDateOnly(v) !== null, 'Enter the consent date'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const base = slugify(input.title) || 'case-study'
      const slug = (await db.blogPost.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${Date.now().toString(36)}` : base
      const post = await db.blogPost.create({
        data: {
          kind: 'CASE_STUDY',
          slug,
          title: input.title,
          metaDescription: input.metaDescription,
          bodyMarkdown: input.bodyMarkdown,
          status: 'DRAFT',
          dataSnapshot: {},
          consentRecordedAt: parseDateOnly(input.consentRecordedOn),
        },
        select: { id: true, slug: true },
      })
      await audit('admin.case_study_created', { actorId: ctx.user.id, targetType: 'blog_post', targetId: post.id })
      return post
    }),

  testimonials: adminProcedure.query(() =>
    db.testimonial.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, displayName: true, descriptor: true, quote: true, rating: true, status: true, createdAt: true },
    }),
  ),

  /** Reviews can only be attached to a real account, with the reviewer's consent attested. */
  createTestimonial: adminProcedure
    .input(
      z.object({
        authorEmail: emailSchema,
        displayName: z.string().transform((v) => sanitizeText(v)).pipe(z.string().min(2).max(80)),
        descriptor: z.string().transform((v) => sanitizeText(v)).pipe(z.string().min(3).max(120)),
        quote: z.string().transform((v) => sanitizeText(v, { multiline: true })).pipe(z.string().min(20).max(600)),
        rating: z.number().int().min(1).max(5).nullable(),
        consentConfirmed: z.literal(true, { error: 'Confirm you have the author’s permission to publish' }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const author = await db.user.findUnique({ where: { email: input.authorEmail }, select: { id: true } })
      if (!author) throw new TRPCError({ code: 'NOT_FOUND', message: 'Reviews must come from a KineticScout account holder. No account uses that email.' })
      const created = await db.testimonial.create({
        data: { userId: author.id, displayName: input.displayName, descriptor: input.descriptor, quote: input.quote, rating: input.rating, consentRecordedAt: new Date() },
        select: { id: true },
      })
      await audit('admin.testimonial_created', { actorId: ctx.user.id, targetType: 'testimonial', targetId: created.id })
      return created
    }),

  reviewTestimonial: adminProcedure
    .input(z.object({ id: z.uuid(), decision: z.enum(['PUBLISHED', 'REJECTED']) }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.testimonial.updateMany({
        where: { id: input.id, status: { not: input.decision } },
        data: { status: input.decision, publishedAt: input.decision === 'PUBLISHED' ? new Date() : null },
      })
      if (result.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Nothing to change.' })
      await audit('admin.testimonial_reviewed', { actorId: ctx.user.id, targetType: 'testimonial', targetId: input.id, metadata: { decision: input.decision } })
      revalidatePath('/reviews')
      revalidatePath('/')
      return { ok: true }
    }),

  contactMessages: adminProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), unrepliedOnly: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const pageSize = 25
      const where = input.unrepliedOnly ? { repliedAt: null } : {}
      const [items, total] = await Promise.all([
        db.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * pageSize, take: pageSize }),
        db.contactMessage.count({ where }),
      ])
      // Flag messages approaching the 2-business-day reply promise (36 hours as a working margin).
      const dueBefore = Date.now() - 36 * 3_600_000
      return {
        items: items.map((m) => ({ ...m, replyDue: !m.repliedAt && m.createdAt.getTime() < dueBefore })),
        total,
        page: input.page,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      }
    }),

  markContactReplied: adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ input }) => {
    await db.contactMessage.updateMany({ where: { id: input.id, repliedAt: null }, data: { repliedAt: new Date() } })
    return { ok: true }
  }),

  /**
   * Enters a deletion request received outside the app (email from the account address, or post).
   * The same 7-day window, confirmation email and cancellation rights apply as for a self-serve request.
   */
  scheduleAccountDeletion: adminProcedure
    .input(z.object({ email: emailSchema, verified: z.literal(true, { error: 'Confirm the request came from the account holder' }) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true, role: true } })
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No account uses that email address.' })
      if (user.role === 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Staff accounts are removed by the account owner, not from this console.' })
      const result = await scheduleDeletion(user.id, 'ADMIN', new Date(), ctx.user.id)
      return { scheduledFor: result.scheduledFor, alreadyScheduled: result.alreadyScheduled }
    }),
})
