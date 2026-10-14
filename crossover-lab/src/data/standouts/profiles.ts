import type { Athlete, League, Measured, MetricKey, Metrics, Recognition, SeasonLine, Source } from '../types'
import { METRICS } from '../metrics'
import { defaultGear, defaultKit, defaultMovement, NEUTRAL_COLORS } from '../defaults'
import { positionGroupFor, positionLabel } from '../positions'
import { findTeam } from '../teams'
import { RESEARCH, RESEARCH_RETRIEVED, type ResearchAthlete, type ResearchFact, type ResearchSource } from './research'

/**
 * Lightweight "standout" profiles built from the research log: only the sourced figures, with
 * the club's generic colours, a position-appropriate default kit and default motion (both
 * SIMULATED), and no likeness. Nothing here is estimated to fill gaps: a figure the research did
 * not find simply is not on the card.
 */

/** Body measurements keep the latest figure; performance metrics keep the best. */
const BODY: ReadonlySet<MetricKey> = new Set(['heightIn', 'weightLb', 'wingspanIn', 'standingReachIn', 'handSizeIn', 'armLengthIn', 'handLengthIn', 'handWidthIn', 'bodyFatPct', 'shoeSizeUs'])

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function yearOf(asOf: string): number | undefined {
  const m = /(\d{4})/.exec(asOf)
  return m ? Number(m[1]) : undefined
}

function better(key: MetricKey, a: ResearchFact, b: ResearchFact): ResearchFact {
  if (BODY.has(key)) return (yearOf(b.asOf) ?? 0) > (yearOf(a.asOf) ?? 0) ? b : a
  const hib = METRICS[key].higherIsBetter
  return (hib ? b.value > a.value : b.value < a.value) ? b : a
}

/** Draft round when the source states it, or when the pick number leaves no doubt. */
function draftRound(league: League, fact: ResearchFact): number | undefined {
  const stated = /round\s+(\d+)/i.exec(fact.context)
  if (stated) return Number(stated[1])
  if (league === 'NBA') return fact.value <= 28 ? 1 : fact.value >= 32 ? 2 : undefined
  return undefined
}

function teamName(text: string): string {
  return text.replace(/\s*\(.*\)\s*$/, '').trim()
}

export function standoutAthlete(r: ResearchAthlete): Athlete {
  const sources: Record<string, Source> = {}
  const sourceId = (s: ResearchSource) => {
    const existing = Object.values(sources).find((x) => x.url === s.url)
    if (existing) return existing.id
    const id = `${slug(s.publisher) || 'source'}-${Object.keys(sources).length + 1}`
    sources[id] = { id, title: s.title, publisher: s.publisher, url: s.url, ...(s.published ? { published: s.published } : {}), retrieved: RESEARCH_RETRIEVED }
    return id
  }
  const measured = (f: ResearchFact): Measured => {
    const id = sourceId(f.source)
    if (f.confirmedBy) sourceId(f.confirmedBy)
    return { value: f.value, quality: f.quality, sourceId: id, asOf: f.asOf, note: f.note, ...(f.rank ? { rank: f.rank } : {}) }
  }

  const byMetric = new Map<MetricKey, ResearchFact[]>()
  for (const f of r.facts) byMetric.set(f.metric, [...(byMetric.get(f.metric) ?? []), f])
  const metrics: Metrics = {}
  const seasons = new Map<number, SeasonLine>()
  const team = findTeam(r.league, teamName(r.team))
  for (const [key, facts] of byMetric) {
    const best = facts.reduce((a, b) => better(key, a, b))
    metrics[key] = measured(best)
    // Other years' figures become season lines, so history and "most improved" can use them.
    for (const f of facts) {
      if (f === best) continue
      const year = yearOf(f.asOf)
      if (year === undefined) continue
      const line = seasons.get(year) ?? { season: String(year), year, team: team?.fullName ?? teamName(r.team), metrics: {} }
      if (!line.metrics[key]) line.metrics[key] = measured(f)
      seasons.set(year, line)
    }
  }

  const recognition: Recognition = {}
  const pick = byMetric.get('draftPick')?.[0]
  if (pick) {
    recognition.draftPick = pick.value
    const y = yearOf(pick.asOf)
    if (y !== undefined) recognition.draftYear = y
    const round = draftRound(r.league, pick)
    if (round !== undefined) recognition.draftRound = round
  }
  if (r.undrafted) recognition.undrafted = true

  const group = positionGroupFor(r.league, r.position)
  const colors = team?.colors ?? NEUTRAL_COLORS
  const label = positionLabel(r.league, r.position.split('/')[0] ?? r.position)
  const highlights = r.facts.filter((f) => f.category !== 'bio' && f.metric !== 'draftPick').slice(0, 2)
  const describe = (f: ResearchFact) => `${formatValue(f.metric, f.value)} ${METRICS[f.metric].label.toLowerCase()} (${f.context.replace(/\s*\(.*\)$/, '')})`
  const where = r.status === 'legend' ? `Retired${r.era ? `; played in the ${r.era}` : ''}.` : `${team?.fullName ?? teamName(r.team)} ${label.toLowerCase()}.`
  const summary = `${where} ${highlights.length ? `On file: ${highlights.map(describe).join('; ')}.` : ''} Standout profile: only sourced figures, default kit, no likeness.`.replace(/\s+/g, ' ').trim()

  return {
    id: r.id,
    name: r.name,
    league: r.league,
    position: label,
    positionGroup: group,
    team: team?.fullName ?? teamName(r.team),
    ...(team ? { teamId: team.id } : {}),
    status: r.status,
    ...(r.era ? { era: r.era } : {}),
    profile: 'standout',
    appearance: { quality: 'SIMULATED', basis: 'No reference photos on file: neutral studio finish. Add photos or a licensed scan to change it.', hair: 'unset', facialHair: 'none' },
    ...(Object.keys(recognition).length ? { recognition } : {}),
    kit: defaultKit(r.league, colors, ''),
    metrics,
    seasons: [...seasons.values()].sort((a, b) => a.year - b.year),
    gear: defaultGear(r.league, group, colors, r.id),
    gearHistory: [{ season: 'Current', quality: 'SIMULATED', changes: ['Default kit for the position until reference photos are added.'] }],
    movement: defaultMovement(r.league, group),
    injuries: [],
    media: [],
    sources,
    summary,
    reviewed: RESEARCH_RETRIEVED,
  }
}

export function formatValue(key: MetricKey, value: number): string {
  const m = METRICS[key]
  return `${value.toFixed(m.decimals)}${m.unit ? ` ${m.unit}` : ''}`
}

/**
 * Research about athletes who already have a full profile: add the figures the profile lacks
 * (never overwrite a curated value) and their sources.
 */
export function enrich(a: Athlete, research: readonly ResearchAthlete[] = RESEARCH): Athlete {
  const r = research.find((x) => x.id === a.id)
  if (!r) return a
  const extra = standoutAthlete(r)
  const metrics = { ...a.metrics }
  const sources = { ...a.sources }
  for (const [key, m] of Object.entries(extra.metrics) as [MetricKey, Measured][]) {
    if (metrics[key]) continue
    metrics[key] = m
    if (m.sourceId && extra.sources[m.sourceId]) sources[m.sourceId] = extra.sources[m.sourceId]!
  }
  return { ...a, metrics, sources }
}

export function standoutProfiles(exclude: ReadonlySet<string>): Athlete[] {
  return RESEARCH.filter((r) => !exclude.has(r.id)).map(standoutAthlete)
}
