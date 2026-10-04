import { describe, expect, it } from 'vitest'
import { decodePoseTrack, encodePoseTrack } from '@/lib/biomechanics/codec'
import { commonAnchor } from '@/lib/biomechanics/compare'
import { analyzeKinematicSequence, drivingArmSide, fillShortGaps, leadSide } from '@/lib/biomechanics/kinematics'
import { PoseQualityError } from '@/lib/biomechanics/types'
import { syntheticSwing } from '../helpers/synthetic-pose'

const efficient = { pelvisPeak: 0.4, torsoPeak: 0.44, armPeak: 0.48, handPeak: 0.52, footStrike: 0.38 }

describe('analyzeKinematicSequence', () => {
  it('recognises an efficient proximal-to-distal sequence', () => {
    const report = analyzeKinematicSequence({ track: syntheticSwing(efficient), motionType: 'SWING', handedness: 'RIGHT' })

    expect(report.algorithm).toBe('kseq-2d-v1')
    expect(report.frameRate).toBeCloseTo(240, 0)
    expect(report.observedOrder).toEqual(['pelvis', 'torso', 'arm', 'hand'])
    expect(report.sequenceIsIdeal).toBe(true)
    const byName = Object.fromEntries(report.peaks.map((p) => [p.segment, p.time]))
    expect(byName.pelvis).toBeCloseTo(0.4, 1)
    expect(byName.torso).toBeCloseTo(0.44, 1)
    expect(byName.arm).toBeCloseTo(0.48, 1)
    expect(byName.hand).toBeCloseTo(0.52, 1)
    expect(report.findings).toEqual([])
    expect(report.separationAtFootStrikeDeg).toBeGreaterThan(10)
    expect(report.gapsMs.pelvisToTorso).toBeGreaterThan(20)
    expect(report.gapsMs.pelvisToTorso).toBeLessThan(60)
    expect(report.footStrikeTime).not.toBeNull()
    expect(Math.abs(report.footStrikeTime! - 0.38)).toBeLessThan(0.03)
    expect(report.findings.map((f) => f.code)).not.toContain('TRUNK_LEADS_PELVIS')
    expect(report.findings.map((f) => f.code)).not.toContain('ARM_LEADS_TRUNK')
    expect(report.warnings).not.toContain('LOW_FRAME_RATE')
    expect(report.confidence).toBeGreaterThan(0.8)
  })

  it('flags a trunk that fires before the pelvis', () => {
    const track = syntheticSwing({ ...efficient, pelvisPeak: 0.46, torsoPeak: 0.41 })
    const report = analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })
    expect(report.sequenceIsIdeal).toBe(false)
    expect(report.observedOrder.indexOf('torso')).toBeLessThan(report.observedOrder.indexOf('pelvis'))
    expect(report.findings.find((f) => f.code === 'TRUNK_LEADS_PELVIS')?.severity).toBe('high')
  })

  it('flags an arm that fires before the trunk', () => {
    const track = syntheticSwing({ ...efficient, armPeak: 0.4, torsoPeak: 0.47, handPeak: 0.53 })
    const report = analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })
    expect(report.findings.map((f) => f.code)).toContain('ARM_LEADS_TRUNK')
  })

  it('flags hips and shoulders turning together at foot strike', () => {
    const track = syntheticSwing({ ...efficient, pelvisPeak: 0.44, torsoPeak: 0.445, armPeak: 0.49, handPeak: 0.53 })
    const report = analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })
    expect(report.findings.map((f) => f.code)).toContain('LOW_HIP_SHOULDER_SEPARATION')
  })

  it('warns when the frame rate cannot resolve timing differences', () => {
    const report = analyzeKinematicSequence({ track: syntheticSwing({ ...efficient, fps: 30 }), motionType: 'SWING', handedness: 'RIGHT' })
    expect(report.warnings).toContain('LOW_FRAME_RATE')
  })

  it('rejects tracks that are too short to analyse', () => {
    const track = syntheticSwing({ ...efficient, duration: 0.03 })
    expect(() => analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })).toThrow(PoseQualityError)
  })

  it('rejects tracks missing required keypoints', () => {
    const track = syntheticSwing(efficient)
    for (const frame of track.frames) delete frame.keypoints.left_wrist
    expect(() => analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })).toThrow(PoseQualityError)
  })

  it('tolerates short keypoint dropouts by interpolation', () => {
    const track = syntheticSwing(efficient)
    for (const i of [50, 51, 120]) track.frames[i]!.keypoints.left_hip = { x: 0, y: 0, score: 0.05 }
    const report = analyzeKinematicSequence({ track, motionType: 'SWING', handedness: 'RIGHT' })
    expect(report.sequenceIsIdeal).toBe(true)
  })
})

describe('side selection', () => {
  it('uses the glove side as lead and the throwing arm for pitchers', () => {
    expect(leadSide('RIGHT')).toBe('left')
    expect(drivingArmSide('PITCH', 'RIGHT')).toBe('right')
    expect(drivingArmSide('SWING', 'RIGHT')).toBe('left')
    expect(drivingArmSide('SWING', 'LEFT')).toBe('right')
  })
})

describe('fillShortGaps', () => {
  it('interpolates gaps up to the limit and leaves longer gaps', () => {
    const t = [0, 1, 2, 3, 4, 5, 6, 7]
    expect(fillShortGaps([0, Number.NaN, 2, 3, 4, 5, 6, 7], t, 3)[1]).toBeCloseTo(1)
    const long = fillShortGaps([0, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 5, 6, 7], t, 3)
    expect(Number.isNaN(long[2]!)).toBe(true)
  })
})

describe('pose codec', () => {
  it('round-trips a track', () => {
    const track = syntheticSwing({ ...efficient, duration: 0.2 })
    const decoded = decodePoseTrack(encodePoseTrack(track))
    expect(decoded.frames).toHaveLength(track.frames.length)
    expect(decoded.frames[10]!.keypoints.left_hip!.x).toBeCloseTo(track.frames[10]!.keypoints.left_hip!.x, 3)
    expect(decoded.frames[10]!.keypoints.nose).toBeUndefined()
  })
})

describe('hockey shots and football throws', () => {
  it('drives with the shooting-side hand on the stick and the throwing arm for a pass', () => {
    expect(drivingArmSide('HOCKEY_SHOT', 'LEFT')).toBe('left')
    expect(leadSide('LEFT')).toBe('right')
    expect(drivingArmSide('FOOTBALL_THROW', 'RIGHT')).toBe('right')
  })

  it('analyses a left-handed shot from skates without a visible foot strike, syncing on the hands', () => {
    // The synthetic track animates the left arm; for a left shot the front leg is the right one, which
    // stays planted (gliding), so no foot strike is detected.
    const report = analyzeKinematicSequence({ track: syntheticSwing(efficient), motionType: 'HOCKEY_SHOT', handedness: 'LEFT' })
    expect(report.motionType).toBe('HOCKEY_SHOT')
    expect(report.sequenceIsIdeal).toBe(true)
    expect(report.footStrikeTime).toBeNull()
    expect(report.warnings).toContain('FOOT_STRIKE_NOT_DETECTED')
    expect(commonAnchor(report, report)?.event).toBe('HAND_PEAK')
  })

  it('words findings for the motion being analysed', () => {
    const track = syntheticSwing({ ...efficient, armPeak: 0.4, torsoPeak: 0.47, handPeak: 0.53 })
    const shot = analyzeKinematicSequence({ track, motionType: 'HOCKEY_SHOT', handedness: 'LEFT' })
    const finding = shot.findings.find((f) => f.code === 'ARM_LEADS_TRUNK')!
    expect(finding.detail).toContain('bottom arm')
    expect(finding.focus).toContain('net')
    const pass = analyzeKinematicSequence({ track, motionType: 'FOOTBALL_THROW', handedness: 'LEFT' })
    expect(pass.findings.find((f) => f.code === 'ARM_LEADS_TRUNK')!.detail).toContain('throwing arm')
  })
})
