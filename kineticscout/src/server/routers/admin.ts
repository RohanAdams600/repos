import { TRPCError } from '@trpc/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { scheduleDeletion } from '@/lib/account/deletion'
import { VerificationRejection } from '@/generated/prisma/enums'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { createSignedPlaybackUrl } from '@/lib/storage/gcs'
import { decideEvidence } from '@/lib/verification/service'
import { decideCoach } from '@/lib/coach/verification'
import { decideTeam } from '@/lib/teams/service'
import { messageReportQueue, resolveMessageReport } from '@/lib/messaging/service'
import { calendar, cancelEvent, createPeriod, deletePeriod, EventError, eventReviewQueue, reviewEvent, upcomingListedForStaff } from '@/lib/events/service'
import { periodInputSchema } from '@/lib/events/rules'
import { drillInputSchema } from '@/lib/training/rules'
import { createDrill, deleteDraftDrill, drillLibrary, publishDrill, retireDrill, TrainingError } from '@/lib/training/service'
import { completeReferenceUpload, createReferenceUpload, deleteReferenceClip, setReferenceClipActive } from '@/lib/reference/service'
import { Handedness, MetricType, MotionType } from '@/generated/prisma/enums'
import { activateNormDataset, deleteDraftNormDataset, listNormDatasets, NormAdminError, previewNorm, retireNormDataset } from '@/lib/insights/norm-admin'
import { postRosterNeed, rosterNeedSchema, staffUpdateSchema, updateProgramStaff } from '@/lib/recruiting/changes'
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

  /** Oldest first, so athletes wait as little as possible. */
  verificationQueue: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(20).default(10) })).query(async ({ input }) => {
    const [rows, total] = await Promise.all([
      db.metricVerification.findMany({
        where: { status: 'IN_REVIEW' },
        orderBy: { createdAt: 'asc' },
        take: input.limit,
        select: {
          metricId: true,
          objectKey: true,
          checks: true,
          durationMs: true,
          recordedAt: true,
          createdAt: true,
          metric: { select: { metricType: true, value: true, date: true, athlete: { select: { firstName: true, lastName: true, gradYear: true } } } },
        },
      }),
      db.metricVerification.count({ where: { status: 'IN_REVIEW' } }),
    ])
    const items = await Promise.all(
      rows.map(async (r) => ({
        metricId: r.metricId,
        athlete: `${r.metric.athlete.firstName} ${r.metric.athlete.lastName}, class of ${r.metric.athlete.gradYear}`,
        metricLabel: METRIC_DEFINITIONS[r.metric.metricType].label,
        value: Number(r.metric.value),
        unit: METRIC_DEFINITIONS[r.metric.metricType].unit,
        measuredOn: r.metric.date.toISOString().slice(0, 10),
        recordedAt: r.recordedAt?.toISOString() ?? null,
        durationMs: r.durationMs,
        checks: r.checks as Record<string, unknown> | null,
        submittedAt: r.createdAt.toISOString(),
        videoUrl: r.objectKey ? await createSignedPlaybackUrl(r.objectKey, 30 * 60) : null,
      })),
    )
    return { items, total }
  }),

  decideVerification: adminProcedure
    .input(
      z.discriminatedUnion('approve', [
        z.object({ metricId: z.uuid(), approve: z.literal(true) }),
        z.object({ metricId: z.uuid(), approve: z.literal(false), reason: z.enum(VerificationRejection), note: z.string().trim().max(500).optional() }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const decided = await decideEvidence(
        ctx.user.id,
        input.metricId,
        input.approve ? { approve: true } : { approve: false, reason: input.reason, note: input.note ? sanitizeText(input.note) : undefined },
      )
      if (!decided) throw new TRPCError({ code: 'CONFLICT', message: 'This submission was already decided.' })
      return { ok: true }
    }),

  programSearch: adminProcedure.input(z.object({ q: z.string().trim().min(2).max(80) })).query(({ input }) =>
    db.collegeProgram.findMany({
      where: { schoolName: { contains: input.q, mode: 'insensitive' } },
      orderBy: { schoolName: 'asc' },
      take: 10,
      select: { id: true, schoolName: true, sport: true, division: true, headCoachName: true, headCoachEmail: true, headCoachSince: true, headCoachBackground: true, recentSeasonSummary: true, dataSourceUrl: true },
    }),
  ),

  /** A changed head coach is recorded as a ProgramChange and Agent 3 alerts watching athletes. */
  updateProgramStaff: adminProcedure
    .input(z.object({ programId: z.uuid(), headCoachSince: z.string().nullable().optional() }).extend(staffUpdateSchema.omit({ headCoachSince: true }).shape))
    .mutation(async ({ ctx, input }) => {
      const { programId, headCoachSince, ...rest } = input
      const since = headCoachSince === undefined ? undefined : headCoachSince === null || headCoachSince === '' ? null : parseDateOnly(headCoachSince)
      if (since === null && headCoachSince) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter the start date as YYYY-MM-DD.' })
      return updateProgramStaff(programId, { ...rest, ...(since !== undefined ? { headCoachSince: since } : {}) }, ctx.user.id)
    }),

  postRosterNeed: adminProcedure
    .input(
      z.object({
        programId: z.uuid(),
        position: rosterNeedSchema.shape.position,
        gradYear: rosterNeedSchema.shape.gradYear,
        note: z.string().min(5).max(300),
        sourceUrl: z.string(),
        postedAt: z.string(),
        expiresAt: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const postedAt = parseDateOnly(input.postedAt)
      const expiresAt = input.expiresAt ? parseDateOnly(input.expiresAt) : null
      if (!postedAt || (input.expiresAt && !expiresAt)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter dates as YYYY-MM-DD.' })
      const parsed = rosterNeedSchema.safeParse({ position: input.position, gradYear: input.gradYear, note: input.note, sourceUrl: input.sourceUrl, postedAt, expiresAt })
      if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid roster need' })
      return postRosterNeed(input.programId, parsed.data, ctx.user.id)
    }),

  recentProgramChanges: adminProcedure.query(async () => {
    const rows = await db.programChange.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, newValue: true, detectedAt: true, processedAt: true, college: { select: { schoolName: true } }, _count: { select: { drafts: true } } },
    })
    return rows.map((r) => ({ ...r, detectedAt: r.detectedAt.toISOString(), processedAt: r.processedAt?.toISOString() ?? null }))
  }),

  referenceClips: adminProcedure.query(async () => {
    const rows = await db.referenceClip.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, title: true, playerName: true, level: true, motionType: true, handedness: true, status: true, errorCode: true, active: true, licensor: true, licenseReference: true, licenseExpiresAt: true, attribution: true, createdAt: true },
    })
    const now = Date.now()
    return rows.map((r) => ({ ...r, licenseExpired: r.licenseExpiresAt !== null && r.licenseExpiresAt.getTime() <= now }))
  }),

  /** Requires the licence details up front; the clip stays inactive until processed and switched on. */
  createReferenceClip: adminProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(120),
        playerName: z.string().trim().min(2).max(120),
        level: z.string().trim().min(2).max(40),
        motionType: z.enum(MotionType),
        handedness: z.enum(Handedness),
        contentType: z.string().max(64),
        sizeBytes: z.number().int().positive(),
        durationMs: z.number().int().positive(),
        width: z.number().int().min(160).max(8192),
        height: z.number().int().min(160).max(8192),
        licensor: z.string().trim().min(2).max(160),
        licenseReference: z.string().trim().min(2).max(160),
        licenseExpiresAt: z.string().nullable(),
        attribution: z.string().trim().min(5).max(300),
        licenseConfirmed: z.literal(true, { error: 'Confirm that the licence covers this use' }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const expires = input.licenseExpiresAt ? parseDateOnly(input.licenseExpiresAt) : null
      if (input.licenseExpiresAt && !expires) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter the licence end date as YYYY-MM-DD.' })
      if (expires && expires.getTime() <= Date.now()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'That licence has already expired.' })
      try {
        return await createReferenceUpload(ctx.user.id, {
          ...input,
          title: sanitizeText(input.title),
          playerName: sanitizeText(input.playerName),
          level: sanitizeText(input.level),
          licensor: sanitizeText(input.licensor),
          licenseReference: sanitizeText(input.licenseReference),
          attribution: sanitizeText(input.attribution),
          licenseExpiresAt: expires,
        })
      } catch (error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message })
      }
    }),

  completeReferenceClip: adminProcedure.input(z.object({ clipId: z.uuid() })).mutation(async ({ input }) => {
    try {
      return { status: await completeReferenceUpload(input.clipId) }
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message })
    }
  }),

  setReferenceClipActive: adminProcedure.input(z.object({ clipId: z.uuid(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    try {
      await setReferenceClipActive(ctx.user.id, input.clipId, input.active)
      return { ok: true }
    } catch (error) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: (error as Error).message })
    }
  }),

  deleteReferenceClip: adminProcedure.input(z.object({ clipId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await deleteReferenceClip(ctx.user.id, input.clipId)
    return { ok: true }
  }),

  /** Coaches who confirmed their school email and wait for a staff-directory check. */
  coachQueue: adminProcedure.query(async () => {
    const [waiting, recent] = await Promise.all([
      db.coachProfile.findMany({
        where: { status: 'IN_REVIEW' },
        orderBy: { updatedAt: 'asc' },
        take: 25,
        select: { userId: true, firstName: true, lastName: true, title: true, workEmail: true, workEmailVerifiedAt: true, staffDirectoryUrl: true, college: { select: { schoolName: true, division: true, dataSourceUrl: true } } },
      }),
      db.coachProfile.findMany({
        where: { status: { in: ['VERIFIED', 'SUSPENDED'] } },
        orderBy: { reviewedAt: 'desc' },
        take: 25,
        select: { userId: true, firstName: true, lastName: true, title: true, status: true, reviewedAt: true, college: { select: { schoolName: true } }, _count: { select: { reports: { where: { resolvedAt: null } } } } },
      }),
    ])
    return { waiting, recent }
  }),

  decideCoach: adminProcedure
    .input(z.object({ coachId: z.uuid(), decision: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']), note: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.decision !== 'VERIFIED' && !input.note) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add a note explaining the decision; the coach sees it.' })
      if (!(await decideCoach(ctx.user.id, input.coachId, input.decision, input.note))) throw new TRPCError({ code: 'CONFLICT', message: 'This coach is not in a state that allows that decision.' })
      return { ok: true }
    }),

  coachReports: adminProcedure.query(() =>
    db.coachReport.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, reason: true, createdAt: true, coach: { select: { userId: true, firstName: true, lastName: true, title: true, status: true, college: { select: { schoolName: true } } } }, reporter: { select: { athleteProfile: { select: { firstName: true, gradYear: true } } } } },
    }),
  ),

  resolveCoachReport: adminProcedure.input(z.object({ id: z.uuid(), resolution: z.string().trim().min(5).max(500) })).mutation(async ({ input }) => {
    const result = await db.coachReport.updateMany({ where: { id: input.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolution: sanitizeText(input.resolution) } })
    if (!result.count) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report already resolved.' })
    return { ok: true }
  }),

  // Team accounts (Phase 6): staff match the coach to the school or club staff page before players can join.
  teamQueue: adminProcedure.query(async () => {
    const select = { id: true, name: true, sport: true, orgType: true, organization: true, state: true, coachName: true, coachTitle: true, directoryUrl: true, status: true, createdAt: true, reviewedAt: true, coach: { select: { email: true } } } as const
    const [waiting, verified] = await Promise.all([
      db.team.findMany({ where: { status: 'PENDING' }, orderBy: { updatedAt: 'asc' }, take: 50, select }),
      db.team.findMany({ where: { status: 'VERIFIED' }, orderBy: { reviewedAt: 'desc' }, take: 50, select: { ...select, _count: { select: { members: { where: { status: 'ACTIVE' } } } } } }),
    ])
    return { waiting, verified: verified.map(({ _count, ...t }) => ({ ...t, activeMembers: _count.members })) }
  }),

  decideTeam: adminProcedure
    .input(z.object({ teamId: z.uuid(), decision: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']), note: z.string().trim().max(500).nullable(), revokeRecorded: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      if (input.decision !== 'VERIFIED' && !input.note) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add a note explaining the decision; the coach sees it.' })
      if (!(await decideTeam(ctx.user.id, input.teamId, input.decision, input.note, { revokeRecorded: input.revokeRecorded }))) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This team is not in a state that allows that decision.' })
      }
      return { ok: true }
    }),

  // Events and the recruiting calendar (Phase 7).
  eventQueue: adminProcedure.query(async () => {
    const [waiting, listed] = await Promise.all([eventReviewQueue(), upcomingListedForStaff()])
    return {
      waiting: waiting.map((e) => ({ ...e, startDate: e.startDate.toISOString().slice(0, 10), endDate: e.endDate.toISOString().slice(0, 10), createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(), reviewedAt: null })),
      listed: listed.map(({ _count, ...e }) => ({ ...e, startDate: e.startDate.toISOString().slice(0, 10), endDate: e.endDate.toISOString().slice(0, 10), going: _count.attendance })),
    }
  }),

  reviewEvent: adminProcedure
    .input(z.object({ eventId: z.uuid(), decision: z.enum(['PUBLISHED', 'REJECTED']), note: z.string().trim().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.decision === 'REJECTED' && !input.note) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add a note explaining why; the person who submitted it sees it.' })
      await eventCall(() => reviewEvent(ctx.user.id, input.eventId, input.decision, input.note))
      revalidatePath('/events')
      return { ok: true }
    }),

  cancelEvent: adminProcedure.input(z.object({ eventId: z.uuid(), note: z.string().trim().min(5).max(500) })).mutation(async ({ ctx, input }) => {
    await eventCall(() => cancelEvent(ctx.user.id, input.eventId, input.note))
    revalidatePath('/events')
    return { ok: true }
  }),

  recruitingPeriods: adminProcedure.query(async () =>
    (await calendar({})).map((p) => ({ ...p, startDate: p.startDate.toISOString().slice(0, 10), endDate: p.endDate.toISOString().slice(0, 10) })),
  ),

  addRecruitingPeriod: adminProcedure.input(z.object({ sport: z.string(), division: z.string(), kind: z.string(), startDate: z.string(), endDate: z.string(), sourceUrl: z.string(), sourceTitle: z.string(), note: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const parsed = periodInputSchema.safeParse(input)
    if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Check the fields.', cause: parsed.error })
    const id = await eventCall(() => createPeriod(ctx.user.id, parsed.data))
    revalidatePath('/recruiting-calendar')
    return { id }
  }),

  removeRecruitingPeriod: adminProcedure.input(z.object({ periodId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await eventCall(() => deletePeriod(ctx.user.id, input.periodId))
    revalidatePath('/recruiting-calendar')
    return { ok: true }
  }),

  // Drill library (Phase 7). A drill is published by a different staff member than its writer.
  drills: adminProcedure.query(async ({ ctx }) =>
    (await drillLibrary()).map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), licenceExpiresAt: d.licenceExpiresAt?.toISOString().slice(0, 10) ?? null, mine: d.createdById === ctx.user.id })),
  ),

  createDrill: adminProcedure.input(z.record(z.string(), z.unknown())).mutation(async ({ ctx, input }) => {
    const parsed = drillInputSchema.safeParse(input)
    if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Check the fields.', cause: parsed.error })
    return { id: await createDrill(ctx.user.id, parsed.data) }
  }),

  setDrillStatus: adminProcedure.input(z.object({ drillId: z.uuid(), action: z.enum(['publish', 'retire', 'delete']) })).mutation(async ({ ctx, input }) => {
    try {
      if (input.action === 'publish') await publishDrill(ctx.user.id, input.drillId)
      else if (input.action === 'retire') await retireDrill(ctx.user.id, input.drillId)
      else await deleteDraftDrill(ctx.user.id, input.drillId)
    } catch (error) {
      if (error instanceof TrainingError) throw new TRPCError({ code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', message: error.message })
      throw error
    }
    return { ok: true }
  }),

  // In-app messaging reports (Phase 6). Loading the queue is audited.
  messageReports: adminProcedure.query(async ({ ctx }) =>
    (await messageReportQueue(ctx.user.id)).map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), context: r.context.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) })),
  ),

  resolveMessageReport: adminProcedure
    .input(z.object({ reportId: z.uuid(), resolution: z.string().trim().min(5).max(500), closeThread: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await resolveMessageReport(ctx.user.id, input.reportId, input.resolution, { closeThread: input.closeThread }))) throw new TRPCError({ code: 'NOT_FOUND', message: 'Report already resolved.' })
      return { ok: true }
    }),

  // National norms (Phase 6). Upload goes through POST /api/admin/norms (tables exceed the API body cap).
  normDatasets: adminProcedure.query(async () =>
    (await listNormDatasets()).map((d) => ({
      ...d,
      licenceExpiresAt: d.licenceExpiresAt?.toISOString().slice(0, 10) ?? null,
      activatedAt: d.activatedAt?.toISOString() ?? null,
      retiredAt: d.retiredAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  ),

  setNormDatasetStatus: adminProcedure
    .input(z.object({ datasetId: z.uuid(), action: z.enum(['activate', 'retire', 'delete']) }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (input.action === 'activate') await activateNormDataset(ctx.user.id, input.datasetId)
        else if (input.action === 'retire') await retireNormDataset(ctx.user.id, input.datasetId)
        else await deleteDraftNormDataset(ctx.user.id, input.datasetId)
        return { ok: true }
      } catch (error) {
        if (error instanceof NormAdminError) throw new TRPCError({ code: 'CONFLICT', message: error.message })
        throw error
      }
    }),

  previewNorm: adminProcedure
    .input(
      z.object({
        datasetId: z.uuid(),
        metricType: z.enum(MetricType),
        value: z.number().finite(),
        age: z.number().int().min(12).max(25),
        heightInches: z.number().int().min(48).max(90),
        weightLbs: z.number().int().min(70).max(400),
      }),
    )
    .query(({ input }) => previewNorm(input.datasetId, input)),
})

async function eventCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof EventError) throw new TRPCError({ code: error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', message: error.message })
    throw error
  }
}
