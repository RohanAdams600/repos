import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { OutreachChannel } from '@/generated/prisma/enums'
import { BudgetExceededError } from '@/lib/ai/budget'
import { LlmOutputError, OpenAiLlmClient } from '@/lib/ai/llm'
import { canDraftOutreach } from '@/lib/auth/permissions'
import { db } from '@/lib/db'
import { mailtoHref } from '@/lib/recruiting/draft-check'
import { draftOutreach } from '@/lib/recruiting/outreach'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { athleteProcedure, createRouter } from '@/server/trpc'

/** The recruiting assistant is a Pro feature, and minors need guardian consent (it addresses coaches). */
const assistantProcedure = athleteProcedure.use(({ ctx, next }) => {
  if (!canDraftOutreach(ctx.user)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: ctx.user.ageBand === 'MINOR' && ctx.user.guardianConsent !== 'GRANTED' ? 'A parent or guardian must give consent before you can contact coaches.' : 'The recruiting assistant is part of Pro.',
    })
  }
  return next()
})

export const recruitingRouter = createRouter({
  overview: assistantProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 120 * 86_400_000)
    const [profile, pipeline, drafts] = await Promise.all([
      db.athleteProfile.findUniqueOrThrow({ where: { userId: ctx.user.id }, select: { recruitingAlerts: true, recruitingAlertEmails: true } }),
      db.recruitingPipeline.findMany({
        where: { athleteId: ctx.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          status: true,
          college: {
            select: {
              id: true,
              schoolName: true,
              division: true,
              headCoachName: true,
              headCoachEmail: true,
              dataSourceUrl: true,
              changes: { where: { detectedAt: { gte: since } }, orderBy: { detectedAt: 'desc' }, take: 3, select: { id: true, kind: true, newValue: true, detectedAt: true, sourceUrl: true } },
            },
          },
        },
      }),
      db.outreachDraft.findMany({
        where: { athleteId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, trigger: true, channel: true, subject: true, body: true, createdAt: true, copiedAt: true, college: { select: { schoolName: true, headCoachEmail: true } } },
      }),
    ])
    return {
      alerts: profile.recruitingAlerts,
      emailAlerts: profile.recruitingAlertEmails,
      programs: pipeline.map((p) => ({
        id: p.college.id,
        schoolName: p.college.schoolName,
        division: p.college.division,
        status: p.status,
        headCoachName: p.college.headCoachName,
        hasCoachEmail: Boolean(p.college.headCoachEmail),
        changes: p.college.changes.map((c) => ({ id: c.id, kind: c.kind, detail: c.newValue as Record<string, unknown>, detectedAt: c.detectedAt.toISOString(), sourceUrl: c.sourceUrl })),
      })),
      drafts: drafts.map((d) => ({
        id: d.id,
        trigger: d.trigger,
        channel: d.channel,
        schoolName: d.college.schoolName,
        subject: d.subject,
        body: d.body,
        createdAt: d.createdAt.toISOString(),
        copiedAt: d.copiedAt?.toISOString() ?? null,
        mailto: d.channel === 'EMAIL' ? mailtoHref(d.college.headCoachEmail, d.subject, d.body) : null,
      })),
    }
  }),

  setAlerts: assistantProcedure.input(z.object({ alerts: z.boolean(), emailAlerts: z.boolean() })).mutation(async ({ ctx, input }) => {
    await db.athleteProfile.update({ where: { userId: ctx.user.id }, data: { recruitingAlerts: input.alerts, recruitingAlertEmails: input.emailAlerts } })
    return input
  }),

  draft: assistantProcedure.input(z.object({ collegeId: z.uuid(), channel: z.enum(OutreachChannel) })).mutation(async ({ ctx, input }) => {
    const inPipeline = await db.recruitingPipeline.findUnique({ where: { athleteId_collegeId: { athleteId: ctx.user.id, collegeId: input.collegeId } }, select: { id: true } })
    if (!inPipeline) throw new TRPCError({ code: 'NOT_FOUND', message: 'Add this program to your pipeline first.' })
    try {
      await enforceRateLimit('outreachDraft', ctx.user.id)
      const draft = await draftOutreach(new OpenAiLlmClient(), { athleteId: ctx.user.id, collegeId: input.collegeId, changeId: null, channel: input.channel, trigger: 'MANUAL' })
      return { id: draft.id }
    } catch (error) {
      if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'You have drafted 20 messages today. Try again tomorrow.' })
      if (error instanceof BudgetExceededError) throw new TRPCError({ code: 'FORBIDDEN', message: error.message })
      if (error instanceof LlmOutputError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'We could not write a draft that passes our accuracy checks. Try again.' })
      throw error
    }
  }),

  markCopied: assistantProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db.outreachDraft.updateMany({ where: { id: input.id, athleteId: ctx.user.id, copiedAt: null }, data: { copiedAt: new Date() } })
    return { ok: true }
  }),

  deleteDraft: assistantProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db.outreachDraft.deleteMany({ where: { id: input.id, athleteId: ctx.user.id } })
    return { ok: true }
  }),
})
