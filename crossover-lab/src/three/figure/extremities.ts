import * as THREE from 'three'
import { limbCapsule, loftZ, merge, roundedBox, type Section } from './shapes'

/**
 * Hands, feet and what goes on them. Hands are built in wrist-bone space hanging down (−Y) with
 * the palm facing the body and the thumb forward; feet in ankle-bone space with the heel back
 * (−Z) and the sole on the floor. `s` is +1 for the left side (+X), −1 for the right.
 */
export interface HandDims {
  H: number
  length: number
  s: 1 | -1
  /** Extra radius for gloves. */
  inflate?: number
  /** 0 = relaxed, 1 = closed grip. */
  curl?: number
}

const FINGERS = [
  { z: 0.0165, len: 0.92, r: 0.0047 },
  { z: 0.0055, len: 1, r: 0.0049 },
  { z: -0.0055, len: 0.95, r: 0.0046 },
  { z: -0.0158, len: 0.76, r: 0.0041 },
]

export function handGeometry({ H, length, s, inflate = 0, curl = 0.25 }: HandDims): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const palmLen = 0.53 * length
  // The palm reaches up into the end of the forearm so the wrist never shows a gap.
  const reach = 0.008 * H
  const palmHalf = palmLen / 2 + reach / 2 + 0.001 * H
  const palm = roundedBox(0.0085 * H + inflate, palmHalf, 0.0235 * H + inflate, 3, 20, 14)
  const p = palm.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, (palmHalf - p.getY(i)) / (2 * palmHalf))
    // Narrow at the wrist, widest across the knuckles; the palm side is fleshier.
    p.setZ(i, p.getZ(i) * (0.8 + 0.2 * t))
    if (-s * p.getX(i) > 0) p.setX(i, p.getX(i) * 1.15)
  }
  palm.computeVertexNormals()
  palm.translate(-s * 0.0008 * H, reach - palmHalf, 0.0015 * H)
  parts.push(palm)
  const fingerLen = 0.47 * length
  for (const f of FINGERS) {
    const len = fingerLen * f.len
    const segs = [0.46, 0.3, 0.24].map((k) => k * len)
    let at = new THREE.Vector3(-s * 0.001 * H, -palmLen - 0.002 * H, f.z * H)
    let angle = 0
    let r = (f.r * H) + inflate
    segs.forEach((seg, k) => {
      angle += (0.22 + 0.25 * k) * (0.4 + curl * 1.6)
      // Fingers flex toward the palm (−s·X).
      const dir = new THREE.Vector3(-s * Math.sin(angle), -Math.cos(angle), 0)
      const next = at.clone().addScaledVector(dir, seg)
      parts.push(limbCapsule(at, next, r, r * 0.92, 10))
      at = next
      r *= 0.9
    })
  }
  // Thumb: from the base of the palm, forward and down, turned toward the fingers.
  const t0 = new THREE.Vector3(-s * 0.004 * H, -0.12 * length, 0.017 * H)
  const t1 = new THREE.Vector3(-s * (0.009 + 0.004 * curl) * H, -0.3 * length, 0.03 * H)
  const t2 = new THREE.Vector3(-s * (0.013 + 0.008 * curl) * H, -0.42 * length, 0.034 * H - curl * 0.006 * H)
  const t3 = new THREE.Vector3(-s * (0.016 + 0.012 * curl) * H, -0.51 * length, 0.032 * H - curl * 0.012 * H)
  parts.push(limbCapsule(t0, t1, 0.0075 * H + inflate, 0.0062 * H + inflate, 10))
  parts.push(limbCapsule(t1, t2, 0.0062 * H + inflate, 0.0056 * H + inflate, 10))
  parts.push(limbCapsule(t2, t3, 0.0056 * H + inflate, 0.005 * H + inflate, 10))
  return merge(parts)
}

/** Fingernails, as small flat caps on the fingertips (bare hands only). */
export function nailGeometry({ H, length, s, curl = 0.25 }: HandDims): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const palmLen = 0.53 * length
  const fingerLen = 0.47 * length
  for (const f of FINGERS) {
    const len = fingerLen * f.len
    let at = new THREE.Vector3(-s * 0.001 * H, -palmLen - 0.002 * H, f.z * H)
    let angle = 0
    let dir = new THREE.Vector3()
    ;[0.46, 0.3, 0.24].forEach((k, i) => {
      angle += (0.22 + 0.25 * i) * (0.4 + curl * 1.6)
      dir = new THREE.Vector3(-s * Math.sin(angle), -Math.cos(angle), 0)
      at = at.clone().addScaledVector(dir, k * len)
    })
    const nail = roundedBox(0.0012 * H, 0.0042 * H, 0.0034 * H, 2.4, 10, 8)
    const back = new THREE.Vector3(s * Math.cos(angle), -Math.sin(angle), 0)
    nail.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir))
    const c = at.clone().addScaledVector(dir, -0.004 * H).addScaledVector(back, f.r * H * 0.85)
    nail.translate(c.x, c.y, c.z)
    parts.push(nail)
  }
  return merge(parts)
}

/** A fielder's glove on the catching hand: a deep pocket, finger stalls and laced webbing. */
export function mittGeometry(H: number, length: number, s: 1 | -1): { leather: THREE.BufferGeometry; laces: THREE.BufferGeometry } {
  const pocket = roundedBox(0.017 * H, 0.08 * H, 0.04 * H, 2.4, 22, 16)
  const p = pocket.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    // Cup the palm side.
    const x = p.getX(i)
    const z = p.getZ(i)
    if (-s * x > 0) p.setX(i, x - s * 0.008 * H * (1 - (z / (0.04 * H)) ** 2))
  }
  pocket.computeVertexNormals()
  pocket.translate(-s * 0.006 * H, -0.075 * H, 0.004 * H)
  const stalls = roundedBox(0.012 * H, 0.06 * H, 0.036 * H, 2.6, 22, 14)
  stalls.rotateX(-0.08)
  stalls.translate(-s * 0.009 * H, -0.165 * H, -0.004 * H)
  const thumb = limbCapsule(new THREE.Vector3(-s * 0.006 * H, -0.05 * H, 0.032 * H), new THREE.Vector3(-s * 0.02 * H, -0.15 * H, 0.05 * H), 0.012 * H, 0.009 * H, 12)
  const web = roundedBox(0.004 * H, 0.04 * H, 0.016 * H, 3, 12, 10)
  web.rotateX(0.35)
  web.translate(-s * 0.02 * H, -0.15 * H, 0.04 * H)
  const cuff = new THREE.CylinderGeometry(0.03 * H, 0.032 * H, 0.03 * H, 24, 1, true)
  cuff.scale(0.62, 1, 1)
  cuff.translate(0, -0.012 * H, 0.002 * H)
  const laceParts: THREE.BufferGeometry[] = []
  for (let k = 0; k < 7; k++) {
    const lace = limbCapsule(new THREE.Vector3(-s * 0.02 * H, -0.205 * H + k * 0.012 * H, -0.03 * H + k * 0.002 * H), new THREE.Vector3(-s * 0.02 * H, -0.2 * H + k * 0.012 * H, 0.03 * H), 0.0016 * H, 0.0016 * H, 6)
    laceParts.push(lace)
  }
  void length
  return { leather: merge([pocket, stalls, thumb, web, cuff]), laces: merge(laceParts) }
}

export interface FootDims {
  H: number
  /** Foot length. */
  F: number
  /** Ankle joint height above the sole. */
  A: number
  s: 1 | -1
}

function footSections({ H, F, A, s }: FootDims, grow = 0, lift = 0): Section[] {
  const S = (t: number, top: number, bottom: number, hw: number, medial: number): Section => ({
    t: t * F,
    cx: -s * medial * H,
    cy: (top + bottom) / 2,
    hw: hw * H + grow,
    hh: (top - bottom) / 2 + grow,
    e: 2.5,
    flatBottom: 0.7,
  })
  const floor = -A + lift
  return [
    S(-0.25, floor + 0.026 * H, floor, 0.012, 0),
    S(-0.22, floor + 0.04 * H, floor, 0.019, 0),
    S(-0.14, 0.012 * H, floor, 0.022, 0),
    S(-0.02, 0.016 * H, floor, 0.024, 0.001),
    S(0.14, floor + 0.05 * H, floor, 0.025, 0.002),
    S(0.32, floor + 0.04 * H, floor, 0.027, 0.003),
    S(0.48, floor + 0.03 * H, floor, 0.028, 0.004),
    S(0.62, floor + 0.022 * H, floor, 0.026, 0.005),
    S(0.71, floor + 0.016 * H, floor + 0.001 * H, 0.02, 0.006),
    S(0.75, floor + 0.01 * H, floor + 0.002 * H, 0.01, 0.006),
  ]
}

export function footGeometry(d: FootDims): THREE.BufferGeometry {
  return loftZ(footSections(d), 28)
}

export type ShoeKind = 'cleat' | 'spike' | 'turf' | 'court'

export interface ShoeParts {
  upper: THREE.BufferGeometry
  sole: THREE.BufferGeometry
  studs: THREE.BufferGeometry | null
  laces: THREE.BufferGeometry
  /** Height the shoe adds under the foot. */
  lift: number
}

export function soleThickness(kind: ShoeKind, H: number): number {
  return (kind === 'court' ? 0.014 : kind === 'turf' ? 0.011 : 0.008) * H + (kind === 'cleat' || kind === 'spike' ? 0.006 * H : 0)
}

export function shoeGeometry(d: FootDims, kind: ShoeKind): ShoeParts {
  const { H, F, A, s } = d
  const studH = kind === 'cleat' || kind === 'spike' ? 0.006 * H : 0
  const lift = soleThickness(kind, H)
  const sole = lift - studH
  const upper = loftZ(
    footSections(d, 0.0035 * H).map((sec) => ({ ...sec, cy: sec.cy + 0.002 * H })),
    28,
  )
  // Midsole and outsole: a slab under the foot, wider than the upper, with toe spring.
  const floor = -A
  const soleSecs: Section[] = footSections(d, 0.006 * H).map((sec, i, all) => {
    const toe = Math.max(0, (i - (all.length - 4)) / 3)
    const top = floor + 0.004 * H + toe * 0.006 * H
    const bottom = floor - sole + toe * 0.008 * H
    return { ...sec, cy: (top + bottom) / 2, hh: (top - bottom) / 2, hw: sec.hw, e: 3.2, flatBottom: 0.2 }
  })
  const soleGeo = loftZ(soleSecs, 28)
  let studs: THREE.BufferGeometry | null = null
  if (studH > 0) {
    const spots: [number, number][] =
      kind === 'spike'
        ? [[-0.16, 0], [-0.08, 0.6], [-0.08, -0.6], [0.36, 0.75], [0.36, -0.75], [0.5, 0.5], [0.5, -0.5], [0.66, 0]]
        : [[-0.18, 0.55], [-0.18, -0.55], [-0.06, 0], [0.3, 0.7], [0.3, -0.7], [0.48, 0.75], [0.48, -0.75], [0.62, 0.1]]
    const parts = spots.map(([t, side]) => {
      const sec = soleSecs.reduce((best, c) => (Math.abs(c.t - t * F) < Math.abs(best.t - t * F) ? c : best), soleSecs[0]!)
      const stud = kind === 'spike' ? new THREE.BoxGeometry(0.009 * H, studH, 0.0016 * H) : new THREE.CylinderGeometry(0.0026 * H, 0.0036 * H, studH, 10)
      stud.translate(sec.cx + side * sec.hw * 0.7, floor - sole - studH / 2, t * F)
      return stud
    })
    studs = merge(parts)
  }
  const laceParts: THREE.BufferGeometry[] = []
  const secs = footSections(d, 0.0035 * H)
  // Top of the upper at t, interpolated the same way the loft is.
  const topAt = (t: number) => {
    for (let i = 0; i < secs.length - 1; i++) {
      const a = secs[i]!
      const b = secs[i + 1]!
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / (b.t - a.t)
        return { y: a.cy + a.hh + (b.cy + b.hh - a.cy - a.hh) * u + 0.002 * H, x: a.cx + (b.cx - a.cx) * u, hw: a.hw + (b.hw - a.hw) * u }
      }
    }
    const last = secs[secs.length - 1]!
    return { y: last.cy + last.hh + 0.002 * H, x: last.cx, hw: last.hw }
  }
  for (let k = 0; k < 6; k++) {
    const t = (0.04 + k * 0.065) * F
    const top = topAt(t)
    const lace = new THREE.BoxGeometry(top.hw * 0.75, 0.0014 * H, 0.0032 * H)
    lace.rotateX(-0.2)
    lace.translate(top.x, top.y - 0.0002 * H, t)
    laceParts.push(lace)
  }
  void s
  return { upper, sole: merge([soleGeo]), studs, laces: merge(laceParts), lift }
}

/** Mid- and high-top collars wrap the lower shin (knee-bone space). */
export function collarGeometry(H: number, shin: number, A: number, style: 'mid' | 'high', ankleRadius: number): THREE.BufferGeometry {
  const h = (style === 'high' ? 0.05 : 0.03) * H
  const g = new THREE.CylinderGeometry(ankleRadius + 0.006 * H, ankleRadius + 0.009 * H, h, 28, 1, true)
  g.scale(1, 1, 1.1)
  g.translate(0, -shin + A * 0.4 + h / 2, -0.002 * H)
  return g
}
