/**
 * Pose and kinematic report types shared by the worker (producer) and the dashboard (consumer).
 * Coordinates are normalized to the video frame: x in [0,1] left to right, y in [0,1] top to bottom.
 */

export const KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const

export type KeypointName = (typeof KEYPOINT_NAMES)[number]

export type Keypoint = { x: number; y: number; score: number }

export type PoseFrame = { t: number; keypoints: Partial<Record<KeypointName, Keypoint>> }

export type PoseTrack = {
  /** Frame width divided by height, so distances can be computed in true proportions. */
  aspectRatio: number
  frames: PoseFrame[]
}

/** Compact storage form: one row per frame, [t, x0, y0, s0, x1, y1, s1, ...] in KEYPOINT_NAMES order. Missing points are -1. */
export type CompactPoseTrack = {
  v: 1
  aspectRatio: number
  rows: number[][]
}

export type SegmentName = 'pelvis' | 'torso' | 'arm' | 'hand'

export type SegmentPeak = {
  segment: SegmentName
  /** Seconds from the start of the clip. */
  time: number
  /** Peak angular speed in degrees per second (2D estimate). */
  speedDegPerSec: number
}

export type FindingCode =
  | 'TRUNK_LEADS_PELVIS'
  | 'ARM_LEADS_TRUNK'
  | 'HAND_LEADS_ARM'
  | 'LOW_HIP_SHOULDER_SEPARATION'
  | 'SEGMENTS_FIRE_TOGETHER'
  | 'NO_SPEED_GAIN_PELVIS_TO_TRUNK'

export type Finding = {
  code: FindingCode
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  /** A coaching focus area, not a prescription. */
  focus: string
}

export type QualityWarning =
  | 'LOW_FRAME_RATE'
  | 'FOOT_STRIKE_NOT_DETECTED'
  | 'LOW_KEYPOINT_CONFIDENCE'
  | 'SHORT_CLIP'

export type KinematicReport = {
  algorithm: 'kseq-2d-v1'
  motionType: 'SWING' | 'PITCH'
  handedness: 'RIGHT' | 'LEFT'
  frameRate: number
  durationSec: number
  /** Time of lead foot strike, used to sync side-by-side comparisons. */
  footStrikeTime: number | null
  peaks: SegmentPeak[]
  /** Segments in the order their speed peaked. Ideal: pelvis, torso, arm, hand. */
  observedOrder: SegmentName[]
  sequenceIsIdeal: boolean
  /** Milliseconds between consecutive ideal-order peaks: torso-pelvis, arm-torso, hand-arm. Negative means out of order. */
  gapsMs: { pelvisToTorso: number; torsoToArm: number; armToHand: number }
  /** Hip-shoulder separation at foot strike in degrees (null if foot strike was not found). */
  separationAtFootStrikeDeg: number | null
  maxSeparationDeg: number
  findings: Finding[]
  warnings: QualityWarning[]
  /** 0 to 1. Share of usable frames weighted by keypoint confidence. */
  confidence: number
}

export class PoseQualityError extends Error {
  constructor(public readonly code: 'TOO_FEW_FRAMES' | 'MISSING_KEYPOINTS' | 'INVALID_TRACK') {
    super(code)
    this.name = 'PoseQualityError'
  }
}
