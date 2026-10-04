/** UTM tagging for outbound campaign links and parsing for first-touch attribution. */

export type UtmParams = {
  source: string
  medium: string
  campaign: string
  content?: string
  term?: string
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
const SAFE_VALUE = /^[a-z0-9._-]{1,64}$/

function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function withUtm(baseUrl: string, params: UtmParams): string {
  const url = new URL(baseUrl)
  url.searchParams.set('utm_source', normalize(params.source))
  url.searchParams.set('utm_medium', normalize(params.medium))
  url.searchParams.set('utm_campaign', normalize(params.campaign))
  if (params.content) url.searchParams.set('utm_content', normalize(params.content))
  if (params.term) url.searchParams.set('utm_term', normalize(params.term))
  return url.toString()
}

/** Extracts UTM values from a query string, discarding anything that is not a short slug. */
export function parseUtm(search: URLSearchParams): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {}
  for (const key of UTM_KEYS) {
    const raw = search.get(key)
    if (!raw) continue
    const value = normalize(raw)
    if (SAFE_VALUE.test(value)) out[key] = value
  }
  return out
}
