import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { Rig } from '../three/rig'
import { MOTIONS, type MotionId, type MotionSpec } from './motion-library'
import { HeldProp } from './props-manager'
import { TimelineStage } from './timeline'

/** Several athletes side by side, each looping a motion. Used on the roster and as a pre-race lineup. */
export class LineupStage extends TimelineStage {
  private readonly specs: MotionSpec[]
  private readonly props: (HeldProp | undefined)[]
  readonly spacing: number

  constructor(scene: THREE.Scene, athletes: Athlete[], motionFor: (a: Athlete) => MotionId, spacing = 1.6) {
    super(scene)
    this.spacing = spacing
    this.rigs = athletes.map((a) => {
      const rig = new Rig(a)
      this.group.add(rig.root)
      return rig
    })
    this.specs = athletes.map((a) => MOTIONS[motionFor(a)])
    this.props = this.rigs.map((rig, i) => {
      const kind = this.specs[i]!.prop(rig.athlete)
      return kind === 'none' || kind === 'barbell' ? undefined : new HeldProp(kind, this.group, rig)
    })
    this.duration = 1000
    this.loop = true
    this.render(0)
  }

  x(i: number): number {
    return (i - (this.rigs.length - 1) / 2) * this.spacing
  }

  render(t: number): void {
    this.rigs.forEach((rig, i) => {
      const spec = this.specs[i]!
      const dur = spec.duration(rig.athlete)
      // Offset each athlete's cycle so they do not move in lockstep.
      const u = ((t + i * 0.37) % dur) / dur
      const pose = spec.pose(rig, u)
      rig.applyPose(pose, { x: this.x(i), z: 0, yaw: 0 })
      const left = spec.id === 'swing' ? rig.athlete.bats === 'L' : false
      this.props[i]?.update(pose, left, () => false, 0)
    })
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0.95, 0)
  }

  /** Broadcast camera sits in front and a little to the side of the line. */
  override facing(): number {
    return -Math.PI / 2 * 0.8
  }

  framing(): number {
    return Math.max(1, this.rigs.length * 0.55)
  }

  override dispose(): void {
    this.props.forEach((p) => p?.dispose())
    super.dispose()
  }
}
