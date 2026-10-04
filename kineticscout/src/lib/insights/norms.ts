import { K_MIN, type BuildInput } from '@/lib/insights/build-cohort'
import { METRIC_DEFINITIONS, METRIC_TYPES, metricDbValue, type MetricType } from '@/lib/metrics/definitions'
import { percentileRank, type Quantiles } from '@/lib/metrics/percentile'

/**
 * National norms, pure parts: reading a licensed norm table from CSV, checking it, and finding the
 * band that covers an athlete.
 *
 * A norm table gives raw-value quantiles per metric for bands of age, height and weight, as the
 * publisher measured them. Bands may nest (an age-only row and narrower age-and-height rows inside
 * it); the narrowest band that covers the athlete is used. Bands that partly overlap would make the
 * answer depend on row order, so an import containing them is refused.
 */

/** Inclusive integer range; null means the band covers every value of that dimension. */
export type Band = { min: number; max: number } | null

export type NormBand = { metricType: MetricType; age: Band; height: Band; weight: Band }
export type NormRowInput = NormBand & { sampleSize: number; quantiles: Quantiles }
export type ParsedNormRow = NormRowInput & { line: number }
export type NormIssue = { line: number; message: string }

export const NORM_CSV_COLUMNS = ['metric', 'age_min', 'age_max', 'height_min', 'height_max', 'weight_min', 'weight_max', 'sample_size', 'p10', 'p25', 'p50', 'p75', 'p90'] as const
export const NORM_IMPORT_LIMITS = { maxRows: 5_000, maxBytes: 1_000_000, maxIssues: 50 } as const

const DIMENSION_RANGES = {
  age: { min: 12, max: 25, unit: 'years' },
  height: { min: 48, max: 90, unit: 'in' },
  weight: { min: 70, max: 400, unit: 'lb' },
} as const
type Dimension = keyof typeof DIMENSION_RANGES
const DIMENSIONS = Object.keys(DIMENSION_RANGES) as Dimension[]
const QUANTILE_KEYS = ['p10', 'p25', 'p50', 'p75', 'p90'] as const

const METRIC_ALIASES = new Map<string, MetricType>(METRIC_TYPES.flatMap((t) => [[t.toLowerCase(), t] as const, [metricDbValue(t).toLowerCase(), t] as const]))

/** Splits one CSV line, honouring double quotes and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out.map((f) => f.trim())
}

function parseBand(dim: Dimension, minText: string, maxText: string, issue: (m: string) => void): Band | undefined {
  if (minText === '' && maxText === '') return null
  if (minText === '' || maxText === '') {
    issue(`Give both ${dim}_min and ${dim}_max, or leave both empty for any ${dim}.`)
    return undefined
  }
  const min = Number(minText)
  const max = Number(maxText)
  const range = DIMENSION_RANGES[dim]
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    issue(`${dim} bounds must be whole numbers (${range.unit}).`)
    return undefined
  }
  if (min < range.min || max > range.max) {
    issue(`${dim} must be between ${range.min} and ${range.max} ${range.unit}.`)
    return undefined
  }
  if (min > max) {
    issue(`${dim}_min is larger than ${dim}_max.`)
    return undefined
  }
  return { min, max }
}

/**
 * Parses and checks a norm table. Every problem is reported with its line number (up to
 * NORM_IMPORT_LIMITS.maxIssues); rows are returned only when there are no problems at all.
 */
export function parseNormCsv(text: string): { rows: ParsedNormRow[]; issues: NormIssue[] } {
  const issues: NormIssue[] = []
  const add = (line: number, message: string) => {
    if (issues.length < NORM_IMPORT_LIMITS.maxIssues) issues.push({ line, message })
  }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  let headerLine = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (t !== '' && !t.startsWith('#')) {
      headerLine = i
      break
    }
  }
  if (headerLine < 0) return { rows: [], issues: [{ line: 1, message: 'The file is empty.' }] }

  const header = splitCsvLine(lines[headerLine]!).map((h) => h.toLowerCase())
  const index = new Map(header.map((h, i) => [h, i]))
  const missing = NORM_CSV_COLUMNS.filter((c) => !index.has(c))
  const unknown = header.filter((h) => !(NORM_CSV_COLUMNS as readonly string[]).includes(h))
  if (missing.length || unknown.length) {
    if (missing.length) add(headerLine + 1, `Missing column(s): ${missing.join(', ')}.`)
    if (unknown.length) add(headerLine + 1, `Unknown column(s): ${unknown.join(', ')}.`)
    return { rows: [], issues }
  }

  const rows: ParsedNormRow[] = []
  let dataRows = 0
  for (let i = headerLine + 1; i < lines.length; i++) {
    const raw = lines[i]!.trim()
    if (raw === '' || raw.startsWith('#')) continue
    const line = i + 1
    dataRows++
    if (dataRows > NORM_IMPORT_LIMITS.maxRows) {
      add(line, `A table can have at most ${NORM_IMPORT_LIMITS.maxRows} rows. Split it into several datasets.`)
      break
    }
    const cells = splitCsvLine(raw)
    const cell = (c: (typeof NORM_CSV_COLUMNS)[number]) => cells[index.get(c)!] ?? ''
    let ok = true
    const issue = (m: string) => {
      ok = false
      add(line, m)
    }

    const metricType = METRIC_ALIASES.get(cell('metric').toLowerCase())
    if (!metricType) issue(`Unknown metric "${cell('metric')}". Use one of: ${METRIC_TYPES.join(', ')}.`)
    const bands = Object.fromEntries(DIMENSIONS.map((d) => [d, parseBand(d, cell(`${d}_min`), cell(`${d}_max`), issue)])) as Record<Dimension, Band | undefined>

    const sampleSize = Number(cell('sample_size'))
    if (!Number.isInteger(sampleSize) || sampleSize < K_MIN) issue(`sample_size must be a whole number of at least ${K_MIN}.`)

    const q = Object.fromEntries(QUANTILE_KEYS.map((k) => [k, cell(k) === '' ? Number.NaN : Number(cell(k))])) as Quantiles
    if (QUANTILE_KEYS.some((k) => !Number.isFinite(q[k]))) issue('p10, p25, p50, p75 and p90 must all be numbers.')
    else {
      for (let k = 1; k < QUANTILE_KEYS.length; k++) {
        if (q[QUANTILE_KEYS[k]!] < q[QUANTILE_KEYS[k - 1]!]) {
          issue(`${QUANTILE_KEYS[k - 1]} is larger than ${QUANTILE_KEYS[k]}. Quantiles are raw values in ascending order (for timed events p10 is the fast end).`)
          break
        }
      }
      if (metricType) {
        const def = METRIC_DEFINITIONS[metricType]
        if (QUANTILE_KEYS.some((k) => q[k] < def.min || q[k] > def.max)) issue(`${def.label} values must be between ${def.min} and ${def.max} ${def.unit}.`)
      }
    }

    if (ok && metricType && DIMENSIONS.every((d) => bands[d] !== undefined)) {
      rows.push({ line, metricType, age: bands.age!, height: bands.height!, weight: bands.weight!, sampleSize, quantiles: q })
    }
  }
  if (dataRows === 0) add(headerLine + 1, 'The file has a header but no rows.')
  if (issues.length === 0) for (const overlap of findBandConflicts(rows)) add(overlap.line, overlap.message)
  return issues.length ? { rows: [], issues } : { rows, issues }
}

type Relation = 'equal' | 'inside' | 'contains' | 'disjoint' | 'partial'

function relate(a: Band, b: Band): Relation {
  const [aMin, aMax] = a ? [a.min, a.max] : [-Infinity, Infinity]
  const [bMin, bMax] = b ? [b.min, b.max] : [-Infinity, Infinity]
  if (aMax < bMin || bMax < aMin) return 'disjoint'
  if (aMin === bMin && aMax === bMax) return 'equal'
  if (aMin >= bMin && aMax <= bMax) return 'inside'
  if (bMin >= aMin && bMax <= aMax) return 'contains'
  return 'partial'
}

/**
 * Rows for the same metric must be disjoint or strictly nested in every dimension. Two identical
 * bands, or bands that partly overlap, are reported against the later row.
 */
export function findBandConflicts(rows: readonly ParsedNormRow[]): NormIssue[] {
  const issues: NormIssue[] = []
  const byMetric = new Map<MetricType, ParsedNormRow[]>()
  for (const r of rows) byMetric.set(r.metricType, [...(byMetric.get(r.metricType) ?? []), r])
  for (const group of byMetric.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = group[i]!
        const b = group[j]!
        const relations = DIMENSIONS.map((d) => relate(a[d], b[d]))
        if (relations.includes('disjoint')) continue
        if (relations.every((r) => r === 'equal')) {
          issues.push({ line: a.line, message: `Same metric and band as line ${b.line}.` })
          continue
        }
        const nested = relations.every((r) => r === 'equal' || r === 'inside') || relations.every((r) => r === 'equal' || r === 'contains')
        if (!nested) issues.push({ line: a.line, message: `Band partly overlaps line ${b.line} for the same metric. Make bands either separate or fully nested.` })
      }
    }
  }
  return issues
}

function inBand(band: Band, value: number): boolean {
  return band === null || (value >= band.min && value <= band.max)
}

export function coversAthlete(row: NormBand, input: BuildInput): boolean {
  return inBand(row.age, input.age) && inBand(row.height, input.heightInches) && inBand(row.weight, input.weightLbs)
}

/** Narrowest covering band: most constrained dimensions first, then the smallest total width. */
export function selectNormRow<T extends NormBand>(rows: readonly T[], input: BuildInput & { metricType: MetricType }): T | null {
  let best: { row: T; constrained: number; width: number } | null = null
  for (const row of rows) {
    if (row.metricType !== input.metricType || !coversAthlete(row, input)) continue
    const constrained = DIMENSIONS.filter((d) => row[d] !== null).length
    const width = DIMENSIONS.reduce((sum, d) => sum + (row[d] ? row[d]!.max - row[d]!.min : 0), 0)
    if (!best || constrained > best.constrained || (constrained === best.constrained && width < best.width)) best = { row, constrained, width }
  }
  return best?.row ?? null
}

export function describeNormBand(row: NormBand, locale: 'en' | 'es' = 'en'): string {
  const es = locale === 'es'
  const parts: string[] = []
  if (row.age) parts.push(row.age.min === row.age.max ? (es ? `${row.age.min} años` : `age ${row.age.min}`) : es ? `de ${row.age.min} a ${row.age.max} años` : `ages ${row.age.min} to ${row.age.max}`)
  if (row.height) parts.push(es ? `de ${row.height.min} a ${row.height.max} in` : `${row.height.min} to ${row.height.max} in`)
  if (row.weight) parts.push(es ? `de ${row.weight.min} a ${row.weight.max} lb` : `${row.weight.min} to ${row.weight.max} lb`)
  return parts.length ? parts.join(', ') : es ? 'todas las edades y complexiones' : 'all ages and builds'
}

/** "Better than X%" of the norm population, 1 to 99. */
export function nationalStanding(metricType: MetricType, value: number, quantiles: Quantiles): number {
  return percentileRank(metricType, value, quantiles)
}
