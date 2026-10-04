import { errorFields, logger } from '@/lib/logger'

/**
 * Trend inputs for the Growth agent.
 *
 * Only official, terms-compliant sources are used. TikTok offers no commercial trends API and its
 * terms prohibit scraping, so it is intentionally not a source; plug a licensed provider into
 * TrendSource if one becomes available.
 */

export type TrendSignal = { topic: string; score: number; source: string; evidence: string }

export interface TrendSource {
  readonly name: string
  collect(now: Date): Promise<TrendSignal[]>
}

export type CandidateTopic = {
  topic: string
  /** X API v2 search query (official recent-counts endpoint). */
  query: string
  /** Calendar months (1 to 12) when the topic is seasonally relevant in US high school baseball. */
  months: readonly number[]
}

export const CANDIDATE_TOPICS: readonly CandidateTopic[] = [
  { topic: 'travel ball tryouts', query: '"travel ball" tryouts', months: [7, 8, 9, 10] },
  { topic: 'fall showcase season', query: 'baseball showcase', months: [8, 9, 10, 11] },
  { topic: 'summer showcase season', query: 'baseball showcase summer', months: [5, 6, 7] },
  { topic: 'college baseball prospect camps', query: '"prospect camp" baseball', months: [10, 11, 12, 1, 6, 7] },
  { topic: 'high school baseball season openers', query: '"high school baseball" opening day', months: [2, 3] },
  { topic: 'offseason velocity training', query: 'pitching velocity training', months: [11, 12, 1] },
  { topic: 'exit velocity development', query: '"exit velocity" baseball', months: [11, 12, 1, 2] },
  { topic: 'recruiting video tips', query: 'baseball recruiting video', months: [1, 2, 8, 9, 10] },
  { topic: 'contacting college coaches', query: 'email college baseball coaches', months: [6, 7, 8, 9, 10] },
]

/** Calendar-driven baseline: always available, no network. */
export class SeasonalSource implements TrendSource {
  readonly name = 'seasonal'
  async collect(now: Date): Promise<TrendSignal[]> {
    const month = now.getUTCMonth() + 1
    return CANDIDATE_TOPICS.map((c) => ({
      topic: c.topic,
      score: c.months.includes(month) ? 1 : 0.15,
      source: this.name,
      evidence: c.months.includes(month) ? `in season for month ${month}` : 'off season',
    }))
  }
}

/** Momentum from the official X API v2 recent tweet counts endpoint (requires a paid API tier). */
export class XRecentCountsSource implements TrendSource {
  readonly name = 'x-recent-counts'
  constructor(private readonly bearerToken: string) {}

  async collect(): Promise<TrendSignal[]> {
    const signals: TrendSignal[] = []
    for (const candidate of CANDIDATE_TOPICS) {
      try {
        const url = new URL('https://api.x.com/2/tweets/counts/recent')
        url.searchParams.set('query', `${candidate.query} -is:retweet lang:en`)
        url.searchParams.set('granularity', 'day')
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.bearerToken}` },
          signal: AbortSignal.timeout(8_000),
        })
        if (response.status === 429) break
        if (!response.ok) continue
        const body = (await response.json()) as { data?: { tweet_count: number }[] }
        const counts = (body.data ?? []).map((d) => d.tweet_count)
        if (counts.length < 3) continue
        const latest = counts[counts.length - 1]!
        const baseline = counts.slice(0, -1).reduce((a, b) => a + b, 0) / (counts.length - 1)
        const momentum = baseline > 0 ? latest / baseline : latest > 0 ? 2 : 0
        signals.push({
          topic: candidate.topic,
          score: Math.max(0, Math.min(1, Math.log2(1 + momentum) / 2)),
          source: this.name,
          evidence: `${latest} posts in the last day vs ${baseline.toFixed(0)} daily average`,
        })
      } catch (error) {
        logger.warn({ topic: candidate.topic, ...errorFields(error) }, 'trend lookup failed')
      }
    }
    return signals
  }
}

/** Blends sources (seasonal 60%, live momentum 40%) and returns the top topics. */
export function rankTopics(signalSets: TrendSignal[][], limit: number): { topic: string; score: number; evidence: string[] }[] {
  const weights: Record<string, number> = { seasonal: 0.6, 'x-recent-counts': 0.4 }
  const totals = new Map<string, { score: number; evidence: string[] }>()
  for (const set of signalSets) {
    for (const signal of set) {
      const entry = totals.get(signal.topic) ?? { score: 0, evidence: [] }
      entry.score += signal.score * (weights[signal.source] ?? 0.2)
      entry.evidence.push(`${signal.source}: ${signal.evidence}`)
      totals.set(signal.topic, entry)
    }
  }
  return [...totals.entries()]
    .map(([topic, v]) => ({ topic, score: Math.round(v.score * 1000) / 1000, evidence: v.evidence }))
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic))
    .slice(0, limit)
}
