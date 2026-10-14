import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BUILT_IN, STANDOUTS } from '../src/data/roster'
import type { Athlete } from '../src/data/types'
import { buildBody, morphFor, restJoints, shellFrom } from '../src/three/figure/body'
import { ClothDriver, setSwayWeights } from '../src/three/figure/cloth'
import { garment } from '../src/three/figure/garments'
import { idle } from '../src/three/motions'
import { dimensionsFor, Rig } from '../src/three/rig'

const mitchell = BUILT_IN.find((a) => a.league === 'NBA')!

function body(a: Athlete) {
  return buildBody({ ...dimensionsFor(a) }, morphFor(a.positionGroup))
}

describe('skinned body', () => {
  it('weights every vertex to bones with weights summing to 1', () => {
    const b = body(mitchell)
    const w = b.geometry.getAttribute('skinWeight')
    for (let i = 0; i < w.count; i += 37) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 4)
  })

  it('puts joints where the measurements say', () => {
    const d = dimensionsFor(mitchell)
    const J = restJoints({ ...d })
    expect(J.hipL.y - J.ankleL.y).toBeCloseTo(d.thigh + d.shin, 6)
    expect(J.shoulderL.x).toBeCloseTo(d.shoulderHalf, 6)
    expect(J.shoulderR.x).toBeCloseTo(-d.shoulderHalf, 6)
  })
})

describe('garment shells', () => {
  it('clip exactly on a signed-distance edge instead of stair-stepping', () => {
    const b = body(mitchell)
    const y0 = b.joints.chest.y
    const shell = shellFrom(b, (_i, p) => p.y - y0, () => 0)!
    const pos = shell.getAttribute('position')
    let onEdge = 0
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeGreaterThanOrEqual(y0 - 1e-5)
      if (Math.abs(pos.getY(i) - y0) < 1e-5) onEdge++
    }
    // The cut ring around the torso and both arms is made of new vertices on the edge.
    expect(onEdge).toBeGreaterThan(30)
    expect((shell.userData.source as Int32Array).length).toBe(pos.count)
  })

  it('cut every league kit without empty pieces', () => {
    for (const a of BUILT_IN) {
      const b = body(a)
      for (const slot of a.league === 'NBA' ? (['jersey', 'shorts', 'socks'] as const) : (['jersey', 'pants', 'socks'] as const)) {
        const g = garment(b, slot, a.league)
        expect(g, `${a.league} ${slot}`).not.toBeNull()
        expect(g!.getIndex()!.count, `${a.league} ${slot}`).toBeGreaterThan(300)
      }
    }
  })

  it('sway weights stay in 0..1', () => {
    const b = body(mitchell)
    const g = garment(b, 'shorts', 'NBA')!
    setSwayWeights(g, (p) => (b.joints.hipL.y - p.y) * 10)
    const w = g.getAttribute('aSway')
    for (let i = 0; i < w.count; i++) {
      expect(w.getX(i)).toBeGreaterThanOrEqual(0)
      expect(w.getX(i)).toBeLessThanOrEqual(1)
    }
  })
})

describe('cloth driver', () => {
  it('trails the motion, stays within reach and settles after a jump in time', () => {
    const drive = new ClothDriver(1.9)
    const u = { uSway: { value: new THREE.Vector3() }, uRipple: { value: 0 }, uTime: { value: 0 } }
    drive.targets.push(u)
    const q = new THREE.Quaternion()
    const hips = new THREE.Vector3()
    drive.step(hips, q, 0)
    expect(u.uSway.value.length()).toBe(0)
    for (let k = 1; k <= 30; k++) drive.step(hips.set(0, 1, k * 0.15), q, k / 60)
    // Moving toward +Z at 9 m/s: the free cloth hangs back (toward -Z) and ripples.
    expect(u.uSway.value.z).toBeLessThan(0)
    expect(u.uSway.value.length()).toBeLessThanOrEqual(0.0281 * (1.9 / 1.85))
    expect(u.uRipple.value).toBeGreaterThan(0)
    drive.step(hips, q, 10)
    expect(u.uSway.value.length()).toBe(0)
  })
})

describe('measurements drive the figure', () => {
  it('sizes hands from hand length and keeps the wingspan', () => {
    const base = structuredClone(mitchell)
    const before = dimensionsFor(base)
    base.metrics.handLengthIn = { value: 9.25, quality: 'VERIFIED', sourceId: 'x' }
    const after = dimensionsFor(base)
    expect(after.hand).toBeCloseTo(9.25 * 0.0254, 3)
    expect(after.upperArm + after.forearm + after.hand).toBeCloseTo(before.upperArm + before.forearm + before.hand, 6)
  })

  it('sizes feet from shoe size', () => {
    const base = structuredClone(mitchell)
    base.metrics.shoeSizeUs = { value: 14, quality: 'ESTIMATED', note: 'test' }
    expect(dimensionsFor(base).foot).toBeCloseTo(((14 + 22) / 3 - 0.5) * 0.0254, 4)
  })
})

describe('standout figures', () => {
  it.each(['NFL', 'MLB', 'NBA'].map((l) => [l, STANDOUTS.find((a) => a.league === l)!] as const))('%s standout stands on the floor in default kit', (_l, a) => {
    const rig = new Rig(a)
    rig.applyPose(idle(0), { x: 0, z: 0, yaw: 0 })
    rig.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rig.root)
    expect(Math.abs(box.min.y)).toBeLessThan(0.03)
    expect(rig.meshes.some((m) => m.userData.gearId)).toBe(true)
    rig.dispose()
  })
})
