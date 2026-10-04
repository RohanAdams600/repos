import { z } from 'zod'
import { positionLabel } from '@/lib/athletes/positions'
import type { LlmClient } from '@/lib/ai/llm'
import { db } from '@/lib/db'
import { METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'
import { stripEmDashes } from '@/lib/marketing/compliance'
import { programMetricsSchema } from '@/lib/matchmaker/score'
import type { CohortBaseline } from '@worker/agents/seo/percentiles'

export type ArticleSnapshot = {
  metricType: MetricType
  metricLabel: string
  unit: string
  lowerIsBetter: boolean
  weekOf: string
  windowMonths: number
  minimumCohortSize: number
  national: { athletes: number; p10: number; p25: number; median: number; p75: number; p90: number; mean: number }
  byClass: { classOf: number; athletes: number; p25: number; median: number; p75: number }[]
  byPosition: { position: string; athletes: number; median: number }[]
  programBenchmarks: { division: string; programs: number; typicalRecruit: number }[]
}

/** Chooses the metric with an eligible national cohort that was written about least recently. */
export async function chooseArticleMetric(baselines: CohortBaseline[]): Promise<MetricType | null> {
  const national = baselines.filter((b) => b.gradYear === null && b.position === null)
  const eligible = national
    .filter((n) => baselines.filter((b) => b.metricType === n.metricType && b.gradYear !== null && b.position === null).length >= 2)
    .map((n) => n.metricType)
  if (eligible.length === 0) return null

  let best: { metric: MetricType; last: number } | null = null
  for (const metric of eligible) {
    const latest = await db.blogPost.findFirst({
      where: { dataSnapshot: { path: ['metricType'], equals: metric } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    const last = latest?.createdAt.getTime() ?? 0
    if (!best || last < best.last) best = { metric, last }
  }
  return best?.metric ?? null
}

export async function buildSnapshot(
  metric: MetricType,
  baselines: CohortBaseline[],
  weekStart: Date,
  k: number,
  windowMonths: number,
): Promise<ArticleSnapshot> {
  const def = METRIC_DEFINITIONS[metric]
  const fix = (v: number) => Number(v.toFixed(def.decimals))
  const national = baselines.find((b) => b.metricType === metric && b.gradYear === null && b.position === null)
  if (!national) throw new Error(`No national cohort for ${metric}`)

  // Program benchmarks only from programs with a recorded data source, and only for divisions with at least 5 programs.
  const programs = await db.collegeProgram.findMany({
    where: { sport: 'BASEBALL', dataVerifiedAt: { not: null }, dataSourceUrl: { not: null } },
    select: { division: true, averageRecruitingMetrics: true },
  })
  const byDivision = new Map<string, number[]>()
  for (const p of programs) {
    const parsed = programMetricsSchema.safeParse(p.averageRecruitingMetrics)
    const target = parsed.success ? parsed.data[metric] : undefined
    if (!target) continue
    byDivision.set(p.division, [...(byDivision.get(p.division) ?? []), target.mean])
  }

  return {
    metricType: metric,
    metricLabel: def.label,
    unit: def.unit,
    lowerIsBetter: !def.higherIsBetter,
    weekOf: weekStart.toISOString().slice(0, 10),
    windowMonths,
    minimumCohortSize: k,
    national: {
      athletes: national.sampleSize,
      p10: fix(national.p10),
      p25: fix(national.p25),
      median: fix(national.p50),
      p75: fix(national.p75),
      p90: fix(national.p90),
      mean: fix(national.mean),
    },
    byClass: baselines
      .filter((b) => b.metricType === metric && b.gradYear !== null && b.position === null)
      .sort((a, b) => (a.gradYear ?? 0) - (b.gradYear ?? 0))
      .map((b) => ({ classOf: b.gradYear!, athletes: b.sampleSize, p25: fix(b.p25), median: fix(b.p50), p75: fix(b.p75) })),
    byPosition: baselines
      .filter((b) => b.metricType === metric && b.gradYear === null && b.position !== null)
      .sort((a, b) => b.sampleSize - a.sampleSize)
      .slice(0, 6)
      .map((b) => ({ position: positionLabel(b.position!), athletes: b.sampleSize, median: fix(b.p50) })),
    programBenchmarks: [...byDivision.entries()]
      .filter(([, means]) => means.length >= 5)
      .map(([division, means]) => ({
        division,
        programs: means.length,
        typicalRecruit: fix(means.reduce((a, b) => a + b, 0) / means.length),
      })),
  }
}

const articleSchema = z.object({
  title: z.string().min(20).max(70),
  metaDescription: z.string().min(70).max(155),
  sections: z
    .array(z.object({ heading: z.string().min(3).max(80), body: z.string().min(80).max(1800) }))
    .min(3)
    .max(6),
  keyTakeaways: z.array(z.string().min(10).max(200)).min(2).max(5),
})

const articleJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'metaDescription', 'sections', 'keyTakeaways'],
  properties: {
    title: { type: 'string' },
    metaDescription: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: { heading: { type: 'string' }, body: { type: 'string' } },
      },
    },
    keyTakeaways: { type: 'array', items: { type: 'string' } },
  },
}

export type DraftArticle = { title: string; metaDescription: string; bodyMarkdown: string; model: string }

const SYSTEM = `You are the data editor at KineticScout. You write clear, accurate articles for high school baseball players, parents and coaches from aggregate data that is given to you.

Hard rules:
- Use only numbers that appear in the data. Do not calculate new numbers, differences, ratios or percentages. Do not round differently than given.
- Describe the data honestly: it comes from KineticScout athletes' self-reported and verified entries, not from all players nationally, and not from college recruits. Program benchmarks are averages from the college programs in KineticScout's database.
- Never promise scholarships, offers or recruiting outcomes. No guarantees. No superlatives about KineticScout.
- No HTML, no links, no headings inside section bodies, no emojis, no em dashes.
- Titles state exactly what the data shows, for example "Exit Velocity Percentiles by Graduating Class: October 2026 Data".
- Write in short paragraphs. Plain language. No buzzwords.`

/** Turns the snapshot into an article. Methodology and disclosure are appended deterministically, not by the model. */
export async function draftArticle(llm: LlmClient, snapshot: ArticleSnapshot): Promise<DraftArticle> {
  const result = await llm.generateJson({
    feature: 'SEO_AGENT',
    userId: null,
    system: SYSTEM,
    user: `Write this week's article about ${snapshot.metricLabel} (${snapshot.unit}, ${snapshot.lowerIsBetter ? 'lower is better' : 'higher is better'}).

Data (JSON):
${JSON.stringify(snapshot, null, 2)}`,
    schemaName: 'data_article',
    jsonSchema: articleJsonSchema,
    validator: articleSchema,
    maxOutputTokens: 3_000,
    temperature: 0.3,
  })

  const clean = (text: string) => stripEmDashes(text).replace(/^#+\s*/gm, '').trim()
  const a = result.data
  const def = METRIC_DEFINITIONS[snapshot.metricType]
  const methodology = [
    '## How these numbers were calculated',
    `Each athlete contributes one value: their best ${def.label.toLowerCase()} logged in the ${snapshot.windowMonths} months before the week of ${snapshot.weekOf}. Values include self-reported and video-verified entries.`,
    `Groups with fewer than ${snapshot.minimumCohortSize} athletes are not reported, so no individual athlete can be identified from these figures.`,
    snapshot.programBenchmarks.length
      ? 'Program benchmarks average the typical-recruit figures of college programs in our database that have a documented data source.'
      : '',
    '*This article was drafted with AI from KineticScout aggregate data and checked automatically so that every number matches the source data.*',
  ]
    .filter(Boolean)
    .join('\n\n')

  const body = [
    '**Key takeaways**',
    a.keyTakeaways.map((t) => `- ${clean(t)}`).join('\n'),
    ...a.sections.map((s) => `## ${clean(s.heading)}\n\n${clean(s.body)}`),
    methodology,
  ].join('\n\n')

  return { title: clean(a.title), metaDescription: clean(a.metaDescription), bodyMarkdown: body, model: result.model }
}
