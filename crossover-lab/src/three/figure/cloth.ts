import * as THREE from 'three'

/**
 * Secondary motion for loose fabric: shorts legs, untucked hems, baggy baseball pants. Each
 * garment vertex carries a sway weight (0 where the cloth is held, 1 at a free hem); a damped
 * spring driven by how the hips move swings the free cloth the other way, and a small ripple
 * runs through it at speed. The displacement is applied in the vertex shader before skinning,
 * so it rides with the body. A cheap stand-in for cloth simulation, not a solver.
 */
export interface ClothUniforms {
  uSway: { value: THREE.Vector3 }
  uRipple: { value: number }
  uTime: { value: number }
}

/** A per-rig copy of a garment material with the sway injected. */
export function clothMaterial(base: THREE.Material): { material: THREE.Material; uniforms: ClothUniforms } {
  const material = base.clone()
  const uniforms: ClothUniforms = { uSway: { value: new THREE.Vector3() }, uRipple: { value: 0 }, uTime: { value: 0 } }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSway = uniforms.uSway
    shader.uniforms.uRipple = uniforms.uRipple
    shader.uniforms.uTime = uniforms.uTime
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'attribute float aSway;\nuniform vec3 uSway;\nuniform float uRipple;\nuniform float uTime;\nvoid main() {').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Free cloth lags the body and ripples at speed; held cloth (aSway 0) does not move.
      transformed += uSway * aSway;
      transformed += objectNormal * aSway * uRipple * sin(uTime * 11.0 + position.y * 38.0 + position.x * 23.0);`,
    )
  }
  material.customProgramCacheKey = () => `cloth:${base.type}`
  return { material, uniforms }
}

/** Write the sway weights (one per vertex) from a function of rest position. */
export function setSwayWeights(geometry: THREE.BufferGeometry, weight: (p: THREE.Vector3) => number): void {
  const pos = geometry.getAttribute('position')
  const w = new Float32Array(pos.count)
  const p = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) w[i] = Math.max(0, Math.min(1, weight(p.fromBufferAttribute(pos, i))))
  geometry.setAttribute('aSway', new THREE.BufferAttribute(w, 1))
}

/** The spring that drives every loose garment on one athlete. */
export class ClothDriver {
  private readonly sway = new THREE.Vector3()
  private readonly swayVel = new THREE.Vector3()
  private readonly last = new THREE.Vector3()
  private lastTime = -1
  private speed = 0
  private readonly tmp = new THREE.Vector3()
  private readonly inv = new THREE.Quaternion()
  readonly targets: ClothUniforms[] = []

  constructor(private readonly height: number) {}

  /** Advance with the hips' world position and the root's world rotation at time `now` (s). */
  step(hips: THREE.Vector3, rootQuat: THREE.Quaternion, now: number): void {
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, now - this.lastTime)
    this.lastTime = now
    if (dt <= 0 || dt > 0.09) {
      // First frame or a jump in time (a scrub): settle in place.
      this.last.copy(hips)
      this.sway.set(0, 0, 0)
      this.swayVel.set(0, 0, 0)
      this.speed = 0
    } else {
      const vel = this.tmp.copy(hips).sub(this.last).divideScalar(dt)
      this.last.copy(hips)
      this.speed = vel.length()
      // Into the athlete's own frame, so the cloth trails behind whichever way they face.
      vel.applyQuaternion(this.inv.copy(rootQuat).invert())
      const reach = 0.028 * (this.height / 1.85)
      const target = vel.multiplyScalar(-0.012)
      target.y *= 0.35
      if (target.length() > reach) target.setLength(reach)
      // Critically-damped-ish spring toward the target.
      const k = 90
      const c = 2 * Math.sqrt(k) * 0.55
      this.swayVel.addScaledVector(target.sub(this.sway), k * dt).multiplyScalar(Math.max(0, 1 - c * dt))
      this.sway.addScaledVector(this.swayVel, dt)
    }
    const ripple = Math.min(0.0045, this.speed * 0.0006) * (this.height / 1.85)
    for (const t of this.targets) {
      t.uSway.value.copy(this.sway)
      t.uRipple.value = ripple
      t.uTime.value = now
    }
  }
}
