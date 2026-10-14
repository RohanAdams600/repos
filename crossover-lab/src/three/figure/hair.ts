import * as THREE from 'three'
import type { HairStyle } from '../../data/types'
import { material } from './materials'
import { scalpRoots, type HeadShape } from './head'

/**
 * Strand hair (braids, locs, long hair) simulated as verlet chains. Each strand is pinned at
 * the scalp, kept stiff near the root, pulled by gravity, and pushed out of the head (or the
 * helmet) and the shoulders, so it swings with sprints, cuts and spins. Strands render as one
 * instanced mesh of short segments.
 */
export interface StrandStyle {
  count: number
  segments: number
  /** Strand length as a share of stature. */
  length: number
  /** Strand radius as a share of stature. */
  radius: number
}

export const STRAND_STYLES: Partial<Record<HairStyle, StrandStyle>> = {
  braids: { count: 46, segments: 7, length: 0.13, radius: 0.0028 },
  locs: { count: 40, segments: 7, length: 0.15, radius: 0.0036 },
  long: { count: 70, segments: 6, length: 0.12, radius: 0.0032 },
}

export interface Collider {
  center: THREE.Vector3
  radius: number
}

interface Strand {
  root: THREE.Vector3
  normal: THREE.Vector3
  pts: THREE.Vector3[]
  prev: THREE.Vector3[]
}

const GRAVITY = new THREE.Vector3(0, -9.81, 0)
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)
const quat = new THREE.Quaternion()
const scale = new THREE.Vector3()
const mat = new THREE.Matrix4()
const inv = new THREE.Matrix4()

export class StrandHair {
  readonly mesh: THREE.InstancedMesh
  private readonly strands: Strand[] = []
  private readonly segLen: number
  private readonly style: StrandStyle
  private lastTime = -1
  private settled = false

  constructor(
    private readonly head: HeadShape,
    private readonly headBone: THREE.Object3D,
    style: StrandStyle,
    H: number,
    color: string,
    finish: 'braid' | 'hair',
  ) {
    this.style = style
    this.segLen = (style.length * H) / style.segments
    for (const { root, normal } of scalpRoots(head, style.count)) {
      const pts = Array.from({ length: style.segments + 1 }, () => new THREE.Vector3())
      this.strands.push({ root, normal, pts, prev: pts.map((p) => p.clone()) })
    }
    const piece = new THREE.CylinderGeometry(style.radius * H, style.radius * H * 0.92, 1, 10, 1, true)
    piece.translate(0, 0.5, 0)
    this.mesh = new THREE.InstancedMesh(piece, material(finish, color), this.strands.length * style.segments)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
    this.mesh.name = 'hair-strands'
  }

  /**
   * Move every root, e.g. to the lower rim of a helmet or cap so the strands flow out from under
   * it instead of through it. Pass the scalp roots to restore.
   */
  setRoots(roots: { root: THREE.Vector3; normal: THREE.Vector3 }[]): void {
    this.strands.forEach((s, i) => {
      const r = roots[i % roots.length]!
      s.root.copy(r.root)
      s.normal.copy(r.normal)
    })
    this.settled = false
  }

  /** World-space root and a point one segment out, lying along the scalp toward the nape. */
  private anchors(s: Strand, root: THREE.Vector3, guide: THREE.Vector3): void {
    const m = this.headBone.matrixWorld
    root.copy(s.root).applyMatrix4(m)
    const fall = tmp2.set(0, -0.85, -0.45)
    fall.addScaledVector(s.normal, -fall.dot(s.normal)).addScaledVector(s.normal, 0.25).normalize()
    guide.copy(fall).multiplyScalar(this.segLen).add(s.root).applyMatrix4(m)
  }

  /** Lay every strand down at rest and let it settle against the colliders. */
  reset(colliders: Collider[]): void {
    const root = new THREE.Vector3()
    const guide = new THREE.Vector3()
    for (const s of this.strands) {
      this.anchors(s, root, guide)
      s.pts[0]!.copy(root)
      s.pts[1]!.copy(guide)
      for (let i = 2; i < s.pts.length; i++) s.pts[i]!.copy(s.pts[i - 1]!).add(tmp.set(0, -this.segLen, 0))
      for (let i = 0; i < s.pts.length; i++) s.prev[i]!.copy(s.pts[i]!)
    }
    // Let them fall into place under gravity before the first frame is shown.
    for (let k = 0; k < 90; k++) this.integrate(1 / 60, colliders)
    for (const s of this.strands) for (let i = 0; i < s.pts.length; i++) s.prev[i]!.copy(s.pts[i]!)
    this.settled = true
  }

  /** Advance the simulation to `now` (seconds) and update the instances. */
  step(now: number, colliders: Collider[], root: THREE.Object3D): void {
    const dt = this.lastTime < 0 ? Infinity : now - this.lastTime
    this.lastTime = now
    if (!this.settled || !(dt > 0) || dt > 0.25) this.reset(colliders)
    else {
      const sub = dt > 1 / 45 ? 2 : 1
      const h = Math.min(dt, 1 / 30) / sub
      for (let k = 0; k < sub; k++) this.integrate(h, colliders)
    }
    this.sync(root)
  }

  private integrate(h: number, colliders: Collider[]): void {
    const root = new THREE.Vector3()
    const guide = new THREE.Vector3()
    for (const s of this.strands) {
      this.anchors(s, root, guide)
      s.pts[0]!.copy(root)
      s.prev[0]!.copy(root)
      for (let i = 1; i < s.pts.length; i++) {
        const p = s.pts[i]!
        const q = s.prev[i]!
        tmp.copy(p).sub(q).multiplyScalar(0.97)
        q.copy(p)
        p.add(tmp).addScaledVector(GRAVITY, h * h)
      }
      // Stiff near the root: the first segment follows the scalp, the second partly.
      s.pts[1]!.lerp(guide, 0.65)
    }
    this.solve(colliders, 3)
  }

  private solve(colliders: Collider[], iterations: number): void {
    for (let it = 0; it < iterations; it++) {
      for (const s of this.strands) {
        for (let i = 1; i < s.pts.length; i++) {
          const a = s.pts[i - 1]!
          const b = s.pts[i]!
          tmp.copy(b).sub(a)
          const len = tmp.length() || 1e-6
          const diff = (len - this.segLen) / len
          if (i === 1) b.addScaledVector(tmp, -diff)
          else {
            a.addScaledVector(tmp, diff * 0.5)
            b.addScaledVector(tmp, -diff * 0.5)
          }
          for (const c of colliders) {
            tmp.copy(b).sub(c.center)
            const d = tmp.length()
            if (d < c.radius) b.addScaledVector(tmp, (c.radius - d) / Math.max(d, 1e-6))
          }
        }
        s.pts[0]!.copy(s.prev[0]!)
      }
    }
  }

  private sync(root: THREE.Object3D): void {
    inv.copy(root.matrixWorld).invert()
    let n = 0
    for (const s of this.strands) {
      for (let i = 0; i < s.pts.length - 1; i++) {
        const a = tmp.copy(s.pts[i]!).applyMatrix4(inv)
        const b = tmp2.copy(s.pts[i + 1]!).applyMatrix4(inv)
        const d = b.clone().sub(a)
        const len = d.length() * 1.15
        quat.setFromUnitVectors(up, d.normalize())
        // Taper toward the tips.
        const t = 1 - (i / this.style.segments) * 0.35
        scale.set(t, len, t)
        mat.compose(a, quat, scale)
        this.mesh.setMatrixAt(n++, mat)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.dispose()
  }

  /** Strand count, for the appearance panel. */
  get count(): number {
    return this.strands.length
  }

  get headShape(): HeadShape {
    return this.head
  }
}
