import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BUILT_IN } from '../src/data/roster'
import { idle, jump, measurePose } from '../src/three/motions'
import { Rig } from '../src/three/rig'

function lowestY(rig: Rig): number {
  rig.root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(rig.root)
  return box.min.y
}

describe('procedural rig', () => {
  it.each(BUILT_IN.map((a) => [a.name, a] as const))('%s stands on the floor at his listed height', (_n, a) => {
    const rig = new Rig(a)
    rig.applyPose(idle(0), { x: 0, z: 0, yaw: 0 })
    expect(Math.abs(lowestY(rig))).toBeLessThan(0.03)
    rig.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rig.root)
    // Helmets and caps add a few centimetres on top.
    expect(box.max.y).toBeGreaterThan(rig.dims.height * 0.97)
    expect(box.max.y).toBeLessThan(rig.dims.height * 1.1)
  })

  it('spans the athlete’s wingspan in the measurement pose', () => {
    const mitchell = BUILT_IN.find((a) => a.league === 'NBA')!
    const rig = new Rig(mitchell)
    rig.applyPose(measurePose(0), { x: 0, z: 0, yaw: 0 })
    rig.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(rig.root)
    const span = box.max.x - box.min.x
    expect(span).toBeGreaterThan(82 * 0.0254 * 0.95)
    expect(span).toBeLessThan(82 * 0.0254 * 1.06)
  })

  it('leaves the ground by the jump height', () => {
    const rig = new Rig(BUILT_IN[0]!)
    rig.applyPose(jump(0.62, rig.dims, { height: 0.9, sig: rig.athlete.movement.jump }), { x: 0, z: 0, yaw: 0 })
    expect(lowestY(rig)).toBeGreaterThan(0.6)
  })

  it('removes and restores gear', () => {
    const a = BUILT_IN[0]!
    const rig = new Rig(a)
    const helmet = a.gear.find((g) => g.slot === 'helmet')!
    const count = rig.meshes.length
    rig.setGear(helmet.id, { worn: false })
    expect(rig.meshes.length).toBeLessThan(count)
    expect(rig.meshes.some((m) => m.userData.gearId === helmet.id)).toBe(false)
    rig.setGear(helmet.id, { worn: true })
    expect(rig.meshes.length).toBe(count)
  })

  it('paints a heat map as vertex colors and clears it', () => {
    const a = BUILT_IN[0]!
    const rig = new Rig(a)
    const gloves = a.gear.find((g) => g.slot === 'gloves')!
    rig.setHeatmap(gloves.use.hotspots, 'viridis', new Set([gloves.id]))
    const glove = rig.meshes.find((m) => m.userData.gearId === gloves.id)!
    expect(glove.geometry.getAttribute('color')).toBeDefined()
    expect((glove.material as THREE.MeshStandardMaterial).vertexColors).toBe(true)
    rig.setHeatmap(null)
    expect((glove.material as THREE.MeshStandardMaterial).vertexColors).toBe(false)
  })
})
