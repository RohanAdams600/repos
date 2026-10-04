export type SearchDocument = { href: string; title: string; description: string; section: string; keywords?: string }
export type SearchResult = SearchDocument & { score: number }

export const SEARCH_LIMITS = { minLength: 2, maxLength: 100, maxResults: 30 } as const

export function normalizeQuery(raw: string | undefined | null): string {
  return (raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_LIMITS.maxLength)
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
}

/** Title matches weigh most, then keywords, then description. Every query token must appear somewhere. */
export function scoreDocument(doc: SearchDocument, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const title = doc.title.toLowerCase()
  const keywords = (doc.keywords ?? '').toLowerCase()
  const description = doc.description.toLowerCase()
  let score = 0
  for (const token of tokens) {
    const inTitle = title.includes(token)
    const inKeywords = keywords.includes(token)
    const inDescription = description.includes(token)
    if (!inTitle && !inKeywords && !inDescription) return 0
    score += (inTitle ? 5 : 0) + (inKeywords ? 3 : 0) + (inDescription ? 1 : 0)
  }
  if (title.includes(tokens.join(' '))) score += 5
  return score
}

export function rankDocuments(docs: readonly SearchDocument[], query: string): SearchResult[] {
  const tokens = tokenize(query)
  return docs
    .map((doc) => ({ ...doc, score: scoreDocument(doc, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, SEARCH_LIMITS.maxResults)
}
