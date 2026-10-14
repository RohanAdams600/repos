import type { Athlete, League, Measured, MetricKey, Metrics, RosterStatus, Source } from './types'
import { METRICS } from './metrics'
import { positionGroupFor } from './positions'
import { findTeam, type Team } from './teams'
import { defaultGear, defaultKit, defaultMovement, NEUTRAL_COLORS, type Hands } from './defaults'

/**
 * Roster import: CSV text (or rows from any feed) to complete Athlete objects with profile
 * 'roster'. Nothing here throws on bad input: each problem becomes a row error and that row is
 * skipped, so one bad line never blocks the rest of a file.
 *
 * Quality rule: a figure is VERIFIED only when the provider is licensed and the row cites a
 * source URL; everything else is ESTIMATED with a note naming the provider.
 */
export type RosterRow = Record<string, string>

export interface ImportOptions {
  /** Who supplied the file or feed, e.g. "Team media guide CSV". Named in every note. */
  provider: string
  /** True only for a licensed feed whose figures may be shown as verified. */
  licensed: boolean
  /** Date the rows were retrieved (ISO yyyy-mm-dd). */
  retrieved: string
}

export interface RowError {
  /** 1-based position in the rows passed in (the first data row after the header is 1). 0 = the whole file. */
  row: number
  message: string
}

export interface ImportResult {
  athletes: Athlete[]
  errors: RowError[]
  /** Header names that matched no known column, in first-seen order. Their values are not imported. */
  ignoredColumns: string[]
}

/** Display labels for every roster status, which doubles as the runtime list of valid ones. */
export const ROSTER_STATUS_LABEL: Record<RosterStatus, string> = {
  active: 'Active',
  'practice-squad': 'Practice squad',
  'two-way': 'Two-way contract',
  'ten-day': '10-day contract',
  'injured-reserve': 'Injured reserve',
  'free-agent': 'Free agent',
  legend: 'Legend',
  prospect: 'Prospect',
  rookie: 'Rookie',
}

export const ROSTER_STATUSES = Object.keys(ROSTER_STATUS_LABEL) as RosterStatus[]

/** Statuses that may leave the team blank: nobody signed them, or they retired. */
const TEAMLESS: ReadonlySet<RosterStatus> = new Set<RosterStatus>(['free-agent', 'legend', 'prospect'])

const STATUS_ALIASES: Record<string, RosterStatus> = { ir: 'injured-reserve', '10-day': 'ten-day', fa: 'free-agent', ps: 'practice-squad' }

const LEAGUES: League[] = ['NFL', 'MLB', 'NBA']
const EXAMPLE_ABBR: Record<League, string> = { NFL: 'IND', MLB: 'LAD', NBA: 'CLE' }

type CoreColumn = 'name' | 'league' | 'team' | 'position' | 'status' | 'number' | 'bats' | 'throws' | 'era' | 'sourceUrl'
const CORE: CoreColumn[] = ['name', 'league', 'team', 'position', 'status', 'number', 'bats', 'throws', 'era', 'sourceUrl']
export const REQUIRED_COLUMNS: readonly CoreColumn[] = ['name', 'league', 'team', 'position', 'status']

/** A few header spellings common in exported roster files. */
const HEADER_ALIASES: Record<string, CoreColumn> = { player: 'name', pos: 'position', jersey: 'number', jerseynumber: 'number', no: 'number', url: 'sourceUrl', teamabbr: 'team' }

/** Body lengths that roster files often give in feet and inches ("6-2", 6'2"). */
const FEET_INCH_KEYS: ReadonlySet<MetricKey> = new Set<MetricKey>(['heightIn', 'wingspanIn', 'standingReachIn'])

type Column = { kind: 'core'; key: CoreColumn } | { kind: 'metric'; key: MetricKey }

/** Headers match case-insensitively and ignore spaces and punctuation: "Source URL" = sourceUrl. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const COLUMNS = new Map<string, Column>([
  ...CORE.map((key): [string, Column] => [normHeader(key), { kind: 'core', key }]),
  ...Object.entries(HEADER_ALIASES).map(([alias, key]): [string, Column] => [alias, { kind: 'core', key }]),
  ...(Object.keys(METRICS) as MetricKey[]).map((key): [string, Column] => [normHeader(key), { kind: 'metric', key }]),
])

/**
 * RFC 4180 CSV to rows keyed by the trimmed header names. Handles quoted fields with commas,
 * doubled quotes and line breaks, CRLF or LF line ends, and a leading byte-order mark. Lenient
 * rather than strict: a stray quote mid-field is kept as text, an unclosed quote runs to the end
 * of the file, short rows are padded with '' and extra cells are dropped. Empty lines are skipped.
 */
export function parseCsv(text: string): RosterRow[] {
  const records = parseRecords(text.replace(/^﻿/, ''))
  const header = records.shift()
  if (!header) return []
  const keys = header.map((h) => h.trim())
  const rows: RosterRow[] = []
  for (const rec of records) {
    if (rec.length === 1 && rec[0] === '') continue
    const row: RosterRow = {}
    keys.forEach((k, i) => {
      if (k && !(k in row)) row[k] = rec[i] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function parseRecords(text: string): string[][] {
  const out: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let atFieldStart = true
  let dirty = false
  const endField = (): void => {
    record.push(field)
    field = ''
    atFieldStart = true
  }
  const endRecord = (): void => {
    endField()
    out.push(record)
    record = []
    dirty = false
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && atFieldStart) {
      quoted = true
      atFieldStart = false
      dirty = true
    } else if (ch === ',') {
      endField()
      dirty = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
    } else {
      field += ch
      atFieldStart = false
      dirty = true
    }
  }
  if (dirty || field !== '') endRecord()
  return out
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** FNV-1a, for an id when a name has no Latin letters to slug. */
function hash36(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function parseLeague(raw: string): League | undefined {
  return LEAGUES.find((l) => l === raw.trim().toUpperCase())
}

function parseStatus(raw: string): RosterStatus | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (key in ROSTER_STATUS_LABEL) return key as RosterStatus
  return STATUS_ALIASES[key]
}

function parseHand<T extends string>(raw: string, allowed: Record<string, T>): T | undefined {
  return allowed[raw.trim().toUpperCase()]
}

const BATS: Record<string, 'L' | 'R' | 'S'> = { L: 'L', R: 'R', S: 'S', B: 'S', LEFT: 'L', RIGHT: 'R', SWITCH: 'S', BOTH: 'S' }
const THROWS: Record<string, 'L' | 'R'> = { L: 'L', R: 'R', LEFT: 'L', RIGHT: 'R' }

const PLAIN_NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/
const THOUSANDS = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/
const FEET_INCHES = /^(\d)\s*(?:'|-|ft)\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|''|in)?$/

/**
 * A metric cell in the key's own unit. Accepts plain decimals, thousands separators ("1,811"),
 * a trailing % on percentage keys, and feet-inches on body lengths. Anything else is undefined.
 */
export function parseMetricValue(key: MetricKey, raw: string): number | undefined {
  let text = raw.trim()
  if (FEET_INCH_KEYS.has(key)) {
    const m = FEET_INCHES.exec(text)
    if (m) {
      const inches = Number(m[2])
      return inches < 12 ? Number(m[1]) * 12 + inches : undefined
    }
  }
  if (METRICS[key].unit === '%' && text.endsWith('%')) text = text.slice(0, -1).trim()
  if (THOUSANDS.test(text)) text = text.replace(/,/g, '')
  if (!PLAIN_NUMBER.test(text)) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

/** Trimmed cell text. Feeds that hand over numbers or nulls despite the type are coerced, not thrown on. */
function cell(row: RosterRow, header: string): string {
  const v: unknown = row[header]
  return v === undefined || v === null ? '' : String(v).trim()
}

function isHttpsUrl(text: string): boolean {
  try {
    const u = new URL(text)
    return u.protocol === 'https:' && u.hostname !== ''
  } catch {
    return false
  }
}

interface Layout {
  core: Partial<Record<CoreColumn, string>>
  metrics: { key: MetricKey; header: string }[]
  ignored: string[]
}

/** Maps header names to columns. When two headers mean the same column, the first one wins. */
function layout(rows: RosterRow[]): Layout {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const h of Object.keys(row)) {
      if (!seen.has(h)) {
        seen.add(h)
        headers.push(h)
      }
    }
  }
  const out: Layout = { core: {}, metrics: [], ignored: [] }
  const claimed = new Set<string>()
  for (const h of headers) {
    const col = COLUMNS.get(normHeader(h))
    const id = col ? `${col.kind}:${col.key}` : ''
    if (!col || claimed.has(id)) {
      if (h.trim() !== '') out.ignored.push(h)
      continue
    }
    claimed.add(id)
    if (col.kind === 'core') out.core[col.key] = h
    else out.metrics.push({ key: col.key, header: h })
  }
  return out
}

/**
 * Builds complete roster athletes from rows. Required columns: name, league (NFL/MLB/NBA), team
 * (club abbreviation; blank only for free agents, legends and prospects), position and status.
 * Optional: number, bats, throws, era, sourceUrl (https) and any MetricKey column. Kit colors
 * come from the club, gear and movement from the position defaults, and every figure cites a
 * source entry for the provider. Ids are '<team id>-<name slug>' ('<league>-<name slug>' without
 * a club); a repeated id is a row error.
 */
export function importRoster(rows: RosterRow[], opts: ImportOptions): ImportResult {
  const errors: RowError[] = []
  const athletes: Athlete[] = []
  const cols = layout(rows)
  const result = (): ImportResult => ({ athletes, errors, ignoredColumns: cols.ignored })

  const provider = opts.provider.trim()
  if (!provider) errors.push({ row: 0, message: 'Name the provider of this file or feed; every imported figure cites it.' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.retrieved)) errors.push({ row: 0, message: `Retrieved date "${opts.retrieved}" must be an ISO date (yyyy-mm-dd).` })
  if (rows.length > 0) {
    for (const c of REQUIRED_COLUMNS) if (!cols.core[c]) errors.push({ row: 0, message: `Missing required column "${c}".` })
  }
  if (errors.length > 0) return result()

  const firstRow = new Map<string, number>()
  rows.forEach((row, index) => {
    const n = index + 1
    if (Object.keys(row).every((h) => cell(row, h) === '')) return
    const built = buildAthlete(row, cols, provider, opts)
    if ('errors' in built) {
      for (const message of built.errors) errors.push({ row: n, message })
      return
    }
    const earlier = firstRow.get(built.athlete.id)
    if (earlier !== undefined) {
      errors.push({ row: n, message: `Duplicate of row ${earlier}: same name, league and team.` })
      return
    }
    firstRow.set(built.athlete.id, n)
    athletes.push(built.athlete)
  })
  return result()
}

function buildAthlete(row: RosterRow, cols: Layout, provider: string, opts: ImportOptions): { athlete: Athlete } | { errors: string[] } {
  const problems: string[] = []
  const get = (c: CoreColumn): string => {
    const h = cols.core[c]
    return h === undefined ? '' : cell(row, h)
  }

  const name = get('name')
  if (!name) problems.push('Missing name.')
  const position = get('position')
  if (!position) problems.push('Missing position.')

  const leagueRaw = get('league')
  const league = parseLeague(leagueRaw)
  if (!league) problems.push(leagueRaw ? `Unknown league "${leagueRaw}". Use NFL, MLB or NBA.` : 'Missing league.')

  const statusRaw = get('status')
  const status = parseStatus(statusRaw)
  if (!status) problems.push(statusRaw ? `Unknown status "${statusRaw}". Use one of: ${ROSTER_STATUSES.join(', ')}.` : 'Missing status.')

  const teamRaw = get('team')
  let team: Team | undefined
  if (league) {
    if (teamRaw) {
      team = findTeam(league, teamRaw)
      if (!team) problems.push(`Unknown ${league} team "${teamRaw}". Use the club abbreviation (e.g. ${EXAMPLE_ABBR[league]}).`)
    } else if (status && !TEAMLESS.has(status)) {
      problems.push(`Missing team. Only free agents, legends and prospects may leave it blank.`)
    }
  }

  const number = get('number')
  if (number && !/^\d{1,2}$/.test(number)) problems.push(`Number "${number}" must be one or two digits.`)

  const batsRaw = get('bats')
  const bats = batsRaw ? parseHand(batsRaw, BATS) : undefined
  if (batsRaw && !bats) problems.push(`Bats "${batsRaw}" must be L, R or S.`)
  const throwsRaw = get('throws')
  const throws = throwsRaw ? parseHand(throwsRaw, THROWS) : undefined
  if (throwsRaw && !throws) problems.push(`Throws "${throwsRaw}" must be L or R.`)

  const era = get('era')
  if (era && /^\d*\.?\d+$/.test(era) && Number(era) < 1000) {
    problems.push(`Era "${era}" looks like a statistic. The era column is the decade(s) played (e.g. "1990s"); earned run average goes in pitchingEra.`)
  }

  const sourceUrl = get('sourceUrl')
  if (sourceUrl && !isHttpsUrl(sourceUrl)) problems.push(`sourceUrl "${sourceUrl}" must be a full https:// address.`)

  const values: [MetricKey, number][] = []
  for (const { key, header } of cols.metrics) {
    const raw = cell(row, header)
    if (!raw) continue
    const value = parseMetricValue(key, raw)
    if (value === undefined) problems.push(`${header} (${METRICS[key].label}) must be a number; got "${raw}".`)
    else values.push([key, value])
  }

  if (problems.length > 0 || !league || !status) return { errors: problems }

  const id = `${team ? team.id : league.toLowerCase()}-${slug(name) || hash36(name)}`
  const sourceId = `roster-${slug(provider) || hash36(provider)}`
  const source: Source = {
    id: sourceId,
    title: sourceUrl ? `${name}: ${provider} player page` : `${provider} roster`,
    publisher: provider,
    ...(sourceUrl ? { url: sourceUrl } : {}),
    retrieved: opts.retrieved,
  }
  const verified = opts.licensed && sourceUrl !== ''
  const note = opts.licensed
    ? `From the licensed ${provider} feed, but the row cites no source URL, so it is not marked verified.`
    : `From the ${provider} roster file (unlicensed import); not cross-checked against a cited source.`
  const metrics: Metrics = {}
  for (const [key, value] of values) {
    const m: Measured = verified ? { value, quality: 'VERIFIED', sourceId } : { value, quality: 'ESTIMATED', sourceId, note }
    metrics[key] = m
  }

  const group = positionGroupFor(league, position)
  const hands: Hands = { ...(bats ? { bats } : {}), ...(throws ? { throws } : {}) }
  const colors = team?.colors ?? NEUTRAL_COLORS
  const teamName = team?.fullName ?? ROSTER_STATUS_LABEL[status]

  const athlete: Athlete = {
    id,
    name,
    league,
    position,
    positionGroup: group,
    team: teamName,
    ...(team ? { teamId: team.id } : {}),
    status,
    ...(era ? { era } : {}),
    profile: 'roster',
    appearance: { quality: 'SIMULATED', basis: 'No reference photos supplied yet. Neutral studio finish until they are.', hair: 'unset', facialHair: 'none' },
    ...hands,
    kit: defaultKit(league, colors, number),
    metrics,
    seasons: [],
    gear: defaultGear(league, group, colors, id, hands),
    gearHistory: [{ season: 'Current', quality: 'SIMULATED', changes: ['Default kit for the position. Add reference photos to record what the athlete actually wears.'] }],
    movement: defaultMovement(league, group, hands),
    injuries: [],
    media: [],
    sources: { [sourceId]: source },
    summary: `${position}, ${teamName}${era ? ` (${era})` : ''}. Imported from ${provider} on ${opts.retrieved}; kit and movement are position defaults.`,
    reviewed: opts.retrieved,
  }
  return { athlete }
}
