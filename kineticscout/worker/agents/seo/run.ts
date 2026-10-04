import type { Prisma } from '@/generated/prisma/client'
import type { LlmClient } from '@/lib/ai/llm'
import { allowedNumbersFrom, factCheck, slugify } from '@/lib/content/fact-check'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { workerEnv } from '@worker/env'
import { revalidatePaths } from '@worker/revalidate'
import type { AgentRunContext } from '@worker/agents/run-guard'
import { buildSnapshot, chooseArticleMetric, draftArticle } from '@worker/agents/seo/article'
import { computeBaselines, isoWeekStart, storeBaselines } from '@worker/agents/seo/percentiles'

const WINDOW_MONTHS = 12

export type SeoRunStats = {
  weekOf: string
  baselinesStored: number
  article: 'published' | 'draft' | 'skipped-insufficient-data'
  slug?: string
  unknownNumbers?: string[]
}

/**
 * Agent 2: Data and SEO agent (Sundays, 00:00).
 *
 * 1. Recompute weekly percentile baselines from anonymized, k-anonymous aggregates.
 * 2. Pick the least recently covered metric with enough data.
 * 3. Draft an article from the aggregate snapshot.
 * 4. Fact-check every number against the snapshot. Publish automatically only when the check
 *    passes and SEO_AUTOPUBLISH is on; otherwise hold as a draft for review in /admin.
 */
export async function runSeoAgent(llm: LlmClient, ctx: AgentRunContext, now: Date = new Date()): Promise<SeoRunStats> {
  const config = workerEnv()
  const weekStart = isoWeekStart(now)
  const weekOf = weekStart.toISOString().slice(0, 10)

  const baselines = await computeBaselines(now, config.K_ANONYMITY_MIN, WINDOW_MONTHS)
  const baselinesStored = await storeBaselines(weekStart, baselines)

  const metric = await chooseArticleMetric(baselines)
  if (!metric) return { weekOf, baselinesStored, article: 'skipped-insufficient-data' }

  const snapshot = await buildSnapshot(metric, baselines, weekStart, config.K_ANONYMITY_MIN, WINDOW_MONTHS)
  const draft = await draftArticle(llm, snapshot)

  const appOrigin = new URL(env().APP_URL).origin
  const allowed = allowedNumbersFrom(snapshot, [now.getUTCFullYear(), WINDOW_MONTHS])
  const report = factCheck([draft.title, draft.metaDescription, draft.bodyMarkdown].join('\n'), allowed, appOrigin)
  const publish = config.SEO_AUTOPUBLISH && report.ok

  let slug = `${slugify(draft.title)}-${weekOf}`
  if (await db.blogPost.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${ctx.runId.slice(-6)}`

  await db.blogPost.create({
    data: {
      slug,
      title: draft.title,
      metaDescription: draft.metaDescription,
      bodyMarkdown: draft.bodyMarkdown,
      status: publish ? 'PUBLISHED' : 'DRAFT',
      dataSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      validationReport: report as unknown as Prisma.InputJsonValue,
      generatedBy: draft.model.slice(0, 64),
      agentRunId: ctx.runId,
      publishedAt: publish ? new Date() : null,
    },
  })
  if (publish) await revalidatePaths(['/blog', `/blog/${slug}`, '/sitemap.xml'])

  return {
    weekOf,
    baselinesStored,
    article: publish ? 'published' : 'draft',
    slug,
    ...(report.unknownNumbers.length ? { unknownNumbers: report.unknownNumbers.slice(0, 20) } : {}),
  }
}
