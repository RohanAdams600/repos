import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Small geometry toolkit for the figure: lofts, superellipsoids, mirroring and merging. */

export interface Section {
  /** Position along the loft axis. */
  t: number
  cx: number
  cy: number
  /** Half extents of the section. */
  hw: number
  hh: number
  /** Squareness: 2 = ellipse, higher = boxier. */
  e?: number
  /** Extra flattening of the bottom half (0..1), for soles and palms. */
  flatBottom?: number
}

/**
 * Loft rounded sections along +Z (the sections' `t` is z). Used for feet, shoes, soles and
 * straps. Both ends are capped.
 */
export function loftZ(sections: Section[], radial = 28, caps = true): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const row = radial + 1
  sections.forEach((s, r) => {
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2
      const [x, y] = superPoint(th, s.hw, s.hh, s.e ?? 2.6, s.flatBottom ?? 0)
      pos.push(s.cx + x, s.cy + y, s.t)
      uv.push(k / radial, r / (sections.length - 1))
    }
  })
  for (let r = 0; r < sections.length - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * row + k
      const c = a + row
      // θ runs from +X toward +Y and sections advance along +Z: this winding faces outward.
      idx.push(a, a + 1, c, a + 1, c + 1, c)
    }
  }
  if (caps) {
    for (const [r, front] of [[0, false], [sections.length - 1, true]] as const) {
      const s = sections[r]!
      const first = pos.length / 3
      for (let k = 0; k < radial; k++) {
        const th = (k / radial) * Math.PI * 2
        const [x, y] = superPoint(th, s.hw, s.hh, s.e ?? 2.6, s.flatBottom ?? 0)
        pos.push(s.cx + x, s.cy + y, s.t)
        uv.push(0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th))
      }
      const center = pos.length / 3
      pos.push(s.cx, s.cy, s.t)
      uv.push(0.5, 0.5)
      for (let k = 0; k < radial; k++) {
        const a = first + k
        const n = first + ((k + 1) % radial)
        if (front) idx.push(center, a, n)
        else idx.push(center, n, a)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return fixOutward(g)
}

function superPoint(th: number, hw: number, hh: number, e: number, flatBottom: number): [number, number] {
  const c = Math.cos(th)
  const s = Math.sin(th)
  const ex = s < 0 ? e + flatBottom * 6 : e
  const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * hw
  const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / ex) * hh
  return [x, y]
}

/** A superellipsoid (rounded box) centred at the origin. */
export function roundedBox(hx: number, hy: number, hz: number, e = 3, w = 24, hgt = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, hgt)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e)
    p.setXYZ(i, f(x) * hx, f(y) * hy, f(z) * hz)
  }
  g.computeVertexNormals()
  return g
}

/** Capsule from `a` to `b` with radii tapering from ra to rb. */
export function limbCapsule(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, radial = 12): THREE.BufferGeometry {
  const len = a.distanceTo(b)
  const g = new THREE.CapsuleGeometry(1, 1, 4, radial, 1)
  const p = g.getAttribute('position')
  // CapsuleGeometry runs along Y from -(0.5+r) to +(0.5+r); taper and rescale it.
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const t = Math.max(0, Math.min(1, (y + 1.5) / 3))
    const r = ra + (rb - ra) * t
    const yy = y <= -0.5 ? -len / 2 + (y + 0.5) * ra : y >= 0.5 ? len / 2 + (y - 0.5) * rb : y * len
    p.setXYZ(i, p.getX(i) * r, yy, p.getZ(i) * r)
  }
  g.computeVertexNormals()
  const dir = b.clone().sub(a).normalize()
  // The -Y end (radius ra) goes to `a`.
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir))
  const mid = a.clone().add(b).multiplyScalar(0.5)
  g.translate(mid.x, mid.y, mid.z)
  return g
}

/** Mirror across the YZ plane, keeping triangles facing outward. */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone()
  m.scale(-1, 1, 1)
  const index = m.getIndex()
  if (index) {
    const a = index.array as Uint16Array | Uint32Array
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!
      a[i + 1] = a[i + 2]!
      a[i + 2] = t
    }
    index.needsUpdate = true
  }
  m.computeVertexNormals()
  return m
}

/** Merge parts that may differ in attributes: keeps position, normal and uv only. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone()
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2))
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    return g
  })
  const out = mergeGeometries(clean, false)
  for (const p of clean) p.dispose()
  return out ?? new THREE.BufferGeometry()
}

/**
 * Flip a closed-ish mesh's triangles if most of them face its centroid. Lofts and sculpted
 * shapes can end up inside out depending on how the sections were ordered.
 */
export function fixOutward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const c = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)))
  c.multiplyScalar(1 / Math.max(1, p.count))
  let score = 0
  for (let i = 0; i < p.count; i++) score += (p.getX(i) - c.x) * n.getX(i) + (p.getY(i) - c.y) * n.getY(i) + (p.getZ(i) - c.z) * n.getZ(i)
  if (score >= 0) return g
  const index = g.getIndex()
  if (index) {
    const a = index.array as Uint16Array | Uint32Array
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!
      a[i + 1] = a[i + 2]!
      a[i + 2] = t
    }
    index.needsUpdate = true
  }
  g.computeVertexNormals()
  return g
}

/** A swept tube along points (facemask bars, straps, eyebrows). */
export function tubeAlong(points: THREE.Vector3[], radius: number, segments = 32, radial = 8, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal')
  return new THREE.TubeGeometry(curve, segments, radius, radial, closed)
}

/**
 * Triangles of `g` whose vertices all pass `keep`, pushed out along their normals. For facial
 * hair and hair caps that sit on the sculpted head.
 */
export function offsetSubset(g: THREE.BufferGeometry, keep: (i: number) => boolean, offset: (i: number) => number): THREE.BufferGeometry | null {
  const src = g
  const pos = src.getAttribute('position')
  const nor = src.getAttribute('normal')
  const uv = src.getAttribute('uv')
  const index = src.getIndex()?.array
  if (!index) return null
  const map = new Int32Array(pos.count).fill(-1)
  const P: number[] = []
  const U: number[] = []
  const I: number[] = []
  const vert = (i: number) => {
    if (map[i]! >= 0) return map[i]!
    const t = offset(i)
    P.push(pos.getX(i) + nor.getX(i) * t, pos.getY(i) + nor.getY(i) * t, pos.getZ(i) + nor.getZ(i) * t)
    U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0)
    map[i] = P.length / 3 - 1
    return map[i]!
  }
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!
    const b = index[t + 1]!
    const c = index[t + 2]!
    if (!keep(a) || !keep(b) || !keep(c)) continue
    I.push(vert(a), vert(b), vert(c))
  }
  if (!I.length) return null
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2))
  out.setIndex(I)
  out.computeVertexNormals()
  return out
}
