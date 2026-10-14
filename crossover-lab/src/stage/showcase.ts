import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { liftValue } from '../sim/events'
import { makeBench } from '../three/env'
import { Rig } from '../three/rig'
import { MOTIONS, type MotionId, type MotionSpec } from './motion-library'
import { forward, HeldProp } from './props-manager'
import { TimelineStage } from './timeline'

const BENCH_TOP = 0.47
/** A side-by-side partner stands this far away, so neither half of a split screen shows the other. */
export const PARTNER_X = 40

/**
 * One athlete on the stage running a motion, with an optional ghost of a second athlete doing
 * the same motion on the same spot (the biomechanics lab overlay), or a partner doing it on a
 * spot of their own for a split-screen side-by-side with matching cameras (the showroom).
 */
export class ShowcaseStage extends TimelineStage {
  readonly rig: Rig
  ghost?: Rig
  partner?: Rig
  motion: MotionSpec
  private prop?: HeldProp
  private ghostProp?: HeldProp
  private partnerProp?: HeldProp
  private bench?: THREE.Group
  private readonly focusPoint = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    athlete: Athlete,
    motion: MotionId,
    ghost?: { athlete: Athlete; color: number },
    /** Camera heading for the broadcast preset: 0 is side-on, -PI/2 is head-on. */
    private readonly viewYaw = 0,
    partner?: Athlete,
  ) {
    super(scene)
    this.rig = new Rig(athlete)
    this.group.add(this.rig.root)
    this.rigs = [this.rig]
    if (ghost) {
      this.ghost = new Rig(ghost.athlete, { ghostColor: ghost.color })
      this.group.add(this.ghost.root)
      this.rigs.push(this.ghost)
    }
    if (partner) {
      this.partner = new Rig(partner)
      this.group.add(this.partner.root)
      this.rigs.push(this.partner)
    }
    this.motion = MOTIONS[motion]
    this.setMotion(motion)
  }

  setMotion(id: MotionId): void {
    this.setSpec(MOTIONS[id])
  }

  /** Play any motion spec, including ones built on the fly (the showroom's carry form). */
  setSpec(spec: MotionSpec): void {
    const id = spec.id
    this.motion = spec
    this.duration = this.motion.duration(this.rig.athlete)
    this.loop = this.motion.loop
    this.time = 0
    this.captionsList = this.motion.captions.map((c) => ({ at: c.at * this.duration, text: c.text }))
    this.prop?.dispose()
    this.ghostProp?.dispose()
    this.partnerProp?.dispose()
    this.prop = undefined
    this.ghostProp = undefined
    this.partnerProp = undefined
    const kind = this.motion.prop(this.rig.athlete)
    if (kind !== 'none') {
      const load = id === 'bench' || id === 'squat' || id === 'deadlift' || id === 'clean' ? Math.round(liftValue(this.rig.athlete, id).value * 0.8) : 225
      this.prop = new HeldProp(kind, this.group, this.rig, load, id === 'squat')
      if (this.ghost && kind !== 'barbell') this.ghostProp = new HeldProp(kind, this.group, this.ghost, load, id === 'squat')
    }
    if (this.partner) {
      const pk = this.motion.prop(this.partner.athlete)
      if (pk !== 'none' && pk !== 'barbell') this.partnerProp = new HeldProp(pk, this.group, this.partner, 225, false)
    }
    if (id === 'bench' && !this.bench) {
      this.bench = makeBench()
      this.group.add(this.bench)
    }
    if (this.bench) this.bench.visible = id === 'bench'
    this.render(0)
  }

  /** Base placement: the bench press lies the athlete on the bench, head toward -Z. */
  private base(rig: Rig): { x: number; y: number; z: number; yaw: number } {
    const x = rig === this.partner ? PARTNER_X : 0
    if (this.motion.id === 'bench' && rig !== this.partner) {
      const back = 0.12 * rig.dims.girth * (rig.dims.height / 1.85)
      return { x, y: BENCH_TOP + back, z: 0.55 * rig.dims.height, yaw: 0 }
    }
    return { x, y: 0, z: 0, yaw: 0 }
  }

  render(t: number): void {
    const u = this.duration > 0 ? (t % this.duration) / this.duration : 0
    const pose = this.motion.pose(this.rig, u)
    this.rig.applyPose(pose, this.base(this.rig))
    if (this.bench) this.bench.position.set(0, 0, 0.55 * this.rig.dims.height - this.rig.dims.hipY - 0.15)
    const left = this.rig.athlete.throws === 'L' && this.motion.id !== 'shoot'
    const release = this.motion.release ?? 0
    this.prop?.update(pose, this.motion.id === 'swing' ? this.batsLeft(this.rig) : left, (s, from, obj) => this.flight(s, from, obj, this.rig), (u - release) * this.duration)
    if (this.ghost) {
      const gp = this.motion.pose(this.ghost, u)
      this.ghost.applyPose(gp, this.base(this.ghost))
      this.ghostProp?.update(gp, this.motion.id === 'swing' ? this.batsLeft(this.ghost) : false, (s, from, obj) => this.flight(s, from, obj, this.ghost!), (u - release) * this.duration)
    }
    if (this.partner) {
      const pp = this.motion.pose(this.partner, u)
      this.partner.applyPose(pp, this.base(this.partner))
      const pLeft = this.partner.athlete.throws === 'L' && this.motion.id !== 'shoot'
      this.partnerProp?.update(pp, this.motion.id === 'swing' ? this.batsLeft(this.partner) : pLeft, (s, from, obj) => this.flight(s, from, obj, this.partner!), (u - release) * this.duration)
    }
  }

  /** Split screen: each half follows one athlete with the same camera offset. */
  splitFocus(): [THREE.Vector3, THREE.Vector3] | null {
    if (!this.partner) return null
    return [this.focusOf(this.rig, new THREE.Vector3()), this.focusOf(this.partner, new THREE.Vector3())]
  }

  /** In split screen only the main athlete frames the shot (both halves share it). */
  override bounds(out: THREE.Box3): THREE.Box3 {
    return this.rig.bounds(out)
  }

  private batsLeft(rig: Rig): boolean {
    return rig.athlete.bats === 'L' || (rig.athlete.bats === undefined && rig.athlete.movement.swing.batsLeft)
  }

  /** Simple showcase flight after release: a throw toward +Z, or a shot at a rim 4.6 m away. */
  private flight(s: number, from: THREE.Vector3, obj: THREE.Object3D, rig: Rig): boolean {
    if (s > 0.9) return false
    const dir = forward(rig)
    if (this.motion.id === 'shoot') {
      const target = new THREE.Vector3(0, 3.05, 0).addScaledVector(dir, 4.6)
      const T = 0.85
      const k = Math.min(1, s / T)
      obj.position.lerpVectors(from, target, k)
      obj.position.y = from.y + (target.y - from.y) * k + 1.6 * 4 * k * (1 - k) * 0.5
      return s < T + 0.05
    }
    const speed = this.motion.id === 'pitch' ? 40 : this.motion.id === 'throw' ? 22 : 14
    const up = this.motion.id === 'pitch' ? 0.02 : 0.2
    obj.position.copy(from).addScaledVector(dir, speed * s)
    obj.position.y += up * speed * s - 4.9 * s * s
    if (this.motion.id === 'throw') obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
    return obj.position.y > 0
  }

  override facing(): number {
    return this.viewYaw
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return this.focusOf(this.rig, out)
  }

  private focusOf(rig: Rig, out: THREE.Vector3): THREE.Vector3 {
    rig.joints.hips.getWorldPosition(this.focusPoint)
    out.copy(this.focusPoint)
    out.y = Math.max(0.6, this.focusPoint.y * 0.5 + rig.dims.height * 0.3)
    return out
  }

  override dispose(): void {
    this.prop?.dispose()
    this.ghostProp?.dispose()
    this.partnerProp?.dispose()
    super.dispose()
  }
}
