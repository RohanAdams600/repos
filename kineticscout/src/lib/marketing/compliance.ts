/**
 * Claims and policy checker for AI-generated marketing copy.
 *
 * Generated copy is never trusted. Every asset passes through these rules before it can be approved:
 * no guarantees or recruiting promises, no unsupported statistics or superlatives, no third-party
 * trademarks in paid ads, no fake urgency or fear-based framing, platform length limits, and the
 * KineticScout brand rules (no em dashes, no emojis in headlines).
 */

export type MarketingChannel = 'META_AD' | 'INSTAGRAM_POST' | 'FACEBOOK_POST' | 'X_POST'

export type DraftAsset = {
  channel: MarketingChannel
  topic: string
  region: string
  primaryText: string
  headline: string
  description: string
  callToAction: 'LEARN_MORE' | 'SIGN_UP' | 'SUBSCRIBE'
  hashtags: string[]
  feature: string
}

export type ComplianceIssue = { code: string; severity: 'block' | 'warn'; message: string }

export type ComplianceResult = { asset: DraftAsset; issues: ComplianceIssue[]; blocked: boolean }

const BLOCK_RULES: { code: string; pattern: RegExp; message: string; channels?: MarketingChannel[] }[] = [
  { code: 'GUARANTEE', pattern: /\bguarantee(d|s)?\b/i, message: 'Guarantees are not allowed.' },
  {
    code: 'RECRUITING_PROMISE',
    pattern: /\b(get|earn|land|win|secure|lock in)\s+(a\s+|an\s+|your\s+)?(full[- ]ride|scholarships?|offers?|roster spot)\b|\bget (you )?recruited\b|\bgo d1\b/i,
    message: 'Copy may not promise scholarships, offers or recruitment outcomes.',
  },
  {
    code: 'UNSUPPORTED_SUPERLATIVE',
    pattern: /#1\b|\bnumber one\b|\bmost accurate\b|\bthe best (app|platform|tool|way)\b|\bonly (app|platform|tool)\b|\bworld[- ]class\b|\brevolutionary\b/i,
    message: 'Superlatives that cannot be substantiated are not allowed.',
  },
  {
    code: 'FAKE_URGENCY',
    pattern: /\b(last chance|only today|ends tonight|act now|limited time|hurry|before it'?s too late)\b/i,
    message: 'Artificial urgency is a dark pattern and is not allowed.',
  },
  {
    code: 'THIRD_PARTY_TRADEMARK',
    pattern: /\b(perfect game|prep baseball( report)?|pbr|mlb|major league baseball|ncaa|baseball factory|five tool|espn|rapsodo|trackman|blast motion)\b/i,
    message: 'Paid ads may not reference third-party brands or trademarks.',
    channels: ['META_AD'],
  },
]

const WARN_RULES: { code: string; pattern: RegExp; message: string }[] = [
  {
    code: 'FEAR_FRAMING',
    pattern: /\b(not good enough|falling behind|left behind|wasting your (time|talent)|don'?t get cut)\b/i,
    message: 'Fear-based framing needs human review.',
  },
  {
    code: 'TRADEMARK_MENTION',
    pattern: /\b(perfect game|prep baseball( report)?|pbr|mlb|major league baseball|ncaa|espn)\b/i,
    message: 'Mentions a third-party brand; confirm the use is descriptive and accurate.',
  },
]

const LIMITS: Record<MarketingChannel, { primaryWarn: number; primaryMax: number; headlineWarn?: number; descriptionWarn?: number }> = {
  META_AD: { primaryWarn: 125, primaryMax: 500, headlineWarn: 40, descriptionWarn: 30 },
  FACEBOOK_POST: { primaryWarn: 400, primaryMax: 2000 },
  INSTAGRAM_POST: { primaryWarn: 1000, primaryMax: 2200 },
  X_POST: { primaryWarn: 280, primaryMax: 280 },
}

// Emoji and pictographs (headlines must not contain them).
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu

/** Replaces em and en dashes used as punctuation with commas, per the brand style guide. */
export function stripEmDashes(text: string): string {
  return text
    .replace(/\s*[—―]\s*/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    .replace(/,\s*,/g, ',')
}

/** Numbers that copy may contain: published prices, the free-tier limit, and graduating class years. */
export function allowedNumbers(now: Date): Set<string> {
  const year = now.getUTCFullYear()
  const set = new Set(['14.99', '129', '3'])
  for (let y = year; y <= year + 6; y++) set.add(String(y))
  return set
}

export function checkAsset(input: DraftAsset, now: Date = new Date()): ComplianceResult {
  const issues: ComplianceIssue[] = []
  const hashtags = [...new Set(input.hashtags.map((h) => `#${h.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, '')}`).filter((h) => h.length > 2))]
  const asset: DraftAsset = {
    ...input,
    primaryText: stripEmDashes(input.primaryText.trim()),
    headline: stripEmDashes(input.headline.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim()),
    description: stripEmDashes(input.description.replace(EMOJI, '').trim()),
    hashtags: hashtags.slice(0, 5),
  }
  if (input.headline.match(EMOJI)) issues.push({ code: 'EMOJI_IN_HEADLINE', severity: 'warn', message: 'Emoji removed from headline.' })
  if (hashtags.length > 5) issues.push({ code: 'HASHTAG_LIMIT', severity: 'warn', message: 'Trimmed to 5 hashtags.' })

  const fullText = [asset.primaryText, asset.headline, asset.description].join('\n')

  for (const rule of BLOCK_RULES) {
    if (rule.channels && !rule.channels.includes(asset.channel)) continue
    if (rule.pattern.test(fullText)) issues.push({ code: rule.code, severity: 'block', message: rule.message })
  }
  for (const rule of WARN_RULES) {
    if (rule.code === 'TRADEMARK_MENTION' && asset.channel === 'META_AD') continue
    if (rule.pattern.test(fullText)) issues.push({ code: rule.code, severity: 'warn', message: rule.message })
  }

  const allowed = allowedNumbers(now)
  const numbers = fullText.match(/\d+(?:[.,]\d+)?/g) ?? []
  const unapproved = numbers.filter((n) => !allowed.has(n.replace(',', '')))
  if (unapproved.length > 0 || /\d\s?%|\b\d+x\b/i.test(fullText)) {
    issues.push({
      code: 'UNSUPPORTED_NUMBER',
      severity: 'block',
      message: `Numbers must come from approved facts (prices, free-tier limit, class years). Found: ${[...new Set(unapproved)].join(', ') || 'percentage or multiplier'}.`,
    })
  }

  const limits = LIMITS[asset.channel]
  const primaryLength = asset.channel === 'X_POST' ? `${asset.primaryText} ${asset.hashtags.join(' ')}`.trim().length : asset.primaryText.length
  if (primaryLength > limits.primaryMax) {
    issues.push({ code: 'TOO_LONG', severity: 'block', message: `Text is ${primaryLength} characters; the limit is ${limits.primaryMax}.` })
  } else if (primaryLength > limits.primaryWarn) {
    issues.push({ code: 'LONG_TEXT', severity: 'warn', message: `Text is ${primaryLength} characters and may be truncated after ${limits.primaryWarn}.` })
  }
  if (asset.channel === 'META_AD') {
    if (!asset.headline) issues.push({ code: 'MISSING_HEADLINE', severity: 'block', message: 'Ads need a headline.' })
    if (limits.headlineWarn && asset.headline.length > limits.headlineWarn) {
      issues.push({ code: 'LONG_HEADLINE', severity: 'warn', message: `Headline over ${limits.headlineWarn} characters may be truncated.` })
    }
    if (limits.descriptionWarn && asset.description.length > limits.descriptionWarn) {
      issues.push({ code: 'LONG_DESCRIPTION', severity: 'warn', message: `Description over ${limits.descriptionWarn} characters may be truncated.` })
    }
  }
  if (!asset.primaryText) issues.push({ code: 'EMPTY', severity: 'block', message: 'Primary text is empty.' })

  return { asset, issues, blocked: issues.some((i) => i.severity === 'block') }
}
