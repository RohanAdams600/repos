/**
 * Fact checking for AI-drafted articles. An article may only contain numbers that appear in its
 * data snapshot (or structural numbers such as percentile labels and class years). Anything else is
 * treated as a possible hallucination and the article is held as a draft for human review.
 */

export type FactCheckReport = {
  ok: boolean
  unknownNumbers: string[]
  bannedPhrases: string[]
  containsHtml: boolean
  externalLinks: string[]
}

const BANNED: { label: string; pattern: RegExp }[] = [
  { label: 'guarantee', pattern: /\bguarantee(d|s)?\b/i },
  { label: 'recruiting promise', pattern: /\b(will|can) (get|earn|land) (you )?(a )?(scholarship|offer|recruited)\b/i },
  { label: 'unsupported superlative', pattern: /\b(most accurate|the best app|#1)\b/i },
]

export function normalizeNumber(raw: string): string {
  const cleaned = raw.replace(/,/g, '')
  if (!cleaned.includes('.')) return String(Number(cleaned))
  return String(Number(cleaned))
}

/** Every number in the text, normalised (thousands separators removed, trailing zeros dropped). */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).map(normalizeNumber)
}

/** Builds the allow-list from a data snapshot: every number present, plus whole-number roundings. */
export function allowedNumbersFrom(snapshot: unknown, extra: readonly (number | string)[] = []): Set<string> {
  const allowed = new Set<string>()
  const add = (value: number) => {
    allowed.add(normalizeNumber(String(value)))
    allowed.add(String(Math.round(value)))
    allowed.add(normalizeNumber(value.toFixed(1)))
    allowed.add(normalizeNumber(value.toFixed(2)))
  }
  const walk = (node: unknown) => {
    if (typeof node === 'number' && Number.isFinite(node)) add(node)
    else if (typeof node === 'string') for (const n of extractNumbers(node)) allowed.add(n)
    else if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(snapshot)
  for (const value of extra) allowed.add(normalizeNumber(String(value)))
  // Percentile labels used in prose ("the 75th percentile").
  for (const label of [10, 25, 50, 75, 90, 100]) allowed.add(String(label))
  return allowed
}

export function factCheck(markdown: string, allowed: Set<string>, siteOrigin: string): FactCheckReport {
  const unknownNumbers = [...new Set(extractNumbers(markdown).filter((n) => !allowed.has(n)))]
  const bannedPhrases = BANNED.filter((b) => b.pattern.test(markdown)).map((b) => b.label)
  const containsHtml = /<\s*[a-z!/]/i.test(markdown)
  const externalLinks = [...markdown.matchAll(/\]\((\S+?)\)/g)]
    .map((m) => m[1]!)
    .filter((href) => !href.startsWith('/') && !href.startsWith(siteOrigin))
  return {
    ok: unknownNumbers.length === 0 && bannedPhrases.length === 0 && !containsHtml && externalLinks.length === 0,
    unknownNumbers,
    bannedPhrases,
    containsHtml,
    externalLinks,
  }
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
