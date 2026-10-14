import * as THREE from 'three'
import type { HeadShape } from './head'
import { merge, roundedBox, tubeAlong } from './shapes'
import { smoothstep } from './body'

/**
 * Rigid head gear built around the sculpted head: football helmet, facemask, visor, chin strap,
 * batting helmet, cap and headband. Shapes are generic (no manufacturer styling, no logos);
 * colours come from the athlete's gear profile. Head-bone space.
 */

/** A shell around the head: a scaled sphere with regions cut away by `keep(dir)`. */
function shell(head: HeadShape, radii: THREE.Vector3, offset: THREE.Vector3, keep: (d: THREE.Vector3) => boolean, shape?: (d: THREE.Vector3) => number): THREE.BufferGeometry {
  const src = new THREE.SphereGeometry(1, 64, 48)
  const pos = src.getAttribute('position')
  const index = src.getIndex()!.array
  const d = new THREE.Vector3()
  const kept = new Uint8Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i)
    kept[i] = keep(d) ? 1 : 0
    const k = shape ? shape(d) : 1
    pos.setXYZ(i, head.center.x + offset.x + d.x * radii.x * k, head.center.y + offset.y + d.y * radii.y * k, head.center.z + offset.z + d.z * radii.z * k)
  }
  const idx: number[] = []
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!
    const b = index[t + 1]!
    const c = index[t + 2]!
    if (kept[a] && kept[b] && kept[c]) idx.push(a, b, c)
  }
  src.setIndex(idx)
  src.computeVertexNormals()
  return src
}

export interface FootballHelmet {
  shell: THREE.BufferGeometry
  liner: THREE.BufferGeometry
  stripe: THREE.BufferGeometry
  /** Half extents of the shell, for the facemask and hair collisions. */
  half: THREE.Vector3
  center: THREE.Vector3
}

export function footballHelmet(head: HeadShape, H: number): FootballHelmet {
  const half = new THREE.Vector3(0.064 * H, 0.07 * H, 0.075 * H)
  const offset = new THREE.Vector3(0, 0.006 * H, -0.004 * H)
  const keep = (d: THREE.Vector3) => {
    const bottom = d.z < 0 ? -0.42 : Math.abs(d.x) > 0.5 ? -0.64 : -0.42
    if (d.y < bottom) return false
    // Face opening.
    if (d.z > 0.42 && d.y < 0.3 && Math.abs(d.x) < 0.64) return false
    // Ear holes.
    if (Math.abs(d.x) > 0.88 && Math.hypot(d.y + 0.16, d.z + 0.02) < 0.15) return false
    return true
  }
  const flare = (d: THREE.Vector3) => 1 + 0.05 * smoothstep(-0.15, -0.42, d.y) * smoothstep(0.1, -0.5, d.z)
  const outer = shell(head, half, offset, keep, flare)
  const liner = shell(head, half.clone().multiplyScalar(0.93), offset, keep, flare)
  // Liner faces inward so it shows through the openings as padding.
  const li = liner.getIndex()!.array as Uint16Array | Uint32Array
  for (let i = 0; i < li.length; i += 3) {
    const t = li[i + 1]!
    li[i + 1] = li[i + 2]!
    li[i + 2] = t
  }
  liner.getIndex()!.needsUpdate = true
  liner.computeVertexNormals()
  const center = head.center.clone().add(offset)
  // Centre stripe: brow to nape over the crown, riding just above the shell.
  const stripePts: THREE.Vector3[] = []
  for (let k = 0; k <= 16; k++) {
    // From just above the face opening, over the crown, to the back rim.
    const a = 0.22 * Math.PI + (k / 16) * 0.9 * Math.PI
    stripePts.push(new THREE.Vector3(center.x, center.y + Math.sin(a) * half.y * 1.006, center.z + Math.cos(a) * half.z * 1.006))
  }
  const stripe = tubeAlong(stripePts, 0.0038 * H, 48, 8)
  return { shell: outer, liner, stripe, half, center }
}

export type FacemaskStyle = 'open' | 'standard' | 'closed'

export function facemask(head: HeadShape, helmet: FootballHelmet, H: number, style: FacemaskStyle): THREE.BufferGeometry {
  const { center, half } = helmet
  const r = head.radii
  const levels = style === 'closed' ? [-0.18, -0.42, -0.64, -0.86] : style === 'standard' ? [-0.22, -0.5, -0.78] : [-0.3, -0.68]
  const rad = 0.0034 * H
  const bars: THREE.BufferGeometry[] = []
  const span = 1.2
  const point = (phi: number, v: number) => {
    // The mask stands about 3 cm in front of the face and curls under the chin.
    const forward = 1.12 + 0.06 * smoothstep(-0.4, -0.9, v)
    return new THREE.Vector3(center.x + Math.sin(phi) * half.x * 0.98, head.center.y + v * r.y, center.z + Math.cos(phi) * half.z * forward)
  }
  for (const v of levels) {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 14; k++) pts.push(point(-span + (k / 14) * 2 * span, v))
    bars.push(tubeAlong(pts, rad, 40, 8))
  }
  // Side uprights tie the bars to the shell at the jaw flaps.
  for (const s of [1, -1]) {
    const pts = [0.04, ...levels].map((v) => point(s * span, v))
    bars.push(tubeAlong(pts, rad, 24, 8))
  }
  if (style !== 'open') {
    const pts = levels.map((v) => point(0, v))
    bars.push(tubeAlong(pts, rad, 24, 8))
  }
  return merge(bars)
}

/** Tinted or clear eye shield across the face opening. */
export function visorShield(head: HeadShape, helmet: FootballHelmet, H: number): THREE.BufferGeometry {
  const { center, half } = helmet
  const r = head.radii
  const cols = 24
  const rows = 6
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let j = 0; j <= rows; j++) {
    const v = 0.22 - (j / rows) * 0.42
    for (let i = 0; i <= cols; i++) {
      const phi = -0.95 + (i / cols) * 1.9
      pos.push(center.x + Math.sin(phi) * half.x * 0.9, head.center.y + v * r.y, center.z + Math.cos(phi) * half.z * 1.02)
      uv.push(i / cols, j / rows)
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i
      const b = a + cols + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  void H
  return g
}

export function chinStrap(head: HeadShape, helmet: FootballHelmet, H: number): THREE.BufferGeometry {
  const { center, half } = helmet
  const r = head.radii
  const c = head.center
  const cupPos = new THREE.Vector3(c.x, c.y - 0.93 * r.y, c.z + 0.78 * r.z)
  const cup = roundedBox(0.016 * H, 0.008 * H, 0.011 * H, 2.4, 18, 12)
  cup.rotateX(0.5)
  cup.translate(cupPos.x, cupPos.y, cupPos.z)
  const straps: THREE.BufferGeometry[] = [cup]
  for (const s of [1, -1]) {
    const upper = [cupPos.clone().add(new THREE.Vector3(s * 0.012 * H, 0.002 * H, -0.002 * H)), new THREE.Vector3(c.x + s * r.x * 0.95, c.y - 0.62 * r.y, c.z + 0.55 * r.z), new THREE.Vector3(center.x + s * half.x * 0.97, c.y - 0.38 * r.y, center.z + 0.42 * half.z)]
    const lower = [cupPos.clone().add(new THREE.Vector3(s * 0.012 * H, -0.003 * H, -0.006 * H)), new THREE.Vector3(c.x + s * r.x * 0.9, c.y - 0.85 * r.y, c.z + 0.15 * r.z), new THREE.Vector3(center.x + s * half.x * 0.9, c.y - 0.6 * r.y, center.z - 0.05 * half.z)]
    for (const pts of [upper, lower]) {
      const t = tubeAlong(pts, 0.0028 * H, 16, 6)
      straps.push(t)
    }
  }
  return merge(straps)
}

/** A brim: a thin crescent swept around the front of a cap or batting helmet. */
function brim(center: THREE.Vector3, rx: number, rz: number, y: number, depth: number, span: number, thickness: number, droop: number): THREE.BufferGeometry {
  const n = 28
  const ring = 4
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const phi = -span + (i / n) * 2 * span
    const inner = new THREE.Vector3(Math.sin(phi) * rx, 0, Math.cos(phi) * rz)
    const normal = new THREE.Vector3(Math.sin(phi) / rx, 0, Math.cos(phi) / rz).normalize()
    const w = depth * Math.sqrt(Math.max(0, 1 - (phi / span) ** 2))
    const outer = inner.clone().addScaledVector(normal, w)
    const sag = droop * (w / depth)
    const pts = [
      [inner.x, y + thickness / 2, inner.z],
      [outer.x, y + thickness / 2 - sag, outer.z],
      [outer.x, y - thickness / 2 - sag, outer.z],
      [inner.x, y - thickness / 2, inner.z],
    ]
    for (const p of pts) pos.push(center.x + p[0]!, center.y + p[1]!, center.z + p[2]!)
  }
  for (let i = 0; i < n; i++)
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k
      const b = i * ring + ((k + 1) % ring)
      const c = a + ring
      const d = b + ring
      idx.push(a, c, b, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function battingHelmet(head: HeadShape, H: number, flapSide: 1 | -1): THREE.BufferGeometry {
  const half = new THREE.Vector3(0.058 * H, 0.066 * H, 0.066 * H)
  const offset = new THREE.Vector3(0, 0.008 * H, -0.003 * H)
  const keep = (d: THREE.Vector3) => {
    // Ear flap on the side that faces the pitcher, with an ear hole.
    const flap = d.x * flapSide > 0.45 && d.z > -0.35
    if (flap) return d.y > -0.62 && !(Math.hypot(d.y + 0.18, d.z + 0.02) < 0.13 && Math.abs(d.x) > 0.85)
    if (d.z > 0.62) return d.y > 0.12
    return d.y > -0.18
  }
  const outer = shell(head, half, offset, keep)
  const center = head.center.clone().add(offset)
  const b = brim(center, half.x * 0.86, half.z * 0.97, 0.1 * half.y, 0.035 * H, 1.0, 0.004 * H, 0.004 * H)
  return merge([outer, b])
}

export function capGeometry(head: HeadShape, H: number): { crown: THREE.BufferGeometry; brim: THREE.BufferGeometry } {
  const r = head.radii
  const half = new THREE.Vector3(r.x + 0.006 * H, r.y + 0.006 * H, r.z + 0.006 * H)
  const offset = new THREE.Vector3(0, 0.004 * H, 0)
  const crown = shell(head, half, offset, (d) => d.y > (d.z > 0.3 ? 0.22 : 0.02))
  const button = new THREE.SphereGeometry(0.004 * H, 10, 8)
  button.translate(head.center.x, head.center.y + offset.y + half.y, head.center.z)
  const center = head.center.clone().add(offset)
  const b = brim(center, half.x * 0.86, half.z * 0.96, 0.24 * half.y, 0.05 * H, 1.05, 0.003 * H, 0.012 * H)
  return { crown: merge([crown, button]), brim: b }
}

export function headband(head: HeadShape, H: number): THREE.BufferGeometry {
  const r = head.radii
  const c = head.center
  const n = 48
  const pos: number[] = []
  const idx: number[] = []
  const width = 0.02 * H
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const front = Math.max(0, Math.cos(a))
    const y = c.y + (0.3 + 0.12 * front) * r.y
    const k = 1.04
    const x = c.x + Math.sin(a) * r.x * k
    const z = c.z + Math.cos(a) * r.z * k
    pos.push(x, y + width / 2, z, x, y - width / 2, z)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Batter's elbow guard: a curved plate over the lead elbow (elbow-bone space). */
export function elbowGuard(H: number, radius: number, s: 1 | -1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 1.35, radius * 1.3, 0.075 * H, 20, 4, true, -Math.PI * 0.15 + (s > 0 ? 0 : Math.PI), Math.PI * 1.3)
  g.translate(0, 0.004 * H, 0)
  return g
}

/** Batter's shin and ankle guard (knee-bone space). */
export function legGuard(H: number, shin: number, radius: number): THREE.BufferGeometry {
  const plate = new THREE.CylinderGeometry(radius * 1.3, radius * 1.1, shin * 0.36, 20, 3, true, -Math.PI * 0.3, Math.PI * 0.6)
  plate.translate(0, -shin * 0.72, 0.002 * H)
  return plate
}

/** Hinged knee brace uprights on both sides of the knee (thigh part on the hip bone, shin part on the knee bone). */
export function braceBars(H: number, length: number, offsetX: number, upper: boolean): THREE.BufferGeometry {
  const bars: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    const bar = roundedBox(0.003 * H, length / 2, 0.008 * H, 3, 8, 10)
    bar.translate(s * offsetX, upper ? -length / 2 : -length / 2, 0)
    bars.push(bar)
    const hinge = new THREE.CylinderGeometry(0.011 * H, 0.011 * H, 0.008 * H, 16)
    hinge.rotateZ(Math.PI / 2)
    hinge.translate(s * (offsetX + 0.001 * H), upper ? -length : 0, 0)
    bars.push(hinge)
  }
  return merge(bars)
}
