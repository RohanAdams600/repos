import {
  argMax,
  argMin,
  clamp,
  derivative,
  median,
  movingAverage,
  percentile,
  RAD_TO_DEG,
  unwrap,
} from '@/lib/biomechanics/signal'
import {
  PoseQualityError,
  type Finding,
  type KeypointName,
  type KinematicReport,
  type PoseTrack,
  type QualityWarning,
  type SegmentName,
  type SegmentPeak,
} from '@/lib/biomechanics/types'

/**
 * Kinematic sequence analysis from a 2D pose track ("kseq-2d-v1").
 *
 * Efficient rotational athletes (hitters and pitchers) accelerate body segments proximal to distal:
 * pelvis, then trunk, then arm, then hand, each peaking slightly after the previous one. This module
 * estimates each segment's angular speed from a single face-on video and reports the order and spacing
 * of the peaks, hip-shoulder separation at foot strike, and the flaws those imply.
 *
 * Measurement model and limits (shown to users alongside results):
 * - Camera faces the athlete's chest, perpendicular to the target line, at hip height.
 * - Pelvis and trunk rotation are inferred from the foreshortening of the hip and shoulder lines:
 *   a line of true length L rotated by angle theta away from the image plane projects to L*cos(theta).
 * - Arm and hand speeds are image-plane angular speeds of the upper arm and forearm.
 * - Timing resolution is bounded by frame rate; 120 fps or more is recommended.
 */

export const ALGORITHM_VERSION = 'kseq-2d-v1' as const

const MIN_KEYPOINT_SCORE = 0.3
const MAX_INTERPOLATED_GAP = 3
const MIN_FRAMES = 12
const IDEAL_ORDER: readonly SegmentName[] = ['pelvis', 'torso', 'arm', 'hand']

type Side = 'left' | 'right'

export type AnalysisInput = {
  track: PoseTrack
  motionType: 'SWING' | 'PITCH'
  handedness: 'RIGHT' | 'LEFT'
}

/** The lead side faces the target: glove side for a pitcher, front side for a hitter. */
export function leadSide(handedness: 'RIGHT' | 'LEFT'): Side {
  return handedness === 'RIGHT' ? 'left' : 'right'
}

/** Arm whose rotation drives the motion: the throwing arm for pitchers, the lead arm for hitters. */
export function drivingArmSide(motionType: 'SWING' | 'PITCH', handedness: 'RIGHT' | 'LEFT'): Side {
  if (motionType === 'PITCH') return handedness === 'RIGHT' ? 'right' : 'left'
  return leadSide(handedness)
}

type Series = { x: number[]; y: number[]; score: number[] }

function requiredKeypoints(): KeypointName[] {
  return [
    'left_shoulder',
    'right_shoulder',
    'left_hip',
    'right_hip',
    'left_elbow',
    'right_elbow',
    'left_wrist',
    'right_wrist',
    'left_ankle',
    'right_ankle',
  ]
}

function extractSeries(track: PoseTrack, name: KeypointName): Series {
  const x: number[] = []
  const y: number[] = []
  const score: number[] = []
  for (const frame of track.frames) {
    const kp = frame.keypoints[name]
    const valid =
      kp !== undefined &&
      kp.score >= MIN_KEYPOINT_SCORE &&
      Number.isFinite(kp.x) &&
      Number.isFinite(kp.y) &&
      kp.x >= -0.05 &&
      kp.x <= 1.05 &&
      kp.y >= -0.05 &&
      kp.y <= 1.05
    x.push(valid ? kp.x : Number.NaN)
    y.push(valid ? kp.y : Number.NaN)
    score.push(valid ? kp.score : 0)
  }
  return { x, y, score }
}

/** Linearly fills NaN runs no longer than maxGap that have valid samples on both sides. */
export function fillShortGaps(values: number[], times: readonly number[], maxGap: number): number[] {
  const out = [...values]
  let i = 0
  while (i < out.length) {
    if (!Number.isNaN(out[i]!)) {
      i++
      continue
    }
    const start = i
    while (i < out.length && Number.isNaN(out[i]!)) i++
    const end = i // first valid index after the gap, or length
    const gap = end - start
    if (start > 0 && end < out.length && gap <= maxGap) {
      const t0 = times[start - 1]!
      const t1 = times[end]!
      const v0 = out[start - 1]!
      const v1 = out[end]!
      for (let k = start; k < end; k++) {
        const w = t1 > t0 ? (times[k]! - t0) / (t1 - t0) : 0
        out[k] = v0 + w * (v1 - v0)
      }
    }
  }
  return out
}

function longestValidRun(mask: readonly boolean[]): { start: number; end: number } {
  let best = { start: 0, end: -1 }
  let runStart = -1
  for (let i = 0; i <= mask.length; i++) {
    if (i < mask.length && mask[i]) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      if (i - 1 - runStart > best.end - best.start) best = { start: runStart, end: i - 1 }
      runStart = -1
    }
  }
  return best
}

function distance(ax: number, ay: number, bx: number, by: number, aspect: number): number {
  return Math.hypot((ax - bx) * aspect, ay - by)
}

/** Rotation angle (degrees) inferred from foreshortening of a segment relative to its full length. */
function rotationFromWidth(widths: readonly number[]): number[] {
  const reference = percentile(widths, 95)
  return widths.map((w) => Math.acos(clamp(reference > 0 ? w / reference : 1, 0, 1)) * RAD_TO_DEG)
}

function smoothingWindow(frameRate: number): number {
  // About 25 ms of half-window, odd, between 3 and 9 samples.
  const half = Math.round(frameRate * 0.025)
  return clamp(half * 2 + 1, 3, 9)
}

function detectFootStrike(
  ankleX: readonly number[],
  ankleY: readonly number[],
  times: readonly number[],
  bodyScale: number,
  searchEnd: number,
): number | null {
  const ground = percentile(ankleY, 85)
  const highest = argMin(ankleY, 0, searchEnd)
  const lift = ground - ankleY[highest]!

  if (lift > 0.03 * bodyScale) {
    for (let i = highest + 1; i <= searchEnd; i++) {
      if (ankleY[i]! >= ground - 0.015 * bodyScale) return i
    }
    return null
  }

  // Little visible lift (slide step or toe tap): use the end of the forward stride instead.
  const vx = derivative(ankleX, times).map(Math.abs)
  const fastest = argMax(vx, 0, searchEnd)
  if (vx[fastest]! < 0.05 * bodyScale) return null
  for (let i = fastest + 1; i <= searchEnd; i++) {
    if (vx[i]! < 0.2 * vx[fastest]!) return i
  }
  return null
}

function buildFindings(
  peaks: Record<SegmentName, SegmentPeak>,
  separationAtFootStrike: number | null,
  frameRate: number,
  motionType: 'SWING' | 'PITCH',
): Finding[] {
  const findings: Finding[] = []
  // Differences smaller than half a frame are within measurement noise.
  const tolerance = 0.5 / frameRate
  const handWord = motionType === 'SWING' ? 'hands and barrel' : 'hand at release'

  if (peaks.torso.time < peaks.pelvis.time - tolerance) {
    findings.push({
      code: 'TRUNK_LEADS_PELVIS',
      severity: 'high',
      title: 'Trunk rotation peaks before the hips',
      detail: `Trunk speed peaked ${Math.round((peaks.pelvis.time - peaks.torso.time) * 1000)} ms before pelvis speed. The upper body is starting the rotation instead of being pulled through by the hips.`,
      focus: 'Let the hips start rotation while the chest stays closed through foot strike.',
    })
  }
  if (peaks.arm.time < peaks.torso.time - tolerance) {
    findings.push({
      code: 'ARM_LEADS_TRUNK',
      severity: 'high',
      title: 'Arm speed peaks before the trunk',
      detail: `The ${motionType === 'SWING' ? 'lead arm' : 'throwing arm'} peaked ${Math.round((peaks.torso.time - peaks.arm.time) * 1000)} ms before the trunk, a sign the arm is generating speed on its own rather than receiving it from the body.`,
      focus: motionType === 'SWING' ? 'Keep the hands back until the trunk turns, avoiding an early push or cast.' : 'Delay arm acceleration until the trunk has rotated toward the target.',
    })
  }
  if (peaks.hand.time < peaks.arm.time - tolerance) {
    findings.push({
      code: 'HAND_LEADS_ARM',
      severity: 'medium',
      title: `The ${handWord} peak before the arm`,
      detail: `Forearm speed peaked ${Math.round((peaks.arm.time - peaks.hand.time) * 1000)} ms before upper-arm speed.`,
      focus: 'Work on releasing the forearm and hand last in the chain.',
    })
  }
  if (separationAtFootStrike !== null && separationAtFootStrike < 10) {
    findings.push({
      code: 'LOW_HIP_SHOULDER_SEPARATION',
      severity: 'medium',
      title: 'Hips and shoulders rotate together at foot strike',
      detail: `Estimated hip-shoulder separation at foot strike was ${separationAtFootStrike.toFixed(0)} degrees. Little separation limits the stretch the trunk can use.`,
      focus: 'Start opening the hips while keeping the shoulders closed as the front foot lands.',
    })
  }
  const orderIsIdeal =
    peaks.pelvis.time <= peaks.torso.time && peaks.torso.time <= peaks.arm.time && peaks.arm.time <= peaks.hand.time
  if (orderIsIdeal && frameRate >= 120) {
    const gaps = [peaks.torso.time - peaks.pelvis.time, peaks.arm.time - peaks.torso.time]
    if (gaps.every((g) => g < 0.01)) {
      findings.push({
        code: 'SEGMENTS_FIRE_TOGETHER',
        severity: 'low',
        title: 'Segments peak almost at the same moment',
        detail: 'The order is correct, but pelvis, trunk and arm peaks are less than 10 ms apart, so the motion behaves more like one block than a whip.',
        focus: 'Build rhythm between hip turn and trunk turn rather than turning everything at once.',
      })
    }
  }
  if (peaks.torso.speedDegPerSec < peaks.pelvis.speedDegPerSec) {
    findings.push({
      code: 'NO_SPEED_GAIN_PELVIS_TO_TRUNK',
      severity: 'low',
      title: 'Trunk is not faster than the pelvis',
      detail: 'In an efficient sequence each segment peaks faster than the one before it. This is an image-based estimate; confirm with a second clip before acting on it.',
      focus: 'Focus on transferring hip rotation into a faster trunk turn.',
    })
  }
  return findings
}

export function analyzeKinematicSequence({ track, motionType, handedness }: AnalysisInput): KinematicReport {
  if (!Number.isFinite(track.aspectRatio) || track.aspectRatio <= 0) throw new PoseQualityError('INVALID_TRACK')
  const frames = [...track.frames].sort((a, b) => a.t - b.t)
  if (frames.length < MIN_FRAMES) throw new PoseQualityError('TOO_FEW_FRAMES')
  const sorted: PoseTrack = { aspectRatio: track.aspectRatio, frames }
  const allTimes = frames.map((f) => f.t)

  // 1. Per-keypoint series with short gaps filled.
  const names = requiredKeypoints()
  const raw = Object.fromEntries(names.map((n) => [n, extractSeries(sorted, n)])) as Record<KeypointName, Series>
  for (const n of names) {
    raw[n].x = fillShortGaps(raw[n].x, allTimes, MAX_INTERPOLATED_GAP)
    raw[n].y = fillShortGaps(raw[n].y, allTimes, MAX_INTERPOLATED_GAP)
  }

  // 2. Analyse the longest contiguous run in which every required keypoint is present.
  const usable = allTimes.map((_, i) => names.every((n) => !Number.isNaN(raw[n].x[i]!) && !Number.isNaN(raw[n].y[i]!)))
  const run = longestValidRun(usable)
  const length = run.end - run.start + 1
  if (length < MIN_FRAMES) throw new PoseQualityError('MISSING_KEYPOINTS')

  const times = allTimes.slice(run.start, run.end + 1)
  const dts = times.slice(1).map((t, i) => t - times[i]!).filter((dt) => dt > 0)
  const frameRate = dts.length ? 1 / median(dts) : 0
  if (!Number.isFinite(frameRate) || frameRate <= 0) throw new PoseQualityError('INVALID_TRACK')

  const window = smoothingWindow(frameRate)
  const series = (n: KeypointName) => ({
    x: movingAverage(raw[n].x.slice(run.start, run.end + 1), window),
    y: movingAverage(raw[n].y.slice(run.start, run.end + 1), window),
  })
  const pts = Object.fromEntries(names.map((n) => [n, series(n)])) as Record<KeypointName, { x: number[]; y: number[] }>
  const aspect = track.aspectRatio

  // 3. Segment signals.
  const widthOf = (a: KeypointName, b: KeypointName) =>
    times.map((_, i) => distance(pts[a].x[i]!, pts[a].y[i]!, pts[b].x[i]!, pts[b].y[i]!, aspect))
  const pelvisRotation = rotationFromWidth(widthOf('left_hip', 'right_hip'))
  const torsoRotation = rotationFromWidth(widthOf('left_shoulder', 'right_shoulder'))

  const arm = drivingArmSide(motionType, handedness)
  const angleOf = (from: KeypointName, to: KeypointName) =>
    unwrap(times.map((_, i) => Math.atan2(pts[to].y[i]! - pts[from].y[i]!, (pts[to].x[i]! - pts[from].x[i]!) * aspect))).map(
      (a) => a * RAD_TO_DEG,
    )
  const upperArmAngle = angleOf(`${arm}_shoulder`, `${arm}_elbow`)
  const forearmAngle = angleOf(`${arm}_elbow`, `${arm}_wrist`)

  const speed = (angles: number[]) => movingAverage(derivative(angles, times).map(Math.abs), 3)
  const speeds: Record<SegmentName, number[]> = {
    pelvis: speed(pelvisRotation),
    torso: speed(torsoRotation),
    arm: speed(upperArmAngle),
    hand: speed(forearmAngle),
  }

  // Body scale (shoulder midpoint to ankle midpoint) normalises distance thresholds.
  const bodyScale = median(
    times.map((_, i) =>
      distance(
        (pts.left_shoulder.x[i]! + pts.right_shoulder.x[i]!) / 2,
        (pts.left_shoulder.y[i]! + pts.right_shoulder.y[i]!) / 2,
        (pts.left_ankle.x[i]! + pts.right_ankle.x[i]!) / 2,
        (pts.left_ankle.y[i]! + pts.right_ankle.y[i]!) / 2,
        aspect,
      ),
    ),
  )

  // 4. Events. The hand peak (contact or release) bounds every other search.
  const last = times.length - 1
  const lead = leadSide(handedness)
  const provisionalHand = argMax(speeds.hand)
  const footStrikeIndex = detectFootStrike(pts[`${lead}_ankle`].x, pts[`${lead}_ankle`].y, times, bodyScale, provisionalHand)

  const searchStart = footStrikeIndex !== null ? Math.max(0, footStrikeIndex - Math.round(0.2 * frameRate)) : 0
  const handIndex = argMax(speeds.hand, searchStart, last)
  const searchEnd = Math.min(last, handIndex + Math.round(0.1 * frameRate))

  const peakOf = (segment: SegmentName): SegmentPeak => {
    const index = segment === 'hand' ? handIndex : argMax(speeds[segment], searchStart, searchEnd)
    return { segment, time: times[index]!, speedDegPerSec: Math.round(speeds[segment][index]!) }
  }
  const peaks: Record<SegmentName, SegmentPeak> = {
    pelvis: peakOf('pelvis'),
    torso: peakOf('torso'),
    arm: peakOf('arm'),
    hand: peakOf('hand'),
  }

  const observedOrder = [...IDEAL_ORDER].sort((a, b) => peaks[a].time - peaks[b].time || IDEAL_ORDER.indexOf(a) - IDEAL_ORDER.indexOf(b))
  const sequenceIsIdeal = observedOrder.every((segment, i) => segment === IDEAL_ORDER[i])

  // 5. Separation: hips open further than shoulders.
  const separation = pelvisRotation.map((p, i) => p - torsoRotation[i]!)
  const separationAtFootStrike = footStrikeIndex !== null ? Math.max(0, separation[footStrikeIndex]!) : null
  const maxSeparation = Math.max(0, ...separation.slice(searchStart, handIndex + 1))

  // 6. Quality.
  const meanScore =
    names.reduce((sum, n) => sum + raw[n].score.slice(run.start, run.end + 1).reduce((a, b) => a + b, 0), 0) / (names.length * length)
  const confidence = clamp((length / frames.length) * meanScore, 0, 1)
  const durationSec = times[last]! - times[0]!
  const warnings: QualityWarning[] = []
  if (frameRate < 100) warnings.push('LOW_FRAME_RATE')
  if (footStrikeIndex === null) warnings.push('FOOT_STRIKE_NOT_DETECTED')
  if (confidence < 0.6) warnings.push('LOW_KEYPOINT_CONFIDENCE')
  if (durationSec < 0.5) warnings.push('SHORT_CLIP')

  const ms = (seconds: number) => Math.round(seconds * 1000)
  return {
    algorithm: ALGORITHM_VERSION,
    motionType,
    handedness,
    frameRate: Math.round(frameRate * 10) / 10,
    durationSec: Math.round(durationSec * 1000) / 1000,
    footStrikeTime: footStrikeIndex !== null ? times[footStrikeIndex]! : null,
    peaks: IDEAL_ORDER.map((s) => peaks[s]),
    observedOrder,
    sequenceIsIdeal,
    gapsMs: {
      pelvisToTorso: ms(peaks.torso.time - peaks.pelvis.time),
      torsoToArm: ms(peaks.arm.time - peaks.torso.time),
      armToHand: ms(peaks.hand.time - peaks.arm.time),
    },
    separationAtFootStrikeDeg: separationAtFootStrike !== null ? Math.round(separationAtFootStrike) : null,
    maxSeparationDeg: Math.round(maxSeparation),
    findings: buildFindings(peaks, separationAtFootStrike, frameRate, motionType),
    warnings,
    confidence: Math.round(confidence * 100) / 100,
  }
}
