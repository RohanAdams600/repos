import { describe, expect, it } from 'vitest'
import { describeNormBand, nationalStanding, NORM_CSV_COLUMNS, parseNormCsv, selectNormRow, splitCsvLine } from '@/lib/insights/norms'

const HEADER = NORM_CSV_COLUMNS.join(',')
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')

describe('norm table CSV', () => {
  it('reads nested bands, enum or stored metric names, and quoted cells', () => {
    const { rows, issues } = parseNormCsv(
      '﻿# Example licensed table\r\n' +
        csv(
          'EXIT_VELOCITY,15,16,,,,,1200,70,76,81,86,90',
          'exit_velocity,15,16,70,73,,,410,72,78,83,88,92',
          '"60_YARD_DASH",15,16,,,,,800,6.6,6.9,7.2,7.5,7.9',
        ),
    )
    expect(issues).toEqual([])
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ metricType: 'EXIT_VELOCITY', age: { min: 15, max: 16 }, height: { min: 70, max: 73 }, weight: null, sampleSize: 410 })
    expect(rows[2]!.metricType).toBe('SIXTY_YARD_DASH')
    expect(splitCsvLine('a,"b, c","say ""hi"""')).toEqual(['a', 'b, c', 'say "hi"'])
  })

  it('reports every problem with its line and stores nothing', () => {
    const { rows, issues } = parseNormCsv(
      csv(
        'BENCH_PRESS,15,16,,,,,100,1,2,3,4,5',
        'EXIT_VELOCITY,15,,,,,,100,70,76,81,86,90',
        'EXIT_VELOCITY,16,15,,,,,100,70,76,81,86,90',
        'EXIT_VELOCITY,15,16,,,,,24,70,76,81,86,90',
        'EXIT_VELOCITY,15,16,,,,,100,70,86,81,76,90',
        'EXIT_VELOCITY,15,16,,,,,100,70,76,81,86,190',
        'EXIT_VELOCITY,30,31,,,,,100,70,76,81,86,90',
      ),
    )
    expect(rows).toEqual([])
    expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(issues[0]!.message).toMatch(/Unknown metric "BENCH_PRESS"/)
    expect(issues[1]!.message).toMatch(/both age_min and age_max/)
    expect(issues[2]!.message).toMatch(/age_min is larger/)
    expect(issues[3]!.message).toMatch(/at least 25/)
    expect(issues[4]!.message).toMatch(/ascending order/)
    expect(issues[5]!.message).toMatch(/between/)
    expect(issues[6]!.message).toMatch(/age must be between 12 and 25/)
  })

  it('checks the header', () => {
    expect(parseNormCsv('').issues[0]!.message).toBe('The file is empty.')
    expect(parseNormCsv('metric,p10').issues[0]!.message).toMatch(/Missing column/)
    expect(parseNormCsv(`${HEADER},notes`).issues[0]!.message).toMatch(/Unknown column\(s\): notes/)
    expect(parseNormCsv(HEADER).issues[0]!.message).toMatch(/no rows/)
  })

  it('refuses duplicate and partly overlapping bands, but allows separate and nested ones', () => {
    const duplicate = parseNormCsv(csv('EXIT_VELOCITY,15,16,,,,,100,70,76,81,86,90', 'EXIT_VELOCITY,15,16,,,,,100,71,77,82,87,91'))
    expect(duplicate.issues).toEqual([{ line: 3, message: 'Same metric and band as line 2.' }])
    // Inclusive bounds: 66-70 and 70-74 share 70 inches, so the lookup would be ambiguous.
    const partial = parseNormCsv(csv('EXIT_VELOCITY,15,16,66,70,,,100,70,76,81,86,90', 'EXIT_VELOCITY,15,16,70,74,,,100,71,77,82,87,91'))
    expect(partial.issues[0]!.message).toMatch(/partly overlaps line 2/)
    const ok = parseNormCsv(
      csv('EXIT_VELOCITY,15,16,66,69,,,100,70,76,81,86,90', 'EXIT_VELOCITY,15,16,70,73,,,100,71,77,82,87,91', 'EXIT_VELOCITY,,,,,,,5000,68,74,80,85,89', 'PITCH_VELO,15,16,66,70,,,100,70,74,78,82,86'),
    )
    expect(ok.issues).toEqual([])
  })
})

describe('band selection', () => {
  const rows = parseNormCsv(
    csv('EXIT_VELOCITY,,,,,,,5000,68,74,80,85,89', 'EXIT_VELOCITY,15,16,,,,,1200,70,76,81,86,90', 'EXIT_VELOCITY,15,16,70,73,160,190,300,73,79,84,89,93', 'PITCH_VELO,15,16,,,,,900,70,74,78,82,86'),
  ).rows

  it('uses the narrowest band that covers the athlete', () => {
    expect(selectNormRow(rows, { metricType: 'EXIT_VELOCITY', age: 16, heightInches: 72, weightLbs: 180 })?.sampleSize).toBe(300)
    expect(selectNormRow(rows, { metricType: 'EXIT_VELOCITY', age: 16, heightInches: 75, weightLbs: 180 })?.sampleSize).toBe(1200)
    expect(selectNormRow(rows, { metricType: 'EXIT_VELOCITY', age: 18, heightInches: 75, weightLbs: 180 })?.sampleSize).toBe(5000)
    expect(selectNormRow(rows, { metricType: 'PITCH_VELO', age: 18, heightInches: 75, weightLbs: 180 })).toBeNull()
  })

  it('describes bands in plain words and ranks within them', () => {
    expect(describeNormBand(rows[2]!)).toBe('ages 15 to 16, 70 to 73 in, 160 to 190 lb')
    expect(describeNormBand(rows[0]!)).toBe('all ages and builds')
    expect(nationalStanding('EXIT_VELOCITY', 84, rows[2]!.quantiles)).toBe(50)
    // Timed events: p10 is the fast end, so a fast time ranks high.
    expect(nationalStanding('SIXTY_YARD_DASH', 6.6, { p10: 6.6, p25: 6.9, p50: 7.2, p75: 7.5, p90: 7.9 })).toBe(90)
  })
})
