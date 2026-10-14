import * as THREE from 'three'
import type { FacialHair, HairStyle } from '../../data/types'
import { merge, mirrorX, offsetSubset, roundedBox, tubeAlong } from './shapes'
import { smoothstep } from './body'

/**
 * Generic sculpted head. Proportions follow the athlete's height (head height about 13% of
 * stature) and the brow, eye sockets, nose, cheekbones, lips, jaw and chin are sculpted into
 * the surface, but the face is a neutral generic sculpt: it is not a scan or a likeness of
 * anyone. Real faces come only from rights-cleared scans (see figure/scan.ts).
 *
 * Space: head-bone local, origin at the top of the neck, facing +Z.
 */
export interface HeadShape {
  geometry: THREE.BufferGeometry
  /** Unit-sphere direction of each vertex before sculpting, used for region masks. */
  dir: Float32Array
  center: THREE.Vector3
  radii: THREE.Vector3
  /** Eye centres (left, right) in head space. */
  eyes: [THREE.Vector3, THREE.Vector3]
  eyeRadius: number
}

const g = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-((x - cx) ** 2) / (2 * sx * sx) - ((y - cy) ** 2) / (2 * sy * sy))

export function sculptHead(H: number, jaw = 1): HeadShape {
  const center = new THREE.Vector3(0, 0.062 * H, 0.004 * H)
  const radii = new THREE.Vector3(0.041 * H, 0.064 * H, 0.052 * H)
  const geo = new THREE.SphereGeometry(1, 72, 54)
  const p = geo.getAttribute('position')
  const dir = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    dir[i * 3] = x
    dir[i * 3 + 1] = y
    dir[i * 3 + 2] = z
    const front = smoothstep(0.1, 0.7, z)
    // Jaw: the lower face narrows toward the chin; the jaw angle stays wide on big builds.
    const lower = smoothstep(0.05, -0.95, y)
    x *= 1 - lower * (0.3 - 0.08 * (jaw - 1)) * (0.5 + 0.5 * front)
    // Back of the skull bulges; under it, the skull tucks in to meet the neck.
    if (z < 0) z *= 1 + 0.06 * smoothstep(-0.4, 0.4, y) - 0.22 * smoothstep(-0.2, -0.9, y)
    // Face plane: flatten the front a little and push the lower face forward.
    if (z > 0) z *= 1 - 0.1 * front * smoothstep(-0.2, 0.5, y) + 0.06 * front * lower
    // Temples are slightly flat.
    x *= 1 - 0.05 * smoothstep(0.1, 0.5, y) * smoothstep(0.2, 0.7, Math.abs(p.getX(i)))
    let d = 0
    if (z > 0.2) {
      const u = p.getX(i)
      const v = y
      const facing = smoothstep(0.2, 0.75, z)
      // Brow ridge, eye sockets, nose, cheekbones, lips, mouth line, chin.
      d += 0.045 * g(Math.abs(u), v, 0.28, 0.16, 0.22, 0.06)
      d -= 0.07 * g(Math.abs(u), v, 0.33, 0.03, 0.13, 0.08)
      const nose = smoothstep(0.08, -0.26, v) * (1 - smoothstep(-0.3, -0.36, v))
      d += (0.05 + 0.15 * nose) * g(u, v, 0, -0.12, 0.07 + 0.05 * nose, 0.2)
      d += 0.05 * g(Math.abs(u), v, 0.11, -0.3, 0.06, 0.04)
      d += 0.05 * g(Math.abs(u), v, 0.55, -0.1, 0.15, 0.12)
      d += 0.05 * g(u, v, 0, -0.47, 0.2, 0.04)
      d -= 0.025 * g(u, v, 0, -0.535, 0.22, 0.015)
      d += 0.045 * g(u, v, 0, -0.6, 0.17, 0.04)
      d -= 0.02 * g(u, v, 0, -0.69, 0.14, 0.03)
      d += 0.07 * g(u, v, 0, -0.84, 0.2, 0.07)
      d *= facing
    }
    const r = 1 + d
    p.setXYZ(i, center.x + x * r * radii.x, center.y + y * r * radii.y, center.z + z * r * radii.z)
  }
  geo.computeVertexNormals()
  const eyeRadius = 0.0068 * H
  const eye = (s: number) => new THREE.Vector3(center.x + s * 0.33 * radii.x, center.y + 0.03 * radii.y, center.z + 0.8 * radii.z)
  return { geometry: geo, dir, center, radii, eyes: [eye(1), eye(-1)], eyeRadius }
}

/** Ears: soft, slightly cupped shells on both sides. */
export function ears(head: HeadShape): THREE.BufferGeometry {
  const { center, radii } = head
  const one = roundedBox(radii.x * 0.18, radii.y * 0.42, radii.z * 0.3, 2.4, 16, 12)
  one.rotateY(-0.18)
  one.rotateZ(-0.1)
  one.translate(center.x + radii.x * 0.92, center.y - radii.y * 0.04, center.z - radii.z * 0.08)
  return merge([one, mirrorX(one)])
}

/** Lips as their own mesh so they can take a lip tint. */
export function lips(head: HeadShape): THREE.BufferGeometry {
  const { center, radii } = head
  const upper = roundedBox(radii.x * 0.25, radii.y * 0.03, radii.z * 0.045, 2.2, 20, 10)
  upper.translate(center.x, center.y - radii.y * 0.49, center.z + radii.z * 0.94)
  const lower = roundedBox(radii.x * 0.22, radii.y * 0.034, radii.z * 0.05, 2.2, 20, 10)
  lower.translate(center.x, center.y - radii.y * 0.585, center.z + radii.z * 0.925)
  return merge([upper, lower])
}

export function brows(head: HeadShape): THREE.BufferGeometry {
  const { center, radii } = head
  const one = (s: number) =>
    tubeAlong(
      [0.13, 0.27, 0.42, 0.52].map((u, k) => new THREE.Vector3(center.x + s * u * radii.x, center.y + (0.17 + [0, 0.025, 0.02, -0.01][k]!) * radii.y, center.z + (0.94 - u * u * 0.5) * radii.z)),
      radii.y * 0.016,
      16,
      6,
    ).scale(1, 0.7, 1)
  return merge([one(1), one(-1)])
}

/** Facial hair sits on the sculpted surface, pushed out slightly. */
export function facialHair(head: HeadShape, style: FacialHair): THREE.BufferGeometry | null {
  if (style === 'none') return null
  const { dir } = head
  const mouth = (x: number, y: number) => Math.abs(x) < 0.25 && y < -0.42 && y > -0.64
  const keep = (i: number) => {
    const x = dir[i * 3]!
    const y = dir[i * 3 + 1]!
    const z = dir[i * 3 + 2]!
    if (z < 0.05) return false
    switch (style) {
      case 'mustache':
        return z > 0.6 && Math.abs(x) < 0.3 && y < -0.38 && y > -0.5
      case 'goatee':
        if (mouth(x, y) && y < -0.5) return false
        return z > 0.45 && ((Math.abs(x) < 0.3 && y < -0.38 && y > -0.5) || (Math.abs(x) < 0.27 + (y < -0.6 ? 0.04 : 0) && y < -0.5 && y > -0.98) || (Math.abs(x) < 0.32 && Math.abs(x) > 0.2 && y < -0.42 && y > -0.62))
      case 'stubble':
      case 'beard':
        if (mouth(x, y)) return false
        return y < -0.32 && (y < -0.05 - Math.abs(x) * 0.5 || z > 0.5) && !(y > -0.38 && Math.abs(x) < 0.35 && z > 0.8)
    }
  }
  const depth = style === 'beard' ? 0.018 : style === 'stubble' ? 0.0025 : 0.008
  return offsetSubset(head.geometry, keep, (i) => head.radii.y * depth * (style === 'beard' ? 1 + 0.6 * smoothstep(-0.4, -0.95, dir[i * 3 + 1]!) : 1))
}

/** Close-cropped and short styles: a shell over the scalp with a natural hairline. */
export function hairCap(head: HeadShape, style: HairStyle): THREE.BufferGeometry | null {
  if (style === 'unset' || style === 'bald') return null
  const { dir } = head
  const keep = (i: number) => {
    const x = dir[i * 3]!
    const y = dir[i * 3 + 1]!
    const z = dir[i * 3 + 2]!
    // Hairline: high at the forehead, above the ears on the sides, low at the nape.
    const front = smoothstep(0.2, 0.8, z)
    const side = smoothstep(0.5, 0.95, Math.abs(x))
    const line = 0.42 * front + (0.12 + 0.1 * front) * side * (1 - front) + -0.35 * smoothstep(0, -0.8, z)
    return y > line
  }
  const thick = style === 'afro' ? 0.2 : style === 'buzz' ? 0.012 : style === 'short' ? 0.05 : 0.04
  return offsetSubset(head.geometry, keep, (i) => {
    const y = dir[i * 3 + 1]!
    const lift = style === 'afro' ? 0.6 + 0.4 * smoothstep(-0.4, 0.8, y) : smoothstep(-0.2, 0.6, y) * 0.6 + 0.4
    return head.radii.y * thick * lift
  })
}

/** Root points for braids, locs and long hair, spread over the scalp. Head space. */
export function scalpRoots(head: HeadShape, count: number): { root: THREE.Vector3; normal: THREE.Vector3 }[] {
  const out: { root: THREE.Vector3; normal: THREE.Vector3 }[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  // About 40% of an even spiral over the sphere lands on the scalp.
  const total = Math.round(count * 2.5)
  for (let i = 0; i < total; i++) {
    const y = 1 - (i / (total - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const a = golden * i
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    // Keep the scalp: above the ears, behind the front hairline, down to the nape.
    if (y < -0.2 + 0.55 * smoothstep(0.1, 0.8, z) || (z > 0.55 && y < 0.6)) continue
    const n = new THREE.Vector3(x, y, z)
    const root = new THREE.Vector3(head.center.x + x * head.radii.x, head.center.y + y * head.radii.y, head.center.z + z * head.radii.z)
    out.push({ root, normal: n.normalize() })
  }
  return out
}

/**
 * Roots along the lower back rim of a helmet or cap (head space): hair under headgear shows
 * only where it comes out at the back and sides.
 */
export function rimRoots(center: THREE.Vector3, half: THREE.Vector3, rimY: number, count: number, spread = 1.9): { root: THREE.Vector3; normal: THREE.Vector3 }[] {
  const out: { root: THREE.Vector3; normal: THREE.Vector3 }[] = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    // Around the back, from one side to the other, two rows deep.
    const phi = (t - 0.5) * 2 * spread
    const row = i % 2
    const d = new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi))
    const root = new THREE.Vector3(center.x + d.x * half.x * (0.86 - 0.05 * row), center.y + rimY * half.y + row * 0.06 * half.y, center.z + d.z * half.z * (0.86 - 0.05 * row))
    out.push({ root, normal: d.clone().add(new THREE.Vector3(0, -0.6, 0)).normalize() })
  }
  return out
}
