import type { Athlete, League, Measured, MetricKey, Quality, SeasonLine } from './types'
import { weakest } from './types'

/** Regular-season length, used to turn games played into availability. */
export function seasonLength(league: League, year: number): number {
  if (league === 'NFL') return year >= 2021 ? 17 : 16
  if (league === 'MLB') return year === 2020 ? 60 : 162
  return year === 2020 ? 72 : 82
}

export function latestSeason(a: Athlete): SeasonLine | undefined {
  return [...a.seasons].sort((x, y) => y.year - x.year)[0]
}

export function seasonByYear(a: Athlete, year: number): SeasonLine | undefined {
  return a.seasons.find((s) => s.year === year)
}

/**
 * The value of a metric for an athlete, optionally as of a season. A season's own figures win;
 * otherwise the profile's current figure is used; production stats fall back to the latest
 * season that has them. Some keys are derived (yards per carry, availability).
 */
export function resolveMetric(a: Athlete, key: MetricKey, year?: number): Measured | undefined {
  const season = year !== undefined ? seasonByYear(a, year) : undefined

  if (key === 'rushYardsPerCarry') {
    const s = season ?? latestWith(a, 'carries')
    const yards = s?.metrics.rushYards
    const carries = s?.metrics.carries
    if (yards && carries && carries.value > 0) {
      return { value: yards.value / carries.value, quality: weakest(yards.quality, carries.quality), sourceId: yards.sourceId, asOf: s.season, note: `${s.season}: rushing yards divided by carries.` }
    }
    return a.metrics.rushYardsPerCarry
  }

  if (key === 'gamesPlayedPct') {
    const lines = season ? [season] : recentWithGames(a, 3)
    if (lines.length === 0) return a.metrics.gamesPlayedPct
    let played = 0
    let possible = 0
    const qualities: Quality[] = []
    for (const s of lines) {
      if (!s.games) continue
      played += s.games.value
      possible += seasonLength(a.league, s.year)
      qualities.push(s.games.quality)
    }
    if (possible === 0) return a.metrics.gamesPlayedPct
    const label = lines.map((s) => s.season).join(', ')
    return { value: (100 * played) / possible, quality: weakest(...qualities), note: `Games played over regular-season games, ${label}.` }
  }

  const own = season?.metrics[key]
  if (own) return own
  if (season) {
    // A past season without its own figure uses the current profile only for body and testing
    // data, never for production stats from another year.
    if (PRODUCTION.has(key)) return undefined
    return a.metrics[key]
  }
  const current = a.metrics[key]
  if (current) return current
  if (PRODUCTION.has(key)) return latestWith(a, key)?.metrics[key]
  return undefined
}

export function value(a: Athlete, key: MetricKey, year?: number): number | undefined {
  return resolveMetric(a, key, year)?.value
}

function latestWith(a: Athlete, key: MetricKey): SeasonLine | undefined {
  return [...a.seasons].sort((x, y) => y.year - x.year).find((s) => s.metrics[key] !== undefined)
}

function recentWithGames(a: Athlete, n: number): SeasonLine[] {
  return [...a.seasons]
    .filter((s) => s.games)
    .sort((x, y) => y.year - x.year)
    .slice(0, n)
}

const PRODUCTION = new Set<MetricKey>([
  'rushYards',
  'rushTd',
  'carries',
  'receptions',
  'receivingYards',
  'battingAvg',
  'onBasePct',
  'sluggingPct',
  'homeRuns',
  'stolenBases',
  'pointsPerGame',
  'threePointPct',
  'freeThrowPct',
  'pitchingEra',
  'pitchingStrikeoutPer9',
  'walksPer9',
])
