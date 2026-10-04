import type { Motion } from '@/lib/biomechanics/motions'
import type { PoseTrack } from '@/lib/biomechanics/types'
import { METRIC_DEFINITIONS, type MetricType } from '@/lib/metrics/definitions'

/**
 * Puck and ball tracking (beta).
 *
 * Video Intelligence object tracking returns labelled tracks of bounding boxes. We pick the track
 * whose label matches the sport's projectile and that is moving just after release (peak hand
 * speed), fit a straight line to its centre over the first 250 ms of flight, and convert the
 * image-plane speed to mph using the athlete's standing height as the ruler.
 *
 * Limits, shown with every result: the camera sees motion across the frame only, so motion
 * toward or away from the camera is missed and the speed is a lower bound; the ruler assumes the
 * projectile travels at about the athlete's distance from the camera; small, blurred pucks are
 * often not detected at all. Results outside plausible ranges are withheld rather than shown.
 */

export type NormalizedBox = { left: number; top: number; right: number; bottom: number }
export type ObjectObservation = { t: number; box: NormalizedBox }
export type ObjectTrackCandidate = { label: string; confidence: number; observations: ObjectObservation[] }

export const PROJECTILE_LABELS: Record<Motion, readonly string[]> = {
  SWING: ['baseball', 'ball'],
  PITCH: ['baseball', 'ball'],
  HOCKEY_SHOT: ['hockey puck', 'puck', 'ice hockey'],
  FOOTBALL_THROW: ['american football', 'football', 'rugby ball', 'ball'],
}

/** Metric whose plausibility range bounds the speed estimate. */
const SPEED_METRIC: Record<Motion, MetricType> = {
  SWING: 'EXIT_VELOCITY',
  PITCH: 'PITCH_VELO',
  HOCKEY_SHOT: 'SLAPSHOT_SPEED',
  FOOTBALL_THROW: 'THROW_VELOCITY',
}

const FLIGHT_WINDOW_SEC = 0.25
const MIN_POINTS = 4
/** Nose to ankle as a share of standing height (adult anthropometric average). */
const NOSE_TO_ANKLE_RATIO = 0.88
const METERS_PER_INCH = 0.0254
const MPH_PER_MPS = 2.236_936

export type ProjectileWarning = 'NOT_FOUND' | 'FEW_POINTS' | 'NO_HEIGHT' | 'IMPLAUSIBLE_SPEED' | 'LOW_FIT'

export type ProjectileEstimate = {
  version: 'proj-2d-v1'
  label: string | null
  /** Box centres (normalized) for the overlay, at most 60. */
  points: { t: number; x: number; y: number }[]
  releaseTime: number
  /** Degrees above horizontal in the image plane; positive is upward. */
  launchAngleDeg: number | null
  direction: 'left' | 'right' | null
  speedMph: number | null
  /** Coefficient of determination of the straight-line fit (0 to 1). */
  fit: number | null
  warnings: ProjectileWarning[]
}

function centre(box: NormalizedBox) {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
}

/** Projectile-labelled track with the most observations in the flight window after release. */
export function selectProjectileTrack(candidates: readonly ObjectTrackCandidate[], motion: Motion, releaseTime: number): ObjectTrackCandidate | null {
  const labels = PROJECTILE_LABELS[motion]
  const inWindow = (o: ObjectObservation) => o.t >= releaseTime - 0.05 && o.t <= releaseTime + FLIGHT_WINDOW_SEC
  let best: { candidate: ObjectTrackCandidate; count: number } | null = null
  for (const candidate of candidates) {
    const label = candidate.label.toLowerCase()
    if (!labels.some((l) => label === l || label.includes(l))) continue
    const count = candidate.observations.filter(inWindow).length
    if (count > 0 && (!best || count > best.count || (count === best.count && candidate.confidence > best.candidate.confidence))) best = { candidate, count }
  }
  return best?.candidate ?? null
}

/** Least-squares slope of v against t, with R squared. */
export function linearFit(t: readonly number[], v: readonly number[]): { slope: number; r2: number } {
  const n = t.length
  const mt = t.reduce((a, b) => a + b, 0) / n
  const mv = v.reduce((a, b) => a + b, 0) / n
  let stt = 0
  let stv = 0
  let svv = 0
  for (let i = 0; i < n; i++) {
    stt += (t[i]! - mt) ** 2
    stv += (t[i]! - mt) * (v[i]! - mv)
    svv += (v[i]! - mv) ** 2
  }
  const slope = stt > 0 ? stv / stt : 0
  const r2 = svv > 0 && stt > 0 ? (stv * stv) / (stt * svv) : 1
  return { slope, r2 }
}

/**
 * Athlete height in frame units (true proportions): the most upright nose-to-ankle distance in the
 * clip divided by the anthropometric ratio. Uses the 95th percentile so crouched frames do not
 * shrink the ruler.
 */
export function bodyHeightInFrameUnits(pose: PoseTrack): number | null {
  const heights: number[] = []
  for (const frame of pose.frames) {
    const nose = frame.keypoints.nose
    const la = frame.keypoints.left_ankle
    const ra = frame.keypoints.right_ankle
    if (!nose || nose.score < 0.3 || !la || !ra || la.score < 0.3 || ra.score < 0.3) continue
    const ankle = { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 }
    heights.push(Math.hypot((nose.x - ankle.x) * pose.aspectRatio, nose.y - ankle.y) / NOSE_TO_ANKLE_RATIO)
  }
  if (heights.length < 5) return null
  heights.sort((a, b) => a - b)
  return heights[Math.min(heights.length - 1, Math.floor(heights.length * 0.95))]!
}

export function estimateProjectile(input: {
  candidates: readonly ObjectTrackCandidate[]
  motion: Motion
  releaseTime: number
  pose: PoseTrack
  athleteHeightInches: number | null
}): ProjectileEstimate {
  const { motion, releaseTime, pose } = input
  const empty = (warnings: ProjectileWarning[], label: string | null = null, points: ProjectileEstimate['points'] = []): ProjectileEstimate => ({
    version: 'proj-2d-v1',
    label,
    points,
    releaseTime,
    launchAngleDeg: null,
    direction: null,
    speedMph: null,
    fit: null,
    warnings,
  })

  const track = selectProjectileTrack(input.candidates, motion, releaseTime)
  if (!track) return empty(['NOT_FOUND'])
  const all = [...track.observations].sort((a, b) => a.t - b.t)
  const points = all.slice(0, 60).map((o) => ({ t: Math.round(o.t * 1000) / 1000, ...centre(o.box) }))
  const flight = all.filter((o) => o.t >= releaseTime - 0.02 && o.t <= releaseTime + FLIGHT_WINDOW_SEC)
  if (flight.length < MIN_POINTS) return empty(['FEW_POINTS'], track.label, points)

  const aspect = pose.aspectRatio
  const ts = flight.map((o) => o.t)
  const fx = linearFit(ts, flight.map((o) => centre(o.box).x * aspect))
  const fy = linearFit(ts, flight.map((o) => centre(o.box).y))
  const fit = Math.round(Math.min(fx.r2, fy.r2) * 100) / 100
  // `|| 0` turns a negative zero (level launch) into 0.
  const launchAngleDeg = Math.round((Math.atan2(-fy.slope, Math.abs(fx.slope)) * 180) / Math.PI) || 0
  const direction = fx.slope >= 0 ? 'right' : 'left'
  const warnings: ProjectileWarning[] = []
  if (fit < 0.8) warnings.push('LOW_FIT')

  let speedMph: number | null = null
  const bodyUnits = bodyHeightInFrameUnits(pose)
  if (!input.athleteHeightInches || !bodyUnits) {
    warnings.push('NO_HEIGHT')
  } else {
    const metersPerUnit = (input.athleteHeightInches * METERS_PER_INCH) / bodyUnits
    const mph = Math.hypot(fx.slope, fy.slope) * metersPerUnit * MPH_PER_MPS
    const def = METRIC_DEFINITIONS[SPEED_METRIC[motion]]
    // A poor straight-line fit already withholds the speed; only a clean fit can be implausible.
    if (!warnings.includes('LOW_FIT')) {
      if (mph >= def.min && mph <= def.max) speedMph = Math.round(mph * 10) / 10
      else warnings.push('IMPLAUSIBLE_SPEED')
    }
  }
  return { version: 'proj-2d-v1', label: track.label, points, releaseTime, launchAngleDeg, direction, speedMph, fit, warnings }
}
