import { TRPCError } from '@trpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { siteSearch } from '@/lib/search'
import { appRouter } from '@/server/routers/_app'
import { createAthlete, resetDb } from '../helpers/db'

// revalidatePath needs a Next.js request scope; it is a no-op concern for these tests.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(async () => {
  await resetDb()
  await db.$executeRawUnsafe('TRUNCATE "testimonials", "contact_messages" CASCADE')
})

const BODY = 'This case study describes a real athlete. '.repeat(10)

describe('site search', () => {
  it('finds static pages, FAQs and published articles, and treats LIKE wildcards literally', async () => {
    await db.blogPost.createMany({
      data: [
        { slug: 'exit-velocity-class-of-2027', title: 'Exit Velocity Percentiles for the Class of 2027', metaDescription: 'Exit velocity by class.', bodyMarkdown: 'x', status: 'PUBLISHED', dataSnapshot: {}, publishedAt: new Date() },
        { slug: 'draft-only', title: 'Exit velocity draft', metaDescription: 'Not public.', bodyMarkdown: 'x', status: 'DRAFT', dataSnapshot: {} },
      ],
    })
    const results = await siteSearch('exit velocity')
    expect(results.map((r) => r.href)).toContain('/blog/exit-velocity-class-of-2027')
    expect(results.map((r) => r.href)).not.toContain('/blog/draft-only')
    expect((await siteSearch('refund')).map((r) => r.href)).toContain('/legal/refunds')
    expect((await siteSearch('percentile')).some((r) => r.section === 'FAQ')).toBe(true)
    expect(await siteSearch('%%')).toEqual([])
  })
})

describe('reviews and case studies', () => {
  it('only accepts reviews from real accounts with consent, and only admins can manage them', async () => {
    const author = await createAthlete()
    const admin = { ...(await createAthlete()), role: 'ADMIN' as const }
    const adminApi = appRouter.createCaller({ user: admin, ipHash: 't' })
    const userApi = appRouter.createCaller({ user: author, ipHash: 't' })
    const base = { displayName: 'Maria G.', descriptor: 'Parent of a 2027 shortstop', quote: 'The class percentile helped us set realistic goals for the summer.', rating: 5, consentConfirmed: true as const }

    await expect(userApi.admin.createTestimonial({ ...base, authorEmail: author.email })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'NOT_FOUND')
    await expect(adminApi.admin.createTestimonial({ ...base, authorEmail: 'nobody@example.test' })).rejects.toSatisfy((e: unknown) => e instanceof TRPCError && e.code === 'NOT_FOUND')
    await expect(adminApi.admin.createTestimonial({ ...base, consentConfirmed: false as unknown as true, authorEmail: author.email })).rejects.toBeInstanceOf(TRPCError)

    const created = await adminApi.admin.createTestimonial({ ...base, authorEmail: author.email })
    await adminApi.admin.reviewTestimonial({ id: created.id, decision: 'PUBLISHED' })
    expect(await db.testimonial.count({ where: { status: 'PUBLISHED' } })).toBe(1)

    // Deleting the author's account removes their review.
    await db.user.delete({ where: { id: author.id } })
    expect(await db.testimonial.count()).toBe(0)
  })

  it('refuses to publish a case study without recorded consent, in the API and in the database', async () => {
    const admin = { ...(await createAthlete()), role: 'ADMIN' as const }
    const api = appRouter.createCaller({ user: admin, ipHash: 't' })
    const draft = await api.admin.createCaseStudy({ title: 'From 78 to 86 mph in one offseason', metaDescription: 'How one pitcher used sequencing feedback over a winter of training.'.padEnd(60, '.'), bodyMarkdown: BODY, consentRecordedOn: '2026-09-15' })
    await api.admin.reviewBlogPost({ id: draft.id, decision: 'PUBLISHED' })
    expect((await db.blogPost.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('PUBLISHED')

    await expect(api.admin.createCaseStudy({ title: 'Has <script> tags here', metaDescription: 'x'.repeat(60), bodyMarkdown: `<script>alert(1)</script>${BODY}`, consentRecordedOn: '2026-09-15' })).rejects.toBeInstanceOf(TRPCError)
    await expect(
      db.blogPost.create({ data: { kind: 'CASE_STUDY', slug: 'no-consent', title: 'No consent', metaDescription: 'x', bodyMarkdown: 'x', status: 'PUBLISHED', dataSnapshot: {} } }),
    ).rejects.toThrow()
  })

  it('lists unreplied contact messages with a reply-due flag', async () => {
    const admin = { ...(await createAthlete()), role: 'ADMIN' as const }
    await db.contactMessage.createMany({
      data: [
        { name: 'A', email: 'a@example.test', topic: 'support', message: 'Help with my account please', createdAt: new Date(Date.now() - 48 * 3_600_000) },
        { name: 'B', email: 'b@example.test', topic: 'billing', message: 'Question about my invoice' },
      ],
    })
    const api = appRouter.createCaller({ user: admin, ipHash: 't' })
    const inbox = await api.admin.contactMessages({ page: 1, unrepliedOnly: true })
    expect(inbox.total).toBe(2)
    expect(inbox.items.find((m) => m.name === 'A')?.replyDue).toBe(true)
    expect(inbox.items.find((m) => m.name === 'B')?.replyDue).toBe(false)
    await api.admin.markContactReplied({ id: inbox.items[0]!.id })
    expect((await api.admin.contactMessages({ page: 1, unrepliedOnly: true })).total).toBe(1)
  })
})
