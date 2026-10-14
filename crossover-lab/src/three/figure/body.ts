import * as THREE from 'three'
import type { BodySegment } from '../../data/types'

/**
 * Procedural body for the skinned figure. The torso, neck, arms and legs are sculpted tubes:
 * rings of oval, slightly squared cross-sections whose widths follow anatomical landmarks
 * (glutes, waist, lats, pecs, deltoids, quads, calves) scaled by the athlete's height, build
 * and position. Every vertex is weighted to up to four bones, blended across joints so elbows,
 * knees, hips and shoulders bend smoothly instead of hinging like blocks.
 *
 * Space: the figure stands on y = 0 facing +Z; the athlete's left is +X; metres. Reference
 * figures in comments are for a 1.85 m, 95 kg athlete.
 */
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'] as const
export type BoneName = (typeof BONES)[number]
export const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>

/** Rest-pose measurements, all in metres. */
export interface Frame {
  height: number
  hipY: number
  thigh: number
  shin: number
  ankle: number
  foot: number
  upperArm: number
  forearm: number
  hand: number
  shoulderHalf: number
  hipHalf: number
  girth: number
  belly: number
}

/** Position-based shape multipliers (1 = average pro athlete of that height and weight). */
export interface Morph {
  shoulder: number
  chest: number
  waist: number
  hip: number
  thigh: number
  calf: number
  arm: number
  neck: number
}

export const NEUTRAL_MORPH: Morph = { shoulder: 1, chest: 1, waist: 1, hip: 1, thigh: 1, calf: 1, arm: 1, neck: 1 }

/**
 * Position morphs. These are artistic defaults for how players at each position tend to carry
 * their weight (backs in the legs, linemen in the trunk, guards long and lean); they change
 * shape only, never the measured height, weight or wingspan.
 */
const MORPHS: Record<string, Partial<Morph>> = {
  RB: { thigh: 1.1, hip: 1.05, calf: 1.05, shoulder: 1.03, arm: 1.04, neck: 1.08 },
  WR: { thigh: 0.97, waist: 0.95, arm: 0.96, chest: 0.97 },
  TE: { shoulder: 1.06, chest: 1.06, thigh: 1.04, arm: 1.05, neck: 1.08 },
  QB: { waist: 1.02 },
  DB: { thigh: 0.98, waist: 0.95, arm: 0.96 },
  LB: { shoulder: 1.06, chest: 1.05, thigh: 1.06, neck: 1.12, arm: 1.05 },
  DL: { shoulder: 1.06, chest: 1.08, waist: 1.12, thigh: 1.08, arm: 1.08, neck: 1.14 },
  OL: { shoulder: 1.04, chest: 1.1, waist: 1.2, hip: 1.08, thigh: 1.08, arm: 1.06, neck: 1.14 },
  H: { waist: 1.02, thigh: 1.03 },
  P: { thigh: 1.05, hip: 1.03, arm: 0.98 },
  TWP: { thigh: 1.04, shoulder: 1.02 },
  G: { shoulder: 0.98, chest: 0.96, waist: 0.94, thigh: 0.95, calf: 0.96, arm: 0.95, neck: 0.96 },
  W: { shoulder: 0.99, chest: 0.97, waist: 0.95, thigh: 0.96, arm: 0.96 },
  B: { shoulder: 1.03, chest: 1.03, waist: 0.99, thigh: 0.99, neck: 1.02 },
}

export function morphFor(group: string): Morph {
  return { ...NEUTRAL_MORPH, ...(MORPHS[group] ?? {}) }
}

/** Rest positions of every bone, in figure space. Arms hang straight down, palms in. */
export function restJoints(f: Frame): Record<BoneName, THREE.Vector3> {
  const H = f.height
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
  const hips = V(0, f.hipY)
  const spine = hips.clone().add(V(0, 0.02 * H))
  const chest = spine.clone().add(V(0, 0.14 * H))
  const neck = chest.clone().add(V(0, 0.13 * H))
  const head = neck.clone().add(V(0, 0.03 * H))
  const out = { hips, spine, chest, neck, head } as Record<BoneName, THREE.Vector3>
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const shoulder = chest.clone().add(V(s * f.shoulderHalf, 0.115 * H))
    const elbow = shoulder.clone().add(V(0, -f.upperArm))
    const wrist = elbow.clone().add(V(0, -f.forearm))
    const hip = hips.clone().add(V(s * f.hipHalf, -0.02 * H))
    const knee = hip.clone().add(V(0, -f.thigh))
    const ankle = knee.clone().add(V(0, -f.shin))
    out[`shoulder${side}`] = shoulder
    out[`elbow${side}`] = elbow
    out[`wrist${side}`] = wrist
    out[`hip${side}`] = hip
    out[`knee${side}`] = knee
    out[`ankle${side}`] = ankle
  }
  return out
}

type Part = 'torso' | 'neck' | 'armL' | 'armR' | 'legL' | 'legR'

/** One landmark cross-section of a tube. */
interface Mark {
  center: THREE.Vector3
  rx: number
  rzFront: number
  rzBack: number
  /** Extra radius by angle (θ = 0 is the athlete's left, π/2 is the front, −π/2 the back). */
  bumps?: { at: number; width: number; amp: number }[]
  /** Squareness: 2 = ellipse, higher = boxier. */
  square?: number
}

interface Ring extends Mark {
  weights: [BoneName, number][]
  segment: BodySegment
  along: number
}

/** Per-vertex facts used for heat maps and garments. */
export interface BodyInfo {
  segment: BodySegment[]
  /** 0..1 along the part: top to bottom for limbs and the neck, bottom to top for the torso. */
  along: number[]
  part: Part[]
}

const RADIAL = 36

interface Builder {
  pos: number[]
  uv: number[]
  idx: number[]
  si: number[]
  sw: number[]
  info: BodyInfo
  seams: { base: number; rings: number }[]
  parts: { part: Part; start: number; end: number }[]
}

function pushVertex(b: Builder, x: number, y: number, z: number, u: number, v: number, ring: Ring, part: Part): void {
  b.pos.push(x, y, z)
  b.uv.push(u, v)
  pushWeights(b, ring.weights)
  b.info.segment.push(ring.segment)
  b.info.along.push(ring.along)
  b.info.part.push(part)
}

function ringPoint(ring: Ring, th: number, out: THREE.Vector3): THREE.Vector3 {
  const e = ring.square ?? 2
  const c = Math.cos(th)
  const s = Math.sin(th)
  const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / e)
  const ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / e)
  let bump = 0
  for (const bp of ring.bumps ?? []) {
    let d = Math.abs(th - bp.at)
    d = Math.min(d, Math.PI * 2 - d)
    bump += bp.amp * Math.exp(-(d * d) / (2 * bp.width * bp.width))
  }
  const rz = s >= 0 ? ring.rzFront : ring.rzBack
  return out.set(ring.center.x + sc * (ring.rx + bump), ring.center.y, ring.center.z + ss * (rz + bump))
}

/** Rings run top to bottom (`down`, limbs and neck) or bottom to top (torso). */
function addTube(b: Builder, rings: Ring[], part: Part, down: boolean, capStart: boolean, capEnd: boolean): void {
  const start = b.pos.length / 3
  const p = new THREE.Vector3()
  for (const ring of rings) {
    for (let k = 0; k <= RADIAL; k++) {
      ringPoint(ring, (k / RADIAL) * Math.PI * 2, p)
      pushVertex(b, p.x, p.y, p.z, k / RADIAL, ring.along, ring, part)
    }
  }
  b.seams.push({ base: start, rings: rings.length })
  const row = RADIAL + 1
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < RADIAL; k++) {
      const a = start + r * row + k
      const c = a + row
      // θ runs from +X toward +Z (clockwise seen from above): this winding faces outward when
      // the next ring is lower, and is mirrored when it is higher.
      if (down) b.idx.push(a, a + 1, c, a + 1, c + 1, c)
      else b.idx.push(a, c, a + 1, a + 1, c, c + 1)
    }
  }
  // Caps get their own copy of the ring so the tube's normals stay smooth.
  const cap = (ring: Ring, top: boolean) => {
    const first = b.pos.length / 3
    for (let k = 0; k < RADIAL; k++) {
      const th = (k / RADIAL) * Math.PI * 2
      ringPoint(ring, th, p)
      pushVertex(b, p.x, p.y, p.z, 0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th), ring, part)
    }
    const center = b.pos.length / 3
    pushVertex(b, ring.center.x, ring.center.y, ring.center.z, 0.5, 0.5, ring, part)
    for (let k = 0; k < RADIAL; k++) {
      const a = first + k
      const n = first + ((k + 1) % RADIAL)
      if (top) b.idx.push(center, n, a)
      else b.idx.push(center, a, n)
    }
  }
  if (capStart) cap(rings[0]!, down)
  if (capEnd) cap(rings[rings.length - 1]!, !down)
  b.parts.push({ part, start, end: b.pos.length / 3 })
}

function pushWeights(b: Builder, weights: [BoneName, number][]): void {
  const w = weights.filter(([, v]) => v > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4)
  const total = w.reduce((s, [, v]) => s + v, 0) || 1
  for (let i = 0; i < 4; i++) {
    const entry = w[i]
    b.si.push(entry ? BONE_INDEX[entry[0]] : 0)
    b.sw.push(entry ? entry[1] / total : 0)
  }
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Interpolate landmark rings into a denser tube (Catmull-Rom through the landmarks). */
function densify(marks: Mark[], count: number, finish: (y: number, t: number) => { weights: [BoneName, number][]; segment: BodySegment }): Ring[] {
  const out: Ring[] = []
  const n = marks.length
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const f = t * (n - 1)
    const k = Math.min(n - 2, Math.floor(f))
    const u = f - k
    const p0 = marks[Math.max(0, k - 1)]!
    const p1 = marks[k]!
    const p2 = marks[k + 1]!
    const p3 = marks[Math.min(n - 1, k + 2)]!
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
    // Heights interpolate linearly so rings never fold back on each other.
    const center = new THREE.Vector3(cr(p0.center.x, p1.center.x, p2.center.x, p3.center.x), p1.center.y + (p2.center.y - p1.center.y) * u, cr(p0.center.z, p1.center.z, p2.center.z, p3.center.z))
    const bumps = [...(p1.bumps ?? []).map((bp) => ({ ...bp, amp: bp.amp * (1 - u) })), ...(p2.bumps ?? []).map((bp) => ({ ...bp, amp: bp.amp * u }))]
    out.push({
      center,
      rx: Math.max(0.004, cr(p0.rx, p1.rx, p2.rx, p3.rx)),
      rzFront: Math.max(0.004, cr(p0.rzFront, p1.rzFront, p2.rzFront, p3.rzFront)),
      rzBack: Math.max(0.004, cr(p0.rzBack, p1.rzBack, p2.rzBack, p3.rzBack)),
      square: (p1.square ?? 2) * (1 - u) + (p2.square ?? 2) * u,
      bumps,
      ...finish(center.y, t),
      along: t,
    })
  }
  return out
}

export interface BodyGeometry {
  geometry: THREE.BufferGeometry
  info: BodyInfo
  joints: Record<BoneName, THREE.Vector3>
  frame: Frame
}

/** Build the skinned body (torso, neck, arms, legs). Hands, feet and head are separate meshes. */
export function buildBody(f: Frame, m: Morph): BodyGeometry {
  const H = f.height
  const g = f.girth
  const sg = Math.sqrt(g)
  const J = restJoints(f)
  const b: Builder = { pos: [], uv: [], idx: [], si: [], sw: [], info: { segment: [], along: [], part: [] }, seams: [], parts: [] }
  const yHip = J.hips.y
  const yHipJ = J.hipL.y
  const yChest = J.chest.y
  const ySh = J.shoulderL.y
  const yNeck = J.neck.y
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
  const FRONT = Math.PI / 2
  const BACK = -Math.PI / 2
  const W = H * g
  const sh = f.shoulderHalf

  // Torso, bottom (crotch) to top (base of the neck).
  const torsoMarks: Mark[] = [
    { center: V(0, yHipJ - 0.045 * H, -0.004 * H), rx: 0.05 * W * m.hip, rzFront: 0.04 * W, rzBack: 0.048 * W, square: 2.2 },
    { center: V(0, yHipJ - 0.005 * H, -0.004 * H), rx: 0.08 * W * m.hip, rzFront: 0.05 * W, rzBack: 0.066 * W * m.hip, square: 2.4 },
    { center: V(0, yHip + 0.025 * H, -0.002 * H), rx: 0.079 * W * m.hip, rzFront: 0.052 * W, rzBack: 0.058 * W * m.hip, square: 2.4 },
    { center: V(0, yHip + 0.07 * H), rx: 0.076 * W * m.waist * f.belly, rzFront: 0.052 * W * m.waist * f.belly, rzBack: 0.05 * W, square: 2.3 },
    { center: V(0, yHip + 0.11 * H), rx: 0.08 * W * m.waist * f.belly, rzFront: 0.053 * W * f.belly, rzBack: 0.05 * W, square: 2.3, bumps: [{ at: BACK, width: 0.16, amp: -0.003 * H }] },
    { center: V(0, yChest - 0.005 * H), rx: 0.087 * W * m.chest, rzFront: 0.056 * W, rzBack: 0.055 * W, square: 2.4, bumps: [{ at: BACK, width: 0.16, amp: -0.003 * H }] },
    {
      center: V(0, yChest + 0.035 * H),
      rx: 0.093 * W * m.chest,
      rzFront: 0.06 * W * m.chest,
      rzBack: 0.057 * W,
      square: 2.5,
      bumps: [
        { at: FRONT - 0.55, width: 0.32, amp: 0.006 * H * m.chest },
        { at: FRONT + 0.55, width: 0.32, amp: 0.006 * H * m.chest },
        { at: BACK, width: 0.14, amp: -0.003 * H },
      ],
    },
    {
      center: V(0, yChest + 0.075 * H),
      rx: 0.098 * W * m.shoulder,
      rzFront: 0.057 * W,
      rzBack: 0.056 * W,
      square: 2.6,
      bumps: [
        { at: FRONT - 0.6, width: 0.3, amp: 0.004 * H * m.chest },
        { at: FRONT + 0.6, width: 0.3, amp: 0.004 * H * m.chest },
      ],
    },
    { center: V(0, ySh - 0.004 * H, -0.004 * H), rx: sh * 0.88 * m.shoulder, rzFront: 0.045 * W, rzBack: 0.05 * W, square: 2.3 },
    { center: V(0, ySh + 0.016 * H, -0.008 * H), rx: sh * 0.55 * m.shoulder, rzFront: 0.033 * W, rzBack: 0.043 * W * m.neck, square: 2.2 },
    { center: V(0, yNeck + 0.01 * H, -0.006 * H), rx: 0.034 * H * m.neck * sg, rzFront: 0.03 * H, rzBack: 0.034 * H * m.neck, square: 2 },
  ]
  const torso = densify(torsoMarks, 36, (y) => {
    const wHipsSpine = smoothstep(yHip + 0.035 * H, yHip + 0.1 * H, y)
    const wSpineChest = smoothstep(yChest - 0.03 * H, yChest + 0.03 * H, y)
    const wChestNeck = smoothstep(ySh + 0.006 * H, yNeck + 0.01 * H, y) * 0.6
    const hips = 1 - wHipsSpine
    const spine = wHipsSpine * (1 - wSpineChest)
    const chest = wHipsSpine * wSpineChest * (1 - wChestNeck)
    const neck = wHipsSpine * wSpineChest * wChestNeck
    const segment: BodySegment = y < yHip + 0.05 * H ? 'pelvis' : y < yChest + 0.02 * H ? 'abdomen' : 'chest'
    return { weights: [['hips', hips], ['spine', spine], ['chest', chest], ['neck', neck]], segment }
  })
  addTube(b, torso, 'torso', false, true, false)
  const torsoPart = b.parts[b.parts.length - 1]!
  for (let i = torsoPart.start; i < torsoPart.end; i++) {
    const x = b.pos[i * 3]!
    const y = b.pos[i * 3 + 1]!
    // Deltoid and upper lat follow a raised arm a little.
    const wArm = smoothstep(sh * 0.5, sh * 0.98, Math.abs(x)) * smoothstep(yChest + 0.05 * H, ySh, y) * 0.5
    if (wArm > 0.01) blendIn(b, i, x >= 0 ? 'shoulderL' : 'shoulderR', wArm)
    // Glutes and the top of the thigh follow the leg.
    const wLeg = smoothstep(yHipJ + 0.03 * H, yHipJ - 0.03 * H, y) * smoothstep(0.015 * H, 0.06 * H, Math.abs(x)) * 0.55
    if (wLeg > 0.01) blendIn(b, i, x >= 0 ? 'hipL' : 'hipR', wLeg)
  }

  // Neck, top to bottom so its rings run the same way as the limbs.
  const neckMarks: Mark[] = [
    { center: V(0, J.head.y + 0.03 * H, 0.008 * H), rx: 0.028 * H * m.neck * sg, rzFront: 0.028 * H, rzBack: 0.03 * H },
    { center: V(0, yNeck + 0.02 * H, 0.002 * H), rx: 0.031 * H * m.neck * sg, rzFront: 0.03 * H, rzBack: 0.033 * H * m.neck },
    { center: V(0, yNeck - 0.012 * H, -0.004 * H), rx: 0.036 * H * m.neck * sg, rzFront: 0.032 * H, rzBack: 0.036 * H * m.neck },
  ]
  addTube(
    b,
    densify(neckMarks, 9, (y) => {
      const w = smoothstep(J.head.y - 0.005 * H, J.head.y + 0.025 * H, y)
      const c = 1 - smoothstep(yNeck - 0.012 * H, yNeck + 0.008 * H, y)
      return { weights: [['head', w], ['neck', (1 - w) * (1 - c)], ['chest', (1 - w) * c]], segment: 'neck' }
    }),
    'neck',
    true,
    true,
    false,
  )

  // Arms, from inside the deltoid down to the wrist.
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const shj = J[`shoulder${side}`]
    const el = J[`elbow${side}`]
    const wr = J[`wrist${side}`]
    const a = 0.0185 * H * sg * m.arm
    const marks: Mark[] = [
      { center: V(shj.x - s * 0.03 * H, shj.y + 0.012 * H, -0.002 * H), rx: a * 0.9, rzFront: a * 1.0, rzBack: a * 1.05 },
      { center: V(shj.x - s * 0.008 * H, shj.y + 0.004 * H, -0.001 * H), rx: a * 1.55 * m.shoulder, rzFront: a * 1.5, rzBack: a * 1.55 },
      { center: V(shj.x + s * 0.006 * H, shj.y - 0.012 * H), rx: a * 1.85 * m.shoulder, rzFront: a * 1.72, rzBack: a * 1.78 },
      { center: V(shj.x + s * 0.005 * H, shj.y - 0.045 * H), rx: a * 1.6, rzFront: a * 1.62, rzBack: a * 1.6 },
      { center: V(shj.x + s * 0.003 * H, shj.y - f.upperArm * 0.55), rx: a * 1.42, rzFront: a * 1.48, rzBack: a * 1.5, bumps: [{ at: FRONT, width: 0.5, amp: a * 0.12 }] },
      { center: V(el.x + s * 0.001 * H, el.y + 0.02 * H), rx: a * 1.15, rzFront: a * 1.15, rzBack: a * 1.25 },
      { center: V(el.x, el.y - 0.004 * H), rx: a * 1.1, rzFront: a * 1.08, rzBack: a * 1.2 },
      { center: V(el.x, el.y - f.forearm * 0.24, 0.002 * H), rx: a * 1.18, rzFront: a * 1.38, rzBack: a * 1.3 },
      { center: V(wr.x, wr.y + f.forearm * 0.3, 0.002 * H), rx: a * 0.85, rzFront: a * 1.05, rzBack: a * 1.0 },
      { center: V(wr.x, wr.y + 0.004 * H), rx: a * 0.62, rzFront: a * 0.86, rzBack: a * 0.82 },
    ]
    const rings = densify(marks, 30, (y) => {
      const wChest = 1 - smoothstep(shj.y - 0.012 * H, shj.y + 0.016 * H, y)
      const wElbow = smoothstep(el.y + 0.03 * H, el.y - 0.025 * H, y)
      const wWrist = smoothstep(wr.y + 0.03 * H, wr.y, y) * 0.55
      return {
        weights: [
          [`shoulder${side}`, (1 - wElbow) * wChest],
          ['chest', (1 - wChest) * 0.8],
          [`elbow${side}`, wElbow * (1 - wWrist)],
          [`wrist${side}`, wElbow * wWrist],
        ],
        segment: y > el.y ? `upperArm${side}` : `forearm${side}`,
      }
    })
    addTube(b, rings, side === 'L' ? 'armL' : 'armR', true, true, true)
  }

  // Legs, from inside the pelvis down to the ankle.
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const hp = J[`hip${side}`]
    const kn = J[`knee${side}`]
    const an = J[`ankle${side}`]
    const L = W * m.thigh
    const K = H * sg * m.calf
    const inward = -s * 0.01 * H
    const marks: Mark[] = [
      { center: V(hp.x - s * 0.004 * H, hp.y + 0.045 * H, -0.006 * H), rx: 0.046 * L, rzFront: 0.046 * L, rzBack: 0.05 * L },
      { center: V(hp.x, hp.y - 0.01 * H, -0.004 * H), rx: 0.049 * L, rzFront: 0.049 * L, rzBack: 0.055 * L },
      { center: V(hp.x + inward * 0.3, hp.y - f.thigh * 0.3, 0.002 * H), rx: 0.044 * L, rzFront: 0.045 * L, rzBack: 0.043 * L, bumps: [{ at: FRONT, width: 0.55, amp: 0.003 * L }] },
      { center: V(hp.x + inward * 0.6, hp.y - f.thigh * 0.65, 0.003 * H), rx: 0.037 * L, rzFront: 0.039 * L, rzBack: 0.035 * L, bumps: [{ at: FRONT + s * 0.6, width: 0.4, amp: 0.003 * L }] },
      { center: V(kn.x + inward * 0.85, kn.y + 0.025 * H, 0.004 * H), rx: 0.03 * L, rzFront: 0.032 * L, rzBack: 0.029 * L },
      { center: V(kn.x + inward, kn.y - 0.006 * H, 0.004 * H), rx: 0.028 * K, rzFront: 0.03 * K, rzBack: 0.028 * K },
      { center: V(kn.x + inward, kn.y - f.shin * 0.26, -0.002 * H), rx: 0.031 * K, rzFront: 0.027 * K, rzBack: 0.037 * K, bumps: [{ at: BACK + s * 0.35, width: 0.5, amp: 0.004 * K }] },
      { center: V(an.x + inward, kn.y - f.shin * 0.6, 0), rx: 0.022 * K, rzFront: 0.021 * K, rzBack: 0.025 * K },
      { center: V(an.x + inward, an.y + 0.01 * H, 0), rx: 0.018 * K, rzFront: 0.019 * K, rzBack: 0.02 * K },
    ]
    const rings = densify(marks, 30, (y) => {
      const wPelvis = smoothstep(hp.y - 0.04 * H, hp.y + 0.04 * H, y) * 0.7
      const wKnee = smoothstep(kn.y + 0.035 * H, kn.y - 0.03 * H, y)
      const wAnkle = smoothstep(an.y + 0.035 * H, an.y, y) * 0.5
      return {
        weights: [
          ['hips', wPelvis],
          [`hip${side}`, (1 - wPelvis) * (1 - wKnee)],
          [`knee${side}`, (1 - wPelvis) * wKnee * (1 - wAnkle)],
          [`ankle${side}`, wKnee * wAnkle],
        ],
        segment: y > kn.y ? `thigh${side}` : `shin${side}`,
      }
    })
    addTube(b, rings, side === 'L' ? 'legL' : 'legR', true, false, true)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(b.si, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(b.sw, 4))
  geometry.setIndex(b.idx)
  geometry.computeVertexNormals()
  weldSeams(geometry, b.seams)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return { geometry, info: b.info, joints: J, frame: f }
}

/** Each ring repeats its first vertex at the end for UVs; give both copies the same normal. */
function weldSeams(geometry: THREE.BufferGeometry, seams: { base: number; rings: number }[]): void {
  const n = geometry.getAttribute('normal') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (const { base, rings } of seams) {
    for (let r = 0; r < rings; r++) {
      const a = base + r * (RADIAL + 1)
      const z = a + RADIAL
      v.set(n.getX(a) + n.getX(z), n.getY(a) + n.getY(z), n.getZ(a) + n.getZ(z)).normalize()
      n.setXYZ(a, v.x, v.y, v.z)
      n.setXYZ(z, v.x, v.y, v.z)
    }
  }
  n.needsUpdate = true
}

/** Mix extra weight for one bone into a vertex, keeping the total at 1. */
function blendIn(b: Builder, i: number, bone: BoneName, w: number): void {
  const idx = b.si.slice(i * 4, i * 4 + 4)
  const wt = b.sw.slice(i * 4, i * 4 + 4).map((x) => x * (1 - w))
  const at = idx.findIndex((x, k) => x === BONE_INDEX[bone] && wt[k]! > 0)
  if (at >= 0) wt[at] = wt[at]! + w
  else {
    const min = wt.indexOf(Math.min(...wt))
    idx[min] = BONE_INDEX[bone]
    wt[min] = w
  }
  const total = wt.reduce((s, x) => s + x, 0) || 1
  for (let k = 0; k < 4; k++) {
    b.si[i * 4 + k] = idx[k]!
    b.sw[i * 4 + k] = wt[k]! / total
  }
}

/**
 * A garment shell: body triangles pushed out along their normals by `thickness`. It shares the
 * body's skin weights, so it moves with the skeleton. `keep` either accepts or rejects whole
 * triangles (boolean) or returns a signed distance (>= 0 inside the garment); with distances,
 * triangles that straddle the edge are clipped exactly, so necklines, arm holes and hems are
 * clean curves instead of stair steps. `userData.source` maps each shell vertex back to its
 * nearest body vertex (for heat maps).
 */
export function shellFrom(body: BodyGeometry, keep: (i: number, p: THREE.Vector3) => boolean | number, thickness: (i: number, p: THREE.Vector3, n: THREE.Vector3) => number): THREE.BufferGeometry | null {
  const src = body.geometry
  const pos = src.getAttribute('position')
  const nor = src.getAttribute('normal')
  const uv = src.getAttribute('uv')
  const si = src.getAttribute('skinIndex')
  const sw = src.getAttribute('skinWeight')
  const index = src.getIndex()!.array
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const dist = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const k = keep(i, p.fromBufferAttribute(pos, i))
    dist[i] = typeof k === 'number' ? k : k ? 1 : -1
  }
  const thick = new Float32Array(pos.count).fill(NaN)
  const thicknessAt = (i: number) => {
    if (Number.isNaN(thick[i]!)) thick[i] = thickness(i, p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nor, i))
    return thick[i]!
  }
  const P: number[] = []
  const U: number[] = []
  const SI: number[] = []
  const SW: number[] = []
  const I: number[] = []
  const source: number[] = []
  const map = new Map<string, number>()
  const weightsOf = (i: number, scale: number, into: Map<number, number>) => {
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c) * scale
      if (w <= 0) continue
      const b = si.getComponent(i, c)
      into.set(b, (into.get(b) ?? 0) + w)
    }
  }
  /** A shell vertex at body vertex i, or at fraction t along the edge i→j. */
  const vert = (i: number, j = i, t = 0) => {
    const key = i === j || t === 0 ? `${i}` : t === 1 ? `${j}` : i < j ? `${i}:${j}:${t.toFixed(5)}` : `${j}:${i}:${(1 - t).toFixed(5)}`
    const hit = map.get(key)
    if (hit !== undefined) return hit
    const a = new THREE.Vector3().fromBufferAttribute(pos, i)
    const b = new THREE.Vector3().fromBufferAttribute(pos, j)
    const na = new THREE.Vector3().fromBufferAttribute(nor, i)
    const nb = new THREE.Vector3().fromBufferAttribute(nor, j)
    const point = a.lerp(b, t)
    const normal = na.lerp(nb, t).normalize()
    const th = thicknessAt(i) * (1 - t) + thicknessAt(j) * t
    P.push(point.x + normal.x * th, point.y + normal.y * th, point.z + normal.z * th)
    U.push(uv.getX(i) * (1 - t) + uv.getX(j) * t, uv.getY(i) * (1 - t) + uv.getY(j) * t)
    const w = new Map<number, number>()
    weightsOf(i, 1 - t, w)
    weightsOf(j, t, w)
    const top = [...w.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
    const total = top.reduce((acc, [, v]) => acc + v, 0) || 1
    for (let c = 0; c < 4; c++) {
      SI.push(top[c]?.[0] ?? 0)
      SW.push(top[c] ? top[c]![1] / total : 0)
    }
    source.push(t < 0.5 ? i : j)
    const id = P.length / 3 - 1
    map.set(key, id)
    return id
  }
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t]!, index[t + 1]!, index[t + 2]!]
    const d = tri.map((i) => dist[i]!)
    if (d.every((x) => x >= 0)) {
      I.push(vert(tri[0]!), vert(tri[1]!), vert(tri[2]!))
      continue
    }
    if (d.every((x) => x < 0)) continue
    // Clip the triangle against d = 0 (Sutherland–Hodgman), keeping the winding.
    const poly: number[] = []
    for (let k = 0; k < 3; k++) {
      const i = tri[k]!
      const j = tri[(k + 1) % 3]!
      const di = d[k]!
      const dj = d[(k + 1) % 3]!
      if (di >= 0) poly.push(vert(i))
      if (di >= 0 !== dj >= 0) poly.push(vert(i, j, di / (di - dj)))
    }
    for (let k = 1; k + 1 < poly.length; k++) I.push(poly[0]!, poly[k]!, poly[k + 1]!)
  }
  if (!I.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4))
  geo.setIndex(I)
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  geo.userData.source = Int32Array.from(source)
  return geo
}
