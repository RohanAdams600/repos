import type { Prisma } from '@/generated/prisma/client'
import type { LlmClient } from '@/lib/ai/llm'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { checkAsset } from '@/lib/marketing/compliance'
import { withUtm } from '@/lib/marketing/utm'
import { workerEnv } from '@worker/env'
import type { AgentRunContext } from '@worker/agents/run-guard'
import { draftCopy, toChannelPayload } from '@worker/agents/growth/copywriter'
import { MetaAdsClient, safeMetaError } from '@worker/agents/growth/meta-ads'
import { rankTopics, SeasonalSource, XRecentCountsSource, type TrendSource } from '@worker/agents/growth/trends'

const UTM_SOURCE: Record<string, string> = { META_AD: 'facebook', FACEBOOK_POST: 'facebook', INSTAGRAM_POST: 'instagram', X_POST: 'x' }
const UTM_MEDIUM: Record<string, string> = { META_AD: 'paid_social', FACEBOOK_POST: 'social', INSTAGRAM_POST: 'social', X_POST: 'social' }

export type GrowthRunStats = {
  topics: string[]
  generated: number
  approved: number
  needsReview: number
  rejected: number
  publishedAds: number
  publishErrors: number
}

/**
 * Agent 1: Growth and Ad agent (Tuesdays and Thursdays, 10:00).
 *
 * 1. Rank this week's topics from the seasonal calendar and, when configured, X API momentum.
 * 2. Draft channel-specific copy with the LLM (approved product facts only).
 * 3. Run every asset through the claims and policy checker.
 * 4. Store ready-to-publish JSON payloads for the admin marketing dashboard.
 * 5. Optionally push approved Meta ads, created PAUSED by default, behind spend-cap guard rails.
 */
export async function runGrowthAgent(llm: LlmClient, ctx: AgentRunContext, now: Date = new Date()): Promise<GrowthRunStats> {
  const config = workerEnv()
  const sources: TrendSource[] = [new SeasonalSource()]
  if (config.X_BEARER_TOKEN) sources.push(new XRecentCountsSource(config.X_BEARER_TOKEN))

  const signalSets = await Promise.all(
    sources.map((source) =>
      source.collect(now).catch((error: unknown) => {
        logger.warn({ source: source.name, err: { message: (error as Error).message } }, 'trend source failed')
        return []
      }),
    ),
  )
  const topics = rankTopics(signalSets, 3)
  const drafts = await draftCopy(llm, { topics, regions: config.GROWTH_TARGET_REGIONS, runId: ctx.runId })

  const stats: GrowthRunStats = { topics: topics.map((t) => t.topic), generated: drafts.length, approved: 0, needsReview: 0, rejected: 0, publishedAds: 0, publishErrors: 0 }
  const meta =
    config.META_AUTOPUBLISH && config.META_ACCESS_TOKEN && config.META_AD_ACCOUNT_ID && config.META_PAGE_ID && config.META_AD_SET_ID
      ? new MetaAdsClient({
          accessToken: config.META_ACCESS_TOKEN,
          appSecret: config.META_APP_SECRET,
          adAccountId: config.META_AD_ACCOUNT_ID,
          pageId: config.META_PAGE_ID,
          adSetId: config.META_AD_SET_ID,
          graphVersion: config.META_GRAPH_VERSION,
          autoActivate: config.META_ADS_AUTO_ACTIVATE,
          minRemainingCapUsd: config.META_MIN_REMAINING_CAP_USD,
        })
      : null

  for (const draft of drafts) {
    const { asset, issues, blocked } = checkAsset(draft, now)
    const status = blocked ? 'REJECTED' : issues.length > 0 || !config.GROWTH_AUTO_APPROVE ? 'DRAFT' : 'APPROVED'
    if (status === 'REJECTED') stats.rejected++
    else if (status === 'DRAFT') stats.needsReview++
    else stats.approved++

    const created = await db.marketingAsset.create({
      data: {
        agentRunId: ctx.runId,
        channel: asset.channel,
        status,
        topic: asset.topic.slice(0, 200),
        payload: {} as Prisma.InputJsonValue,
        complianceIssues: issues as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    const link = withUtm(env().APP_URL, {
      source: UTM_SOURCE[asset.channel] ?? 'social',
      medium: UTM_MEDIUM[asset.channel] ?? 'social',
      campaign: `growth-${ctx.slot.slice(0, 10)}`,
      content: created.id.slice(0, 8),
      term: asset.feature,
    })
    await db.marketingAsset.update({
      where: { id: created.id },
      data: { payload: toChannelPayload(asset, link) as Prisma.InputJsonValue },
    })

    if (meta && status === 'APPROVED' && asset.channel === 'META_AD') {
      try {
        const ad = await meta.createAd({
          name: `KS growth ${ctx.slot} ${created.id.slice(0, 8)}`,
          primaryText: asset.primaryText,
          headline: asset.headline,
          description: asset.description,
          callToAction: asset.callToAction,
          link,
        })
        await db.marketingAsset.update({
          where: { id: created.id },
          data: { status: 'PUBLISHED', externalId: ad.adId, publishedAt: new Date() },
        })
        stats.publishedAds++
      } catch (error) {
        stats.publishErrors++
        await db.marketingAsset.update({
          where: { id: created.id },
          data: {
            status: 'FAILED',
            complianceIssues: [...issues, { code: 'PUBLISH_FAILED', severity: 'warn', message: safeMetaError(error) }] as unknown as Prisma.InputJsonValue,
          },
        })
      }
    }
  }
  return stats
}
