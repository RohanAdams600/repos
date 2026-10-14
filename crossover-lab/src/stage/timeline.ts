import * as THREE from 'three'
import type { Rig } from '../three/rig'
import type { StageController } from '../three/viewer'

export interface Caption {
  at: number
  text: string
}

/**
 * A scene with a clock: plays, loops or stops, can be scrubbed and stepped frame by frame, and
 * describes what is happening at each moment for captions and screen readers.
 */
export abstract class TimelineStage implements StageController {
  time = 0
  playing = true
  loop = true
  duration = 1
  rigs: Rig[] = []
  readonly group = new THREE.Group()
  protected captionsList: Caption[] = []
  private ended = false
  onEnd?: () => void
  onTick?: (t: number) => void

  constructor(protected readonly scene: THREE.Scene) {
    scene.add(this.group)
  }

  update(dt: number): void {
    if (this.playing && dt > 0) {
      this.time += dt
      if (this.time >= this.duration) {
        if (this.loop) this.time %= this.duration
        else {
          this.time = this.duration
          if (!this.ended) {
            this.ended = true
            this.onEnd?.()
          }
        }
      }
    }
    this.render(this.time)
    this.onTick?.(this.time)
  }

  seek(t: number): void {
    this.time = Math.max(0, Math.min(this.duration, t))
    this.ended = this.time >= this.duration && !this.loop
    this.render(this.time)
  }

  restart(): void {
    this.ended = false
    this.seek(0)
    this.playing = true
  }

  /** The caption in force at time t. */
  caption(t = this.time): string {
    let text = ''
    for (const c of this.captionsList) if (t >= c.at) text = c.text
    return text
  }

  abstract render(t: number): void
  abstract focus(out: THREE.Vector3): THREE.Vector3

  facing(): number {
    return 0
  }

  focusRig(): Rig | undefined {
    return this.rigs[0]
  }

  /** Everyone on stage, for camera auto-framing. */
  bounds(out: THREE.Box3): THREE.Box3 {
    out.makeEmpty()
    const box = new THREE.Box3()
    for (const r of this.rigs) out.union(r.bounds(box))
    return out
  }

  dispose(): void {
    for (const r of this.rigs) r.dispose()
    this.scene.remove(this.group)
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const m = o.material as THREE.Material | THREE.Material[]
        if (Array.isArray(m)) m.forEach((x) => x.dispose())
        else m.dispose()
      }
    })
  }
}
