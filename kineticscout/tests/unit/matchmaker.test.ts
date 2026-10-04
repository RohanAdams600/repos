import { describe, expect, it } from 'vitest'
import { bandFor, fitScoreFor, normalCdf, rankPrograms, scoreProgram, type ProgramInput } from '@/lib/matchmaker/score'
import { percentileRank } from '@/lib/metrics/percentile'

const program = (overrides: Partial<ProgramInput> = {}): ProgramInput => ({
  id: 'p1',
  schoolName: 'State University',
  division: 'D1',
  state: 'TX',
  conference: null,
  minGpa: null,
  metrics: { EXIT_VELOCITY: { mean: 92, sd: 4 }, INFIELD_VELO: { mean: 85, sd: 4 }, SIXTY_YARD_DASH: { mean: 6.9, sd: 0.2 } },
  ...overrides,
})

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1)).toBeCloseTo(0.8413, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
})

describe('scoreProgram', () => {
  it('treats lower 60-yard times as better', () => {
    const fast = scoreProgram({ position: 'SHORTSTOP', gpa: null, bestMetrics: { EXIT_VELOCITY: 92, INFIELD_VELO: 85, SIXTY_YARD_DASH: 6.5 } }, program())!
    const sixty = fast.comparisons.find((c) => c.metric === 'SIXTY_YARD_DASH')!
    expect(sixty.z).toBeCloseTo(2, 5)
    expect(sixty.standing).toBeGreaterThan(95)
  })

  it('bands by composite z-score', () => {
    expect(bandFor(0.6)).toBe('STRONG')
    expect(bandFor(0)).toBe('REALISTIC')
    expect(bandFor(-1)).toBe('REACH')
    expect(bandFor(-2)).toBe('LONG_SHOT')
    expect(fitScoreFor(0.25)).toBe(100)
    expect(fitScoreFor(3)).toBeLessThan(10)
  })

  it('caps programs at reach when GPA is below the academic minimum', () => {
    const result = scoreProgram({ position: 'SHORTSTOP', gpa: 2.5, bestMetrics: { EXIT_VELOCITY: 96, INFIELD_VELO: 89, SIXTY_YARD_DASH: 6.7 } }, program({ minGpa: 3.0 }))!
    expect(result.academic).toBe('BELOW')
    expect(result.band).toBe('REACH')
    expect(result.fitScore).toBeLessThanOrEqual(40)
  })

  it('skips programs without enough comparable data and malformed program metrics', () => {
    expect(scoreProgram({ position: 'SHORTSTOP', gpa: null, bestMetrics: { POP_TIME: 2.0 } }, program())).toBeNull()
    expect(scoreProgram({ position: 'SHORTSTOP', gpa: null, bestMetrics: { EXIT_VELOCITY: 90 } }, program({ metrics: { EXIT_VELOCITY: { mean: -1 } } }))).toBeNull()
  })

  it('uses pitch velocity alone for pitchers', () => {
    const result = scoreProgram({ position: 'RHP', gpa: null, bestMetrics: { PITCH_VELO: 88 } }, program({ metrics: { PITCH_VELO: { mean: 88, sd: 3 } } }))!
    expect(result.compositeZ).toBe(0)
    expect(result.band).toBe('REALISTIC')
  })
})

describe('rankPrograms', () => {
  const programs = Array.from({ length: 45 }, (_, i) =>
    program({ id: `p${i}`, schoolName: `School ${String(i).padStart(2, '0')}`, division: i % 2 ? 'D2' : 'D1', metrics: { EXIT_VELOCITY: { mean: 80 + i * 0.5, sd: 4 }, INFIELD_VELO: { mean: 85, sd: 4 }, SIXTY_YARD_DASH: { mean: 6.9, sd: 0.2 } } }),
  )
  const athlete = { position: 'SHORTSTOP' as const, gpa: 3.5, bestMetrics: { EXIT_VELOCITY: 92, INFIELD_VELO: 86, SIXTY_YARD_DASH: 6.85 } }

  it('paginates, filters and orders by fit score', () => {
    const page1 = rankPrograms(athlete, programs, { page: 1, pageSize: 20 })
    expect(page1.total).toBe(45)
    expect(page1.pageCount).toBe(3)
    expect(page1.results).toHaveLength(20)
    for (let i = 1; i < page1.results.length; i++) expect(page1.results[i - 1]!.fitScore).toBeGreaterThanOrEqual(page1.results[i]!.fitScore)
    const d2 = rankPrograms(athlete, programs, { page: 1, pageSize: 50, divisions: ['D2'] })
    expect(d2.results.every((r) => r.division === 'D2')).toBe(true)
    const beyond = rankPrograms(athlete, programs, { page: 99, pageSize: 20 })
    expect(beyond.page).toBe(3)
  })
})

describe('percentileRank', () => {
  const q = { p10: 80, p25: 84, p50: 88, p75: 92, p90: 95 }
  it('interpolates between quantiles and clamps the tails', () => {
    expect(percentileRank('EXIT_VELOCITY', 88, q)).toBe(50)
    expect(percentileRank('EXIT_VELOCITY', 90, q)).toBe(63)
    expect(percentileRank('EXIT_VELOCITY', 200, q)).toBe(99)
    expect(percentileRank('EXIT_VELOCITY', 10, q)).toBe(1)
  })
  it('mirrors timed events', () => {
    const sixty = { p10: 6.6, p25: 6.8, p50: 7.0, p75: 7.2, p90: 7.4 }
    expect(percentileRank('SIXTY_YARD_DASH', 6.6, sixty)).toBe(90)
    expect(percentileRank('SIXTY_YARD_DASH', 7.4, sixty)).toBe(10)
  })
})
