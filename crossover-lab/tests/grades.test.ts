import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import type { Athlete } from '../src/data/types'
import { computeGrade, GRADE_DEFS, gradeFromZ, gradeHistory, gradesFor, overall, pitchGrades } from '../src/grades/grades'
import { normalCdf, normFor, zScore } from '../src/grades/norms'

const [taylor, ohtani, mitchell] = BUILT_IN as [Athlete, Athlete, Athlete]

describe('scale', () => {
  it('maps z to 0-99 with the typical pro in the low 70s', () => {
    expect(gradeFromZ(0)).toBe(72)
    expect(gradeFromZ(3)).toBe(99)
    expect(gradeFromZ(10)).toBe(99)
    expect(gradeFromZ(-20)).toBe(1)
  })

  it('flips z for lower-is-better metrics', () => {
    const n = normFor('RB', 'NFL', 'fortyS')!
    expect(zScore(n, 4.45)).toBeGreaterThan(0)
  })

  it('computes a standard normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3)
  })
})

describe('grades', () => {
  it('stay in range and carry formulas for every athlete', () => {
    for (const a of BUILT_IN) {
      for (const g of gradesFor(a)) {
        expect(g.value).toBeGreaterThanOrEqual(1)
        expect(g.value).toBeLessThanOrEqual(99)
        expect(g.formula).toContain('72 + 9')
        expect(g.percentile).toBeGreaterThanOrEqual(0)
        expect(g.percentile).toBeLessThanOrEqual(100)
        expect(g.percentileQuality).not.toBe('VERIFIED')
      }
    }
  })

  it('grades speed from the verified 40 and labels it VERIFIED', () => {
    const speed = gradesFor(taylor).find((g) => g.id === 'speed')!
    expect(speed.quality).toBe('VERIFIED')
    expect(speed.terms[0]!.value).toBe(4.39)
    expect(speed.value).toBe(86)
  })

  it('takes the weakest label of its inputs', () => {
    const elusiveness = gradesFor(taylor).find((g) => g.id === 'elusiveness')!
    expect(elusiveness.quality).toBe('SIMULATED')
    const power = gradesFor(ohtani).find((g) => g.id === 'power')!
    expect(power.quality).toBe('VERIFIED')
  })

  it('falls back to a SIMULATED position baseline when nothing is measured', () => {
    const def = GRADE_DEFS.find((d) => d.id === 'throwAccuracy')!
    const g = computeGrade(def, taylor)
    expect(g.quality).toBe('SIMULATED')
    expect(g.value).toBe(gradeFromZ(-2))
    expect(g.formula).toMatch(/baseline/)
  })

  it('only gives each athlete his own league grades plus the shared ones', () => {
    expect(gradesFor(taylor).some((g) => g.id === 'threePoint')).toBe(false)
    expect(gradesFor(mitchell).some((g) => g.id === 'threePoint')).toBe(true)
    expect(gradesFor(ohtani).some((g) => g.id === 'movement')).toBe(true)
  })

  it('reports how much of the overall rests on each label', () => {
    for (const a of BUILT_IN) {
      const o = overall(a)
      const sum = o.mix.VERIFIED + o.mix.ESTIMATED + o.mix.SIMULATED
      expect(sum).toBeCloseTo(1, 6)
      expect(o.value).toBeGreaterThan(60)
      expect(o.value).toBeLessThanOrEqual(99)
    }
  })

  it('grades every pitch in the arsenal', () => {
    const pg = pitchGrades(ohtani)
    expect(pg).toHaveLength(ohtani.pitches!.length)
    expect(pg.find((p) => p.type === 'four-seam')!.value).toBeGreaterThan(80)
  })

  it('builds a history across seasons from season figures', () => {
    const h = gradeHistory(mitchell)
    expect(h.map((x) => x.season)).toEqual(['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'])
    // His best three-point season (38.6%) should show his best three-point grade.
    const best = h.reduce((x, y) => ((y.grades.threePoint ?? 0) > (x.grades.threePoint ?? 0) ? y : x))
    expect(best.season).toBe('2022-23')
  })
})
