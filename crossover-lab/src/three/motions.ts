import type { MovementSignature } from '../data/types'
import type { Dimensions, JointName } from './rig'

/**
 * Procedural motions. Each returns a Pose: joint rotations in radians (shoulders use Euler
 * order ZXY: axial rotation, then flexion, then abduction) plus a root offset. Every motion is
 * authored for a right-handed athlete facing +Z; `mirror` makes the left-handed version.
 *
 * Sign conventions (raw rotations): hip and shoulder flexion are negative X, knee flexion is
 * positive X, elbow flexion is negative X, forward trunk lean is positive X, and twisting the
 * chest toward the athlete's left is positive Y.
 */
export interface Pose {
  joints: Partial<Record<JointName, [number, number, number]>>
  root: { x: number; y: number; z: number; pitch: number; yaw: number; roll: number }
  /** Prop placement hints, read by the scenes. */
  prop?: { batAngle?: number; batTilt?: number; ballInHand?: boolean; released?: boolean }
}

const D = Math.PI / 180
export const deg = (v: number): number => v * D

export function emptyPose(): Pose {
  return { joints: {}, root: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 } }
}

function set(p: Pose, j: JointName, x = 0, y = 0, z = 0): void {
  p.joints[j] = [x * D, y * D, z * D]
}

function add(p: Pose, j: JointName, x = 0, y = 0, z = 0): void {
  const cur = p.joints[j] ?? [0, 0, 0]
  p.joints[j] = [cur[0] + x * D, cur[1] + y * D, cur[2] + z * D]
}

/** Leg: hip flexion, knee flexion, ankle (positive = toes down). */
function leg(p: Pose, side: 'L' | 'R', hipFlex: number, knee: number, ankle = 0, abduct = 0): void {
  set(p, `hip${side}`, -hipFlex, 0, side === 'L' ? abduct : -abduct)
  set(p, `knee${side}`, knee)
  set(p, `ankle${side}`, ankle)
}

/** Arm: shoulder flexion, abduction, axial rotation, elbow flexion. */
function arm(p: Pose, side: 'L' | 'R', flex: number, abduct: number, elbow: number, axial = 0): void {
  const s = side === 'L' ? 1 : -1
  set(p, `shoulder${side}`, -flex, s * axial, s * abduct)
  set(p, `elbow${side}`, -elbow)
}

function trunk(p: Pose, lean: number, twist = 0, tilt = 0): void {
  set(p, 'spine', lean * 0.55, twist * 0.45, tilt * 0.5)
  set(p, 'chest', lean * 0.45, twist * 0.55, tilt * 0.5)
}

export const smooth = (t: number): number => {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Piecewise keyframes: [[t, value], ...] with smoothstep easing between keys. */
export function keys(t: number, frames: [number, number][]): number {
  if (t <= frames[0]![0]) return frames[0]![1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]!
    const [t0, v0] = frames[i - 1]!
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0 || 1)))
  }
  return frames[frames.length - 1]![1]
}

/**
 * Keep the feet planted for a symmetric crouch: given thigh angle from vertical (forward) and
 * shin angle (knee ahead of ankle), returns how far the hips drop and shift back.
 */
export function crouchOffset(d: Dimensions, thighDeg: number, shinDeg: number): { drop: number; back: number } {
  const t = thighDeg * D
  const s = shinDeg * D
  const drop = d.thigh + d.shin - (d.thigh * Math.cos(t) + d.shin * Math.cos(s))
  const back = d.thigh * Math.sin(t) - d.shin * Math.sin(s)
  return { drop, back }
}

function crouch(p: Pose, d: Dimensions, thighDeg: number, shinDeg: number): void {
  const knee = thighDeg + shinDeg
  leg(p, 'L', thighDeg, knee, -shinDeg)
  leg(p, 'R', thighDeg, knee, -shinDeg)
  const o = crouchOffset(d, thighDeg, shinDeg)
  p.root.y -= o.drop
  p.root.z -= o.back
}

export function mirror(p: Pose): Pose {
  const out = emptyPose()
  out.root = { ...p.root, x: -p.root.x, yaw: -p.root.yaw, roll: -p.root.roll }
  // Prop hints stay as authored; the prop code knows the athlete's hand.
  if (p.prop) out.prop = { ...p.prop }
  for (const [name, r] of Object.entries(p.joints) as [JointName, [number, number, number]][]) {
    const swapped = (name.endsWith('L') ? name.slice(0, -1) + 'R' : name.endsWith('R') ? name.slice(0, -1) + 'L' : name) as JointName
    out.joints[swapped] = [r[0], -r[1], -r[2]]
  }
  return out
}

export function idle(t: number): Pose {
  const p = emptyPose()
  const breathe = Math.sin(t * 1.6)
  trunk(p, 2 + breathe, 0, 0)
  arm(p, 'L', 4 + breathe, 9, 12)
  arm(p, 'R', 4 + breathe, 9, 12)
  leg(p, 'L', 3, 5, -2, 3)
  leg(p, 'R', 3, 5, -2, 3)
  set(p, 'head', -3 + breathe * 0.5)
  return p
}

/** Arms straight out to the sides, for wingspan and body measurements. */
export function measurePose(t: number): Pose {
  const p = emptyPose()
  const breathe = Math.sin(t * 1.6)
  trunk(p, 1 + breathe * 0.5)
  arm(p, 'L', 0, 88, 2)
  arm(p, 'R', 0, 88, 2)
  leg(p, 'L', 0, 2, 0, 6)
  leg(p, 'R', 0, 2, 0, 6)
  return p
}

export type Carry = 'none' | 'footballR' | 'footballL'

/**
 * Running, one cycle = two steps. speed is the share of top speed (0..1); accel adds the deep
 * forward lean of the first steps.
 */
export function run(phase: number, sig: MovementSignature['run'], speed: number, accel = 0, carry: Carry = 'none'): Pose {
  const p = emptyPose()
  const s = Math.max(0.15, Math.min(1, speed))
  const legPose = (ph: number, side: 'L' | 'R') => {
    const a = 2 * Math.PI * ph
    const maxFlex = sig.kneeDriveDeg * Math.sqrt(s)
    const maxExt = 22 * s
    const hip = (maxFlex - maxExt) / 2 + ((maxFlex + maxExt) / 2) * Math.sin(a)
    const swing = Math.max(0, Math.sin(a + 0.9))
    const knee = 18 + (35 + 85 * s) * Math.pow(swing, 1.4)
    const ankle = 10 * Math.sin(a - 1.2)
    leg(p, side, hip, knee, ankle)
  }
  legPose(phase, 'R')
  legPose(phase + 0.5, 'L')
  const armSwing = sig.armSwingDeg * (0.4 + 0.6 * s)
  const armPose = (ph: number, side: 'L' | 'R') => {
    const a = 2 * Math.PI * ph
    arm(p, side, armSwing * Math.sin(a) + 8, 8, 85 + 12 * Math.sin(a + 0.5))
  }
  armPose(phase + 0.5, 'R')
  armPose(phase, 'L')
  if (carry === 'footballR') arm(p, 'R', 18, 12, 110, -20)
  if (carry === 'footballL') arm(p, 'L', 18, 12, 110, -20)
  const lean = sig.leanDeg * (0.4 + 0.6 * s) + 38 * accel
  trunk(p, lean, 9 * Math.sin(2 * Math.PI * phase), 0)
  set(p, 'hips', 0, -10 * Math.sin(2 * Math.PI * phase), 0)
  set(p, 'head', -lean * 0.6)
  p.root.y = 0.035 * s * Math.abs(Math.cos(2 * Math.PI * phase * 2)) - 0.03 * (1 - s) - 0.06 * accel
  return p
}

/** Two-point sprint stance. */
export function sprintStance(d: Dimensions): Pose {
  const p = emptyPose()
  trunk(p, 50, 0, 0)
  leg(p, 'L', 55, 75, -10)
  leg(p, 'R', 15, 45, 10)
  arm(p, 'R', 50, 10, 90)
  arm(p, 'L', -35, 10, 70)
  set(p, 'head', -35)
  p.root.y = -0.07 * d.height
  return p
}

export interface JumpParams {
  height: number
  sig: MovementSignature['jump']
  forward?: number
}

/** Countermovement jump: dip 0-0.3, drive 0.3-0.42, flight to 0.82, landing to 1. */
export function jump(t: number, d: Dimensions, params: JumpParams): Pose {
  const p = emptyPose()
  const dip = keys(t, [[0, 0], [0.28, 1], [0.4, 0], [0.82, 0], [0.88, params.sig.landingKneeFlexDeg / 90], [1, 0.15]])
  const thigh = 70 * dip
  const shin = 32 * dip
  crouch(p, d, thigh, shin)
  const lean = 38 * dip + (params.forward ? 15 * keys(t, [[0.3, 0], [0.45, 1], [0.8, 0.4], [1, 0]]) : 0)
  trunk(p, lean)
  const armF = keys(t, [[0, 0], [0.28, -55 * params.sig.armDrive], [0.42, 165], [0.7, 170], [0.85, 60], [1, 10]])
  arm(p, 'L', armF, 12, 15)
  arm(p, 'R', armF, 12, 15)
  if (params.sig.takeoff === 'one-foot' && !params.forward) {
    const drive = keys(t, [[0.3, 0], [0.42, 1], [0.7, 1], [0.82, 0]])
    add(p, 'hipR', -80 * drive)
    add(p, 'kneeR', 95 * drive)
  }
  const u = (t - 0.42) / 0.4
  const flying = t > 0.42 && t < 0.82
  if (flying) {
    p.root.y += params.height * 4 * u * (1 - u)
    if (!params.forward) {
      // Tuck the knees slightly at the top, like a reach jump.
      add(p, 'hipL', -15 * Math.sin(Math.PI * u))
      add(p, 'kneeL', 25 * Math.sin(Math.PI * u))
      if (params.sig.takeoff === 'two-foot') {
        add(p, 'hipR', -15 * Math.sin(Math.PI * u))
        add(p, 'kneeR', 25 * Math.sin(Math.PI * u))
      }
    }
  }
  if (params.forward) {
    p.root.z += params.forward * smooth((t - 0.38) / 0.46)
    if (flying) {
      const tuck = Math.sin(Math.PI * u)
      add(p, 'hipL', -55 * tuck)
      add(p, 'hipR', -55 * tuck)
      add(p, 'kneeL', 60 * tuck)
      add(p, 'kneeR', 60 * tuck)
    }
  }
  set(p, 'head', -lean * 0.5)
  return p
}

export type ThrowKind = 'football' | 'baseball' | 'pitch' | 'outlet'

export const RELEASE_AT: Record<ThrowKind, number> = { football: 0.58, baseball: 0.58, pitch: 0.62, outlet: 0.56 }

/**
 * Overhand throw for a right-hander toward +Z: closed stance, stride, hip-shoulder separation,
 * layback, internal rotation through release, follow-through.
 */
export function throwMotion(t: number, d: Dimensions, sig: MovementSignature['throw'], kind: ThrowKind): Pose {
  const p = emptyPose()
  const rel = RELEASE_AT[kind]
  const plant = rel - 0.13
  const stride = (sig.strideLengthPctHeight / 100) * d.height * (kind === 'outlet' ? 0.6 : 1)
  const lift = kind === 'pitch' ? keys(t, [[0, 0], [0.22, 1], [0.34, 0.6], [plant, 0]]) : 0
  const step = smooth((t - 0.18) / (plant - 0.18))
  // Pelvis yaw: closed (left side to the target) to square and past.
  const hipYaw = keys(t, [[0, -80], [plant, -55], [rel, 0], [1, 25]])
  const sep = sig.hipShoulderSeparationDeg
  const chestRel = keys(t, [[0, -5], [plant, -sep], [rel, 0], [1, 15]])
  set(p, 'hips', 0, hipYaw)
  const tilt = (sig.armSlotDeg - 60) / 2
  const lean = keys(t, [[0, 5], [plant, 0], [rel, 25], [1, 45]])
  trunk(p, lean, chestRel, keys(t, [[0, 0], [rel, -tilt], [1, -tilt * 0.5]]))
  // Legs, written in the pelvis frame: the stride leg reaches toward the target.
  const leftHip = keys(t, [[0, 5], [0.22, 5 + 80 * (lift > 0 ? 1 : 0)], [plant, 50], [rel, 45], [1, 35]])
  const leftKnee = keys(t, [[0, 10], [0.22, kind === 'pitch' ? 95 : 15], [plant, 25], [rel, 30], [1, 25]])
  leg(p, 'L', leftHip, leftKnee, 0, 10)
  const rightHip = keys(t, [[0, 5], [plant, -10], [rel, -25], [1, 40]])
  const rightKnee = keys(t, [[0, 15], [plant, 35], [rel, 45], [1, 70]])
  leg(p, 'R', rightHip, rightKnee, keys(t, [[0, 0], [rel, 30], [1, 40]]), 0)
  // Throwing arm: abduction ~90°, axial rotation is the layback and the whip.
  const flex = keys(t, [[0, 10], [0.3, -20], [plant, -15], [rel, 25], [rel + 0.1, 90], [1, 110]])
  const abduct = keys(t, [[0, 25], [0.3, 85], [plant, 92], [rel, 95], [rel + 0.1, 70], [1, 40]])
  const axial = keys(t, [[0, 0], [0.3, -60], [plant, -100], [rel - 0.05, -150], [rel, -60], [rel + 0.1, 20], [1, 40]])
  const elbow = keys(t, [[0, 60], [0.3, 90], [plant, 95], [rel - 0.04, 95], [rel, 30], [rel + 0.1, 20], [1, 45]])
  arm(p, 'R', flex, abduct, elbow, axial)
  // Glove arm points at the target, then tucks.
  arm(p, 'L', keys(t, [[0, 30], [plant, 85], [rel, 50], [1, 20]]), keys(t, [[0, 10], [plant, 20], [rel, 35], [1, 40]]), keys(t, [[0, 40], [plant, 35], [rel, 100], [1, 110]]))
  p.root.z = stride * step + keys(t, [[rel, 0], [1, 0.25]])
  p.root.y = -0.03 * d.height * keys(t, [[0, 0], [plant, 1], [rel, 1.2], [1, 0.6]]) + 0.01 * lift
  p.prop = { ballInHand: t < rel, released: t >= rel }
  set(p, 'head', -lean * 0.4, -chestRel * 0.6 - hipYaw * 0.8)
  return p
}

export const CONTACT_AT = 0.6

/** Swing for a right-handed hitter. The pitcher is toward the hitter's left (+X). */
export function swing(t: number, d: Dimensions, sig: MovementSignature['swing']): Pose {
  const p = emptyPose()
  const kick = sig.legKick === 'high' ? 70 : sig.legKick === 'small' ? 30 : sig.legKick === 'toe-tap' ? 12 : 0
  const hipYaw = keys(t, [[0, -5], [0.32, -15], [0.5, -10], [CONTACT_AT, 55], [1, 75]])
  const chestYaw = keys(t, [[0, -5], [0.32, -25], [0.5, -30], [CONTACT_AT, 30], [0.75, 70], [1, 85]])
  set(p, 'hips', 0, hipYaw)
  trunk(p, keys(t, [[0, 18], [CONTACT_AT, 22], [1, 10]]), chestYaw, keys(t, [[0, 0], [CONTACT_AT, 12], [1, 5]]))
  const leftKick = keys(t, [[0, 15], [0.3, 15 + kick], [0.46, 20], [CONTACT_AT, 15]])
  leg(p, 'L', leftKick, keys(t, [[0, 25], [0.3, 25 + kick], [0.46, 15], [CONTACT_AT, 5]]), 0, 20)
  leg(p, 'R', 20, keys(t, [[0, 25], [CONTACT_AT, 35], [1, 25]]), keys(t, [[0, 0], [CONTACT_AT, 35], [1, 45]]), 15)
  // Hands load by the back shoulder, then extend through the zone.
  arm(p, 'R', keys(t, [[0, 45], [0.4, 40], [CONTACT_AT, 75], [0.75, 95], [1, 110]]), keys(t, [[0, 55], [0.4, 60], [CONTACT_AT, 20], [1, 35]]), keys(t, [[0, 100], [0.45, 105], [CONTACT_AT, 35], [0.75, 20], [1, 70]]), keys(t, [[0, -30], [CONTACT_AT, 0], [1, 40]]))
  arm(p, 'L', keys(t, [[0, 60], [0.4, 55], [CONTACT_AT, 85], [0.75, 90], [1, 100]]), keys(t, [[0, -25], [0.4, -30], [CONTACT_AT, -5], [0.75, 20], [1, 45]]), keys(t, [[0, 85], [0.45, 80], [CONTACT_AT, 10], [0.75, 15], [1, 75]]))
  const crouchAmt = 0.04 * d.height
  p.root.y = -crouchAmt
  // Weight shifts back on the load and forward into the stride (toward the pitcher, +X).
  p.root.x = 0.12 * d.height * keys(t, [[0, 0], [0.32, -0.15], [0.5, 0.25], [1, 0.25]])
  p.prop = { batAngle: keys(t, [[0, 0], [0.45, -20], [CONTACT_AT, 90], [0.75, 160], [1, 200]]), batTilt: keys(t, [[0, 65], [0.45, 70], [0.55, 15], [CONTACT_AT, sig.attackAngleDeg], [0.8, -20], [1, -45]]) }
  set(p, 'head', -10, keys(t, [[0, 75], [CONTACT_AT, 70], [1, 40]]))
  return p
}

export const SHOT_RELEASE_AT = 0.5

/** Jump shot: dip, rise, release at the top, land. */
export function shoot(t: number, d: Dimensions, sig: MovementSignature['shoot']): Pose {
  const p = emptyPose()
  const dip = keys(t, [[0, 0.2], [0.22, 1], [0.36, 0], [0.8, 0], [0.9, 0.7], [1, 0.2]])
  crouch(p, d, 45 * dip, 28 * dip)
  trunk(p, 8 * dip + 3)
  const setF = keys(t, [[0, 55], [0.22, 60], [0.38, 110], [SHOT_RELEASE_AT, 150], [0.7, 160], [1, 70]])
  const setE = keys(t, [[0, 100], [0.22, 110], [0.38, 75], [SHOT_RELEASE_AT, 5], [0.7, 5], [1, 60]])
  arm(p, 'R', setF + (sig.releaseAngleDeg - 50) * 0.3, 15, setE)
  arm(p, 'L', keys(t, [[0, 55], [0.38, 100], [SHOT_RELEASE_AT, 120], [0.7, 60], [1, 40]]), keys(t, [[0, 20], [0.38, 30], [1, 15]]), keys(t, [[0, 95], [0.38, 85], [SHOT_RELEASE_AT, 40], [1, 60]]))
  set(p, 'wristR', keys(t, [[0.4, -30], [SHOT_RELEASE_AT, 10], [0.6, 60], [1, 0]]))
  if (sig.jumpOnShot) {
    const u = (t - 0.36) / 0.44
    if (t > 0.36 && t < 0.8) p.root.y += 0.12 * d.height * 4 * u * (1 - u)
  }
  set(p, 'head', -15)
  p.prop = { ballInHand: t < SHOT_RELEASE_AT, released: t >= SHOT_RELEASE_AT }
  return p
}

export type Lift = 'bench' | 'squat' | 'deadlift' | 'clean'

/** One rep, t in 0..1. For the bench the athlete lies on his back (root pitch). */
export function lift(t: number, d: Dimensions, kind: Lift): Pose {
  const p = emptyPose()
  if (kind === 'bench') {
    const down = keys(t, [[0, 0], [0.45, 1], [0.55, 1], [1, 0]])
    p.root.pitch = -Math.PI / 2
    // Lying down: hip extension drops the thighs off the bench toward the floor.
    leg(p, 'L', -35, 75, 10, 18)
    leg(p, 'R', -35, 75, 10, 18)
    arm(p, 'L', 90 - 20 * down, 10 + 55 * down, 95 * down)
    arm(p, 'R', 90 - 20 * down, 10 + 55 * down, 95 * down)
    set(p, 'head', 5)
    return p
  }
  if (kind === 'squat') {
    const down = keys(t, [[0, 0], [0.45, 1], [0.55, 1], [1, 0]])
    crouch(p, d, 95 * down, 35 * down)
    trunk(p, 8 + 32 * down)
    arm(p, 'L', -10, 65, 120, -60)
    arm(p, 'R', -10, 65, 120, -60)
    set(p, 'head', -20 * down)
    return p
  }
  if (kind === 'deadlift') {
    const down = keys(t, [[0, 1], [0.5, 0], [0.6, 0], [1, 1]])
    crouch(p, d, 55 * down, 20 * down)
    const lean = 62 * down + 2
    trunk(p, lean)
    arm(p, 'L', -lean + 4, 8, 0)
    arm(p, 'R', -lean + 4, 8, 0)
    set(p, 'head', -lean * 0.7)
    return p
  }
  // Power clean: pull from the floor, extend, drop under into a front rack, stand.
  const pull = keys(t, [[0, 1], [0.3, 0.45], [0.42, 0], [0.52, 0], [0.62, 0.65], [0.8, 0.65], [1, 0]])
  const rack = smooth((t - 0.46) / 0.12)
  crouch(p, d, 60 * pull, 25 * pull)
  const lean = (1 - rack) * (55 * pull) + rack * 6
  trunk(p, lean)
  const flex = (1 - rack) * (-lean + 4) + rack * 95
  const elbow = (1 - rack) * 0 + rack * 140
  arm(p, 'L', flex, 12 + rack * 15, elbow, -rack * 70)
  arm(p, 'R', flex, 12 + rack * 15, elbow, -rack * 70)
  if (t > 0.38 && t < 0.48) p.root.y += 0.04 * Math.sin(((t - 0.38) / 0.1) * Math.PI)
  set(p, 'head', -lean * 0.6)
  return p
}

/** Sit-and-reach: seated, legs straight, reaching forward by `reach` (0..1). */
export function sitReach(t: number, d: Dimensions, reach: number): Pose {
  const p = emptyPose()
  const r = keys(t, [[0, 0], [0.45, reach], [0.75, reach], [1, 0]])
  leg(p, 'L', 90, 0, -10)
  leg(p, 'R', 90, 0, -10)
  trunk(p, 20 + 55 * r)
  arm(p, 'L', 70 + 15 * r, 8, 5)
  arm(p, 'R', 70 + 15 * r, 8, 5)
  set(p, 'head', -15)
  p.root.y = -(d.hipY - 0.1 * d.height)
  p.root.z = -0.5 * d.thigh
  return p
}

/** A cut: plant, drop the hips, lean away from the new direction. */
export function cut(t: number, d: Dimensions, direction: 1 | -1): Pose {
  const p = emptyPose()
  const plant = keys(t, [[0, 0], [0.4, 1], [0.7, 1], [1, 0]])
  crouch(p, d, 55 * plant, 30 * plant)
  trunk(p, 25 + 15 * plant, 0, direction * 18 * plant)
  arm(p, 'L', 30, 20 + 15 * plant, 80)
  arm(p, 'R', 30, 20 + 15 * plant, 80)
  add(p, direction > 0 ? 'hipR' : 'hipL', 0, 0, (direction > 0 ? -1 : 1) * 25 * plant)
  return p
}

/** Joint angles in degrees for the biomechanics lab, read off a pose. */
export function jointAngles(p: Pose): { kneeL: number; kneeR: number; hipL: number; hipR: number; elbowR: number; elbowL: number; trunkLean: number; trunkTwist: number; hipYaw: number } {
  const j = (name: JointName, axis: 0 | 1 | 2) => (p.joints[name]?.[axis] ?? 0) / D
  return {
    kneeL: j('kneeL', 0),
    kneeR: j('kneeR', 0),
    hipL: -j('hipL', 0),
    hipR: -j('hipR', 0),
    elbowR: -j('elbowR', 0),
    elbowL: -j('elbowL', 0),
    trunkLean: j('spine', 0) + j('chest', 0),
    trunkTwist: j('spine', 1) + j('chest', 1),
    hipYaw: j('hips', 1),
  }
}
