import { describe, expect, it } from 'vitest'
import { drillInputSchema, pickDrills, progressSummary, weekBounds } from '@/lib/training/rules'

const drill = (id: string, focusCodes: string[], motionTypes = ['SWING'] as ('SWING' | 'PITCH')[]) => ({ id, title: `Drill ${id}`, motionTypes, focusCodes })

describe('choosing drills', () => {
  it('works through findings from most to least serious, one targeted drill each, no repeats', () => {
    const drills = [drill('broad', ['TRUNK_LEADS_PELVIS', 'LOW_HIP_SHOULDER_SEPARATION']), drill('hips', ['TRUNK_LEADS_PELVIS']), drill('sep', ['LOW_HIP_SHOULDER_SEPARATION']), drill('pitch-only', ['ARM_LEADS_TRUNK'], ['PITCH'])]
    const picks = pickDrills(
      [
        { code: 'LOW_HIP_SHOULDER_SEPARATION', severity: 'medium' },
        { code: 'TRUNK_LEADS_PELVIS', severity: 'high' },
        { code: 'ARM_LEADS_TRUNK', severity: 'high' },
      ],
      drills,
      'SWING',
    )
    // The pitching drill is not offered for a swing; the targeted drills win over the broad one.
    expect(picks).toEqual([
      { drillId: 'hips', focusCode: 'TRUNK_LEADS_PELVIS' },
      { drillId: 'sep', focusCode: 'LOW_HIP_SHOULDER_SEPARATION' },
    ])
  })
  it('returns nothing when the library does not cover the findings', () => {
    expect(pickDrills([{ code: 'HAND_LEADS_ARM', severity: 'low' }], [drill('a', ['TRUNK_LEADS_PELVIS'])], 'SWING')).toEqual([])
  })
})

describe('progress', () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`)
  it('reports best and latest against the baseline for either direction', () => {
    const since = [{ date: d('2026-10-10'), value: 84 }, { date: d('2026-10-20'), value: 87.5 }, { date: d('2026-10-25'), value: 86 }]
    expect(progressSummary({ date: d('2026-09-30'), value: 85 }, since, true)).toMatchObject({ count: 3, best: { value: 87.5 }, latest: { value: 86 }, changeFromBaseline: 2.5 })
    expect(progressSummary(null, since, false)).toMatchObject({ best: { value: 84 }, changeFromBaseline: null })
    expect(progressSummary(null, [], true)).toEqual({ count: 0, best: null, latest: null, changeFromBaseline: null })
  })
  it('counts weeks from Monday', () => {
    const { start, end } = weekBounds(d('2026-10-08'))
    expect([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]).toEqual(['2026-10-05', '2026-10-11'])
  })
})

describe('drill entries', () => {
  const base = { title: 'Hip lead walk-through', sport: 'BASEBALL', motionTypes: ['SWING'], focusCodes: ['TRUNK_LEADS_PELVIS'], summary: 'Slow rehearsal of the hips starting the turn.', steps: ['Set up in your stance.'], minutes: '10', safetyNote: 'Warm up first.', source: 'STAFF', author: 'Staff coach, certified' }
  it('needs licence details only for licensed drills, and motions from the drill’s sport', () => {
    expect(drillInputSchema.safeParse(base).success).toBe(true)
    expect(drillInputSchema.safeParse({ ...base, source: 'LICENSED' }).success).toBe(false)
    expect(drillInputSchema.safeParse({ ...base, source: 'LICENSED', licensor: 'Example Press', licenceRef: 'Agreement 12' }).success).toBe(true)
    expect(drillInputSchema.safeParse({ ...base, licensor: 'Example Press', licenceRef: 'x' }).success).toBe(false)
    expect(drillInputSchema.safeParse({ ...base, motionTypes: ['HOCKEY_SHOT'] }).success).toBe(false)
    expect(drillInputSchema.safeParse({ ...base, focusCodes: ['MADE_UP'] }).success).toBe(false)
    expect(drillInputSchema.safeParse({ ...base, steps: Array.from({ length: 9 }, () => 'Step') }).success).toBe(false)
  })
})
