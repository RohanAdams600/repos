import { describe, expect, it } from 'vitest'
import { MOTIONS_BY_SPORT, isMotionForSport } from '@/lib/biomechanics/motions'
import { bodyHeightInFrameUnits, estimateProjectile, linearFit, selectProjectileTrack, type ObjectTrackCandidate } from '@/lib/biomechanics/projectile'
import type { PoseTrack } from '@/lib/biomechanics/types'
import { toObjectCandidates } from '@worker/pose/google-video-intelligence'

const ASPECT = 16 / 9

/** Standing athlete whose nose-to-ankle distance is 0.704 frame heights, i.e. 0.8 frame heights tall. */
function standingPose(): PoseTrack {
  const frames = Array.from({ length: 30 }, (_, i) => ({
    t: i / 120,
    keypoints: {
      nose: { x: 0.3, y: 0.1, score: 0.95 },
      left_ankle: { x: 0.3, y: 0.804, score: 0.95 },
      right_ankle: { x: 0.3, y: 0.804, score: 0.95 },
    },
  }))
  return { aspectRatio: ASPECT, frames }
}

/** Ball moving right at a constant normalized speed starting at release. */
function ball(vxNormalized: number, options: { label?: string; points?: number; jitter?: number } = {}): ObjectTrackCandidate {
  const n = options.points ?? 24
  return {
    label: options.label ?? 'baseball',
    confidence: 0.8,
    observations: Array.from({ length: n }, (_, i) => {
      const t = 0.5 + i / 120
      const x = 0.35 + vxNormalized * (t - 0.5)
      const y = 0.5 + (options.jitter ? (i % 2 === 0 ? options.jitter : -options.jitter) : 0)
      return { t, box: { left: x - 0.005, right: x + 0.005, top: y - 0.005, bottom: y + 0.005 } }
    }),
  }
}

describe('motion catalogue', () => {
  it('offers each sport its own motions only', () => {
    expect(MOTIONS_BY_SPORT.HOCKEY).toEqual(['HOCKEY_SHOT'])
    expect(isMotionForSport('FOOTBALL_THROW', 'FOOTBALL')).toBe(true)
    expect(isMotionForSport('HOCKEY_SHOT', 'BASEBALL')).toBe(false)
  })
})

describe('puck and ball tracking (beta)', () => {
  it('measures the athlete as the ruler, ignoring crouched frames', () => {
    const pose = standingPose()
    expect(bodyHeightInFrameUnits(pose)).toBeCloseTo(0.8, 3)
    expect(bodyHeightInFrameUnits({ aspectRatio: ASPECT, frames: pose.frames.slice(0, 3) })).toBeNull()
  })

  it('fits a straight line and reports how well it fits', () => {
    expect(linearFit([0, 1, 2, 3], [1, 3, 5, 7])).toEqual({ slope: 2, r2: 1 })
    expect(linearFit([0, 1, 2, 3], [0, 1, 0, 1]).r2).toBeLessThan(0.5)
  })

  it('picks the projectile-labelled track that is moving after release', () => {
    const person: ObjectTrackCandidate = { label: 'person', confidence: 0.99, observations: ball(1).observations }
    const early: ObjectTrackCandidate = { label: 'ball', confidence: 0.9, observations: ball(1).observations.map((o) => ({ ...o, t: o.t - 2 })) }
    const flight = ball(7.3125)
    expect(selectProjectileTrack([person, early, flight], 'PITCH', 0.5)).toBe(flight)
    expect(selectProjectileTrack([ball(2, { label: 'hockey puck' })], 'PITCH', 0.5)).toBeNull()
    expect(selectProjectileTrack([ball(2, { label: 'Hockey puck' })], 'HOCKEY_SHOT', 0.5)?.label).toBe('Hockey puck')
  })

  it('converts image-plane speed to mph with the athlete height as scale', () => {
    // 7.3125 normalized/s * 16/9 = 13 frame heights/s; 72 in over 0.8 frame heights = 2.286 m per unit,
    // so 29.72 m/s = 66.5 mph, moving right and level.
    const estimate = estimateProjectile({ candidates: [ball(7.3125)], motion: 'PITCH', releaseTime: 0.5, pose: standingPose(), athleteHeightInches: 72 })
    expect(estimate.speedMph).toBeCloseTo(66.5, 0)
    expect(estimate).toMatchObject({ launchAngleDeg: 0, direction: 'right', warnings: [], label: 'baseball' })
    expect(estimate.points.length).toBeGreaterThan(10)
  })

  it('withholds speeds it cannot stand behind', () => {
    const pose = standingPose()
    const base = { motion: 'PITCH' as const, releaseTime: 0.5, pose }
    expect(estimateProjectile({ ...base, candidates: [], athleteHeightInches: 72 })).toMatchObject({ speedMph: null, warnings: ['NOT_FOUND'] })
    expect(estimateProjectile({ ...base, candidates: [ball(7, { points: 2 })], athleteHeightInches: 72 })).toMatchObject({ speedMph: null, warnings: ['FEW_POINTS'] })
    expect(estimateProjectile({ ...base, candidates: [ball(7.3125)], athleteHeightInches: null })).toMatchObject({ speedMph: null, warnings: ['NO_HEIGHT'] })
    // About 160 mph: outside the plausible pitch range.
    expect(estimateProjectile({ ...base, candidates: [ball(17.6)], athleteHeightInches: 72 })).toMatchObject({ speedMph: null, warnings: ['IMPLAUSIBLE_SPEED'] })
    expect(estimateProjectile({ ...base, candidates: [ball(0.2, { jitter: 0.05 })], athleteHeightInches: 72 }).warnings).toEqual(['LOW_FIT'])
  })

  it('maps Video Intelligence object annotations to candidates', () => {
    const candidates = toObjectCandidates([
      { entity: { description: 'hockey puck' }, confidence: 0.6, frames: [{ normalizedBoundingBox: { left: 0.1, top: 0.2, right: 0.12, bottom: 0.22 }, timeOffset: { seconds: '1', nanos: 500_000_000 } }] },
      { entity: { description: null }, frames: [] },
    ])
    expect(candidates).toEqual([{ label: 'hockey puck', confidence: 0.6, observations: [{ t: 1.5, box: { left: 0.1, top: 0.2, right: 0.12, bottom: 0.22 } }] }])
  })
})
