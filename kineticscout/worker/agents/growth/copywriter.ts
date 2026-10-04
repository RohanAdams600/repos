import { z } from 'zod'
import type { LlmClient } from '@/lib/ai/llm'
import { PRO_FEATURES, PRO_PRICES } from '@/lib/billing/plans'
import type { DraftAsset, MarketingChannel } from '@/lib/marketing/compliance'

export const FEATURE_KEYS = ['unlimited_metrics', 'video_analysis', 'college_matchmaker', 'outreach_assistant'] as const

const CHANNELS: MarketingChannel[] = ['META_AD', 'INSTAGRAM_POST', 'FACEBOOK_POST', 'X_POST']

const assetSchema = z.object({
  channel: z.enum(CHANNELS as [MarketingChannel, ...MarketingChannel[]]),
  topic: z.string().min(3).max(120),
  region: z.string().min(2).max(40),
  primaryText: z.string().min(10).max(2200),
  headline: z.string().max(80),
  description: z.string().max(80),
  callToAction: z.enum(['LEARN_MORE', 'SIGN_UP', 'SUBSCRIBE']),
  hashtags: z.array(z.string().max(40)).max(10),
  feature: z.enum(FEATURE_KEYS),
})

export const copyBatchSchema = z.object({ assets: z.array(assetSchema).min(1).max(16) })

/** JSON Schema in the strict Structured Outputs subset; zod above enforces the length limits. */
export const copyBatchJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['assets'],
  properties: {
    assets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'topic', 'region', 'primaryText', 'headline', 'description', 'callToAction', 'hashtags', 'feature'],
        properties: {
          channel: { type: 'string', enum: CHANNELS },
          topic: { type: 'string' },
          region: { type: 'string' },
          primaryText: { type: 'string' },
          headline: { type: 'string' },
          description: { type: 'string' },
          callToAction: { type: 'string', enum: ['LEARN_MORE', 'SIGN_UP', 'SUBSCRIBE'] },
          hashtags: { type: 'array', items: { type: 'string' } },
          feature: { type: 'string', enum: [...FEATURE_KEYS] },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You write marketing copy for KineticScout, a web app for high school baseball players and their parents.

Approved product facts (the only claims you may make):
${PRO_FEATURES.map((f) => `- Pro includes: ${f}`).join('\n')}
- Pro costs $14.99 per month or $129 per year. The free plan allows logging 3 metrics per month.
- Profiles are private by default; athletes under 18 need a parent or guardian's consent before a profile can be public.

Rules you must follow:
- Never promise or imply scholarships, offers, roster spots, recruitment, or any outcome.
- Never invent statistics, percentages, user counts, testimonials, or results. The only numbers allowed are the prices above, the number 3 for the free plan, and graduating class years.
- No superlatives you cannot prove (best, #1, most accurate, only).
- No urgency tactics or fear-based messages.
- Paid ads (META_AD) speak to parents and adult athletes, never to children, and never mention other companies, leagues or associations by name.
- Plain, specific, confident language. No buzzwords. Do not use em dashes. No emojis in headlines.
- Headlines: 40 characters or fewer. Descriptions: 30 characters or fewer. META_AD primary text: 125 characters or fewer. X_POST: 240 characters or fewer including hashtags.
- For INSTAGRAM_POST and X_POST leave headline and description as empty strings.
- At most 4 hashtags per asset, no spaces inside a hashtag.`

export type CopyRequest = { topics: { topic: string; evidence: string[] }[]; regions: string[]; runId: string }

export async function draftCopy(llm: LlmClient, request: CopyRequest): Promise<DraftAsset[]> {
  const user = `Write one asset per channel (META_AD, INSTAGRAM_POST, FACEBOOK_POST, X_POST) for each topic below.
Localize the META_AD and FACEBOOK_POST for one of these regions each (use the state name, not the code): ${request.regions.join(', ')}. Use "national" for the others.
Tie each asset to the topic naturally and highlight exactly one Pro feature that fits the topic.

Topics this week:
${request.topics.map((t, i) => `${i + 1}. ${t.topic} (signals: ${t.evidence.join('; ')})`).join('\n')}`

  const result = await llm.generateJson({
    feature: 'GROWTH_AGENT',
    userId: null,
    system: SYSTEM_PROMPT,
    user,
    schemaName: 'marketing_copy_batch',
    jsonSchema: copyBatchJsonSchema as unknown as Record<string, unknown>,
    validator: copyBatchSchema,
    maxOutputTokens: 4_000,
    temperature: 0.7,
  })
  return result.data.assets
}

/** Shapes a compliant asset into the payload each channel's API or scheduler expects. */
export function toChannelPayload(asset: DraftAsset, link: string): Record<string, unknown> {
  switch (asset.channel) {
    case 'META_AD':
      return {
        platform: 'meta',
        objective: 'OUTCOME_TRAFFIC',
        creative: {
          primaryText: asset.primaryText,
          headline: asset.headline,
          description: asset.description,
          callToAction: asset.callToAction,
          link,
        },
        region: asset.region,
        audiencePolicy: 'Ad set audience is owned in Ads Manager and must be adults (age_min >= 18).',
      }
    case 'FACEBOOK_POST':
      return { platform: 'facebook', message: [asset.primaryText, asset.hashtags.join(' ')].filter(Boolean).join('\n\n'), link }
    case 'INSTAGRAM_POST':
      return { platform: 'instagram', caption: [asset.primaryText, asset.hashtags.join(' ')].filter(Boolean).join('\n\n'), linkInBio: link }
    case 'X_POST':
      return { platform: 'x', text: [asset.primaryText, asset.hashtags.join(' ')].filter(Boolean).join(' '), link }
  }
}

export const PRICES_FOR_PROMPT = PRO_PRICES
