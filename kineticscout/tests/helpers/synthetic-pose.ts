import type { PoseFrame, PoseTrack } from '@/lib/biomechanics/types'

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

export type SyntheticSwing = {
  fps?: number
  duration?: number
  /** Center times (s) of each segment's rotation, i.e. when its angular speed peaks. */
  pelvisPeak: number
  torsoPeak: number
  armPeak: number
  handPeak: number
  /** Time the lead foot lands after the stride. */
  footStrike: number
  /** Rotation time constant (s). */
  tau?: number
  score?: number
}

/**
 * Builds a face-on pose track for a right-handed hitter (lead side = left) whose segment
 * rotations follow logistic curves, so each segment's angular speed peaks at a known time.
 */
export function syntheticSwing(spec: SyntheticSwing): PoseTrack {
  const fps = spec.fps ?? 240
  const duration = spec.duration ?? 0.8
  const tau = spec.tau ?? 0.025
  const score = spec.score ?? 0.9
  const deg = Math.PI / 180
  const aspect = 9 / 16
  // Geometry is defined in true proportions (units of frame height); horizontal offsets are
  // converted to normalized x by dividing by the aspect ratio, as a real camera would.
  const nx = (offset: number) => offset / aspect
  const frames: PoseFrame[] = []

  for (let i = 0; i * (1 / fps) <= duration; i++) {
    const t = i / fps
    const pelvis = 80 * deg * sigmoid((t - spec.pelvisPeak) / tau)
    const torso = 85 * deg * sigmoid((t - spec.torsoPeak) / tau)
    const upperArm = -20 * deg + 110 * deg * sigmoid((t - spec.armPeak) / tau)
    const forearm = 10 * deg + 150 * deg * sigmoid((t - spec.handPeak) / tau)

    const hipHalf = nx((0.12 * Math.cos(pelvis)) / 2)
    const shoulderHalf = nx((0.16 * Math.cos(torso)) / 2)
    const cx = 0.5

    // Lead (left) ankle lifts during the stride and lands at footStrike.
    const strideStart = spec.footStrike - 0.18
    let leadAnkleY = 0.92
    if (t > strideStart && t < spec.footStrike) {
      leadAnkleY = 0.92 - 0.06 * Math.sin((Math.PI * (t - strideStart)) / (spec.footStrike - strideStart))
    }
    const leadAnkleX = t < strideStart ? 0.42 : t > spec.footStrike ? 0.36 : 0.42 - 0.06 * ((t - strideStart) / (spec.footStrike - strideStart))

    const lShoulder = { x: cx - shoulderHalf, y: 0.35 }
    const lElbow = { x: lShoulder.x + nx(0.1 * Math.cos(upperArm)), y: lShoulder.y + 0.1 * Math.sin(upperArm) }
    const lWrist = { x: lElbow.x + nx(0.09 * Math.cos(forearm)), y: lElbow.y + 0.09 * Math.sin(forearm) }

    const kp = (x: number, y: number) => ({ x, y, score })
    frames.push({
      t,
      keypoints: {
        left_shoulder: kp(lShoulder.x, lShoulder.y),
        right_shoulder: kp(cx + shoulderHalf, 0.35),
        left_elbow: kp(lElbow.x, lElbow.y),
        left_wrist: kp(lWrist.x, lWrist.y),
        right_elbow: kp(cx + shoulderHalf + 0.03, 0.45),
        right_wrist: kp(cx + shoulderHalf + 0.02, 0.52),
        left_hip: kp(cx - hipHalf, 0.58),
        right_hip: kp(cx + hipHalf, 0.58),
        left_knee: kp(0.44, 0.75),
        right_knee: kp(0.56, 0.75),
        left_ankle: kp(leadAnkleX, leadAnkleY),
        right_ankle: kp(0.58, 0.92),
      },
    })
  }
  return { aspectRatio: aspect, frames }
}
