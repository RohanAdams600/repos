import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { liftValue } from '../sim/events'
import { makeBench } from '../three/env'
import { Rig } from '../three/rig'
import { MOTIONS, type MotionId, type MotionSpec } from './motion-library'
import { forward, HeldProp } from './props-manager'
import { TimelineStage } from './timeline'

const BENCH_TOP = 0.47

/**
 * One athlete on the stage running a motion, with an optional ghost of a second athlete doing
 * the same motion on the same spot (the biomechanics lab overlay).
 */
export class ShowcaseStage extends TimelineStage {
  readonly rig: Rig
  ghost?: Rig
  motion: MotionSpec
  private prop?: HeldProp
  private ghostProp?: HeldProp
  private bench?: THREE.Group
  private readonly focusPoint = new THREE.Vector3()

  constructor(
    scene: THREE.Scene,
    athlete: Athlete,
    motion: MotionId,
    ghost?: { athlete: Athlete; color: number },
    /** Camera heading for the broadcast preset: 0 is side-on, -PI/2 is head-on. */
    private readonly viewYaw = 0,
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
    this.motion = MOTIONS[motion]
    this.setMotion(motion)
  }

  setMotion(id: MotionId): void {
    this.motion = MOTIONS[id]
    this.duration = this.motion.duration(this.rig.athlete)
    this.loop = this.motion.loop
    this.time = 0
    this.captionsList = this.motion.captions.map((c) => ({ at: c.at * this.duration, text: c.text }))
    this.prop?.dispose()
    this.ghostProp?.dispose()
    this.prop = undefined
    this.ghostProp = undefined
    const kind = this.motion.prop(this.rig.athlete)
    if (kind !== 'none') {
      const load = id === 'bench' || id === 'squat' || id === 'deadlift' || id === 'clean' ? Math.round(liftValue(this.rig.athlete, id).value * 0.8) : 225
      this.prop = new HeldProp(kind, this.group, this.rig, load, id === 'squat')
      if (this.ghost && kind !== 'barbell') this.ghostProp = new HeldProp(kind, this.group, this.ghost, load, id === 'squat')
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
    if (this.motion.id === 'bench') {
      const back = 0.12 * rig.dims.girth * (rig.dims.height / 1.85)
      return { x: 0, y: BENCH_TOP + back, z: 0.55 * rig.dims.height, yaw: 0 }
    }
    return { x: 0, y: 0, z: 0, yaw: 0 }
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
    this.rig.joints.hips.getWorldPosition(this.focusPoint)
    out.copy(this.focusPoint)
    out.y = Math.max(0.6, this.focusPoint.y * 0.5 + this.rig.dims.height * 0.3)
    return out
  }

  override dispose(): void {
    this.prop?.dispose()
    this.ghostProp?.dispose()
    super.dispose()
  }
}
