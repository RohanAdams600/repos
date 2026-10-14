import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { IN_TO_M, YD_TO_M } from '../data/metrics'
import { agilityValue, jumpValue, liftValue, repsAt, type AgilityEvent, type JumpEvent, type LiftEvent } from '../sim/events'
import { runSprint, sprintProfile, stateAt, type SprintProfile, type SprintState } from '../sim/sprint'
import { BALLS, flight, maxDistance, type Ball } from '../sim/throwing'
import { MPH_TO_MS } from '../data/metrics'
import { laneX, makeBench, textPlane } from '../three/env'
import { cut, idle, jump, lift, run, sitReach, sprintStance, throwMotion, type ThrowKind } from '../three/motions'
import { Rig } from '../three/rig'
import { HeldProp } from './props-manager'
import { TimelineStage } from './timeline'

/** Base class for side-by-side contests: one rig per lane, facing +Z. */
abstract class LaneStage extends TimelineStage {
  readonly athletes: Athlete[]
  readonly lanes: number
  private readonly spacing?: number

  constructor(scene: THREE.Scene, athletes: Athlete[], spacing?: number) {
    super(scene)
    this.athletes = athletes
    this.lanes = athletes.length
    this.spacing = spacing
    this.rigs = athletes.map((a) => {
      const rig = new Rig(a)
      this.group.add(rig.root)
      return rig
    })
  }

  x(i: number): number {
    return this.spacing ? (i - (this.lanes - 1) / 2) * this.spacing : laneX(i, this.lanes)
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1, 0)
  }

  framing(): number {
    return Math.max(1, this.lanes * 0.6)
  }
}

export interface SprintRow {
  athlete: Athlete
  profile: SprintProfile
  samples: SprintState[]
  time: number
}

/** Sprint race with a live readout and a photo-finish replay. */
export class SprintStage extends LaneStage {
  readonly rows: SprintRow[]
  readonly distance: number
  readonly start = 1.2
  readonly unit: 'yd' | 'm'
  private readonly leader = new THREE.Vector3()

  constructor(scene: THREE.Scene, athletes: Athlete[], distance: number, unit: 'yd' | 'm') {
    super(scene, athletes)
    this.unit = unit
    this.distance = distance * (unit === 'yd' ? YD_TO_M : 1)
    this.rows = athletes.map((a) => {
      const profile = sprintProfile(a)
      const r = runSprint(profile, this.distance)
      return { athlete: a, profile, samples: r.samples, time: r.time }
    })
    this.duration = this.start + Math.max(...this.rows.map((r) => r.time)) + 1.6
    this.loop = false
    const winner = this.ranking()[0]!
    this.captionsList = [
      { at: 0, text: 'Set.' },
      { at: this.start, text: 'Go!' },
      { at: this.start + winner.time, text: `${winner.athlete.name} wins in ${winner.time.toFixed(2)} s.` },
    ]
    this.render(0)
  }

  ranking(): SprintRow[] {
    return [...this.rows].sort((x, y) => x.time - y.time)
  }

  /** Where each runner is at race time t (seconds since the gun). */
  stateOf(i: number, raceT: number): SprintState & { finished: boolean } {
    const row = this.rows[i]!
    if (raceT <= 0) return { t: 0, distance: 0, speed: 0, finished: false }
    if (raceT <= row.time) return { ...stateAt(row.samples, raceT), finished: false }
    // Ease to a jog past the line.
    const after = raceT - row.time
    const vEnd = row.samples[row.samples.length - 1]!.speed
    const slow = Math.min(after, 1.6)
    return { t: raceT, distance: this.distance + vEnd * slow - 0.5 * (vEnd / 1.8) * slow * slow, speed: Math.max(0, vEnd * (1 - slow / 1.8)), finished: true }
  }

  render(t: number): void {
    const raceT = t - this.start
    let lead = 0
    this.rigs.forEach((rig, i) => {
      const row = this.rows[i]!
      if (raceT < 0) {
        rig.applyPose(t < 0.4 ? idle(t) : sprintStance(rig.dims), { x: this.x(i), z: 0, yaw: 0 })
        return
      }
      const s = this.stateOf(i, raceT)
      lead = Math.max(lead, s.distance)
      const stride = rig.athlete.movement.run.strideLengthM
      const speedFrac = s.speed / row.profile.vmax
      // Leg cycle tied to distance so feet do not skate: one cycle per two strides,
      // with shorter strides in the first steps.
      const eff = stride * (0.55 + 0.45 * Math.min(1, speedFrac))
      const phase = (s.distance / (2 * eff)) % 1
      const accel = Math.max(0, 1 - raceT / 1.3)
      rig.applyPose(run(phase, rig.athlete.movement.run, Math.max(0.25, speedFrac), accel), { x: this.x(i), z: s.distance, yaw: 0 })
    })
    this.leader.set(0, 1, Math.max(0, lead - 1))
  }

  override focus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.leader)
  }

  override framing(): number {
    return Math.max(1.2, this.lanes * 0.7)
  }

  /** Elevated, from the side and a little behind, so every lane is visible. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(6 + this.lanes * 1.5, 4.5 + this.lanes * 0.6, -3)
  }

  /** Time window around the line for the photo finish. */
  photoWindow(): { from: number; to: number } {
    const r = this.ranking()
    return { from: this.start + r[0]!.time - 0.35, to: this.start + r[r.length - 1]!.time + 0.25 }
  }
}

/** Jump contest with a measuring pole (verticals) or tape (broad jump). */
export class JumpStage extends LaneStage {
  readonly event: JumpEvent
  readonly values: number[]

  constructor(scene: THREE.Scene, athletes: Athlete[], event: JumpEvent) {
    super(scene, athletes, event === 'broadJump' ? 2.2 : 1.9)
    this.event = event
    this.values = athletes.map((a) => jumpValue(a, event).value)
    this.duration = 2.4
    this.loop = true
    this.captionsList = [
      { at: 0, text: 'Load.' },
      { at: 0.75, text: 'Takeoff.' },
      { at: 1.2, text: event === 'broadJump' ? 'In the air.' : 'Peak height.' },
      { at: 1.9, text: 'Landing.' },
    ]
    const mat = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 })
    const marker = new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.5 })
    athletes.forEach((_a, i) => {
      const v = this.values[i]! * IN_TO_M
      if (event === 'broadJump') {
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 4.2), mat)
        tape.position.set(this.x(i) + 0.45, 0.005, 2.1)
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.04), marker)
        mark.position.set(this.x(i) + 0.3, 0.01, v)
        const label = textPlane(`${Math.floor(this.values[i]! / 12)}'${Math.round(this.values[i]! % 12)}"`, 0.35, '#ffffff')
        label.position.set(this.x(i) + 0.75, 0.01, v)
        this.group.add(tape, mark, label)
      } else {
        // Pole marks reach: standing reach plus the jump.
        const reach = (this.rigs[i]!.dims.height * 1.33) + v
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 8), mat)
        pole.position.set(this.x(i) + 0.75, 2, 0)
        const vane = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.06), marker)
        vane.position.set(this.x(i) + 0.55, reach, 0)
        this.group.add(pole, vane)
      }
    })
    this.render(0)
  }

  render(t: number): void {
    const u = Math.min(0.999, (t % this.duration) / this.duration)
    this.rigs.forEach((rig, i) => {
      const v = this.values[i]! * IN_TO_M
      const pose = jump(u, rig.dims, this.event === 'broadJump' ? { height: 0.5 + v * 0.05, sig: rig.athlete.movement.jump, forward: v } : { height: v, sig: { ...rig.athlete.movement.jump, takeoff: this.event === 'standingVertical' ? 'two-foot' : rig.athlete.movement.jump.takeoff } })
      rig.applyPose(pose, { x: this.x(i), z: 0, yaw: 0 })
    })
  }

  override focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1.2, this.event === 'broadJump' ? 1.4 : 0)
  }

  override facing(): number {
    return this.event === 'broadJump' ? 0.25 : -Math.PI / 2 * 0.8
  }
}

/** Lift-off: everyone lifts at once; rep mode counts reps at a load, max mode shows one heavy rep. */
export class LiftStage extends LaneStage {
  readonly event: LiftEvent
  readonly reps: number[]
  readonly loads: number[]
  private readonly props: HeldProp[]
  private readonly repTime = 2.2
  /** One heavy rep, played slower, instead of reps at a set load. */
  readonly maxMode: boolean

  constructor(scene: THREE.Scene, athletes: Athlete[], event: LiftEvent, repLoad?: number) {
    super(scene, athletes, 2.6)
    this.event = event
    this.maxMode = repLoad === undefined
    const maxes = athletes.map((a) => liftValue(a, event).value)
    this.loads = maxes.map((m) => repLoad ?? m)
    this.reps = maxes.map((m) => (repLoad ? repsAt(m, repLoad) : 1))
    this.duration = Math.max(1, ...this.reps) * this.repTime * (repLoad === undefined ? 1.6 : 1) + 1
    this.loop = false
    this.props = this.rigs.map((rig, i) => new HeldProp('barbell', this.group, rig, this.loads[i]!, event === 'squat'))
    this.captionsList = repLoad ? [{ at: 0, text: `Reps at ${repLoad} lb.` }, ...Array.from({ length: Math.max(...this.reps) }, (_, k) => ({ at: (k + 0.5) * this.repTime, text: `Rep ${k + 1}` }))] : [{ at: 0, text: 'One-rep max attempt.' }]
    if (event === 'bench') {
      this.rigs.forEach((rig, i) => {
        const b = makeBench()
        b.position.set(this.x(i), 0, 0.55 * rig.dims.height - rig.dims.hipY - 0.15)
        this.group.add(b)
      })
    }
    this.render(0)
  }

  render(t: number): void {
    this.rigs.forEach((rig, i) => {
      const done = t >= this.reps[i]! * this.repTime || this.reps[i] === 0
      const slow = this.maxMode ? 1.6 : 1
      const u = done ? (this.event === 'deadlift' ? 0.55 : 0) : ((t / slow) % this.repTime) / this.repTime
      const pose = lift(u, rig.dims, this.event)
      const back = 0.12 * rig.dims.girth * (rig.dims.height / 1.85)
      rig.applyPose(pose, this.event === 'bench' ? { x: this.x(i), y: 0.47 + back, z: 0.55 * rig.dims.height, yaw: 0 } : { x: this.x(i), z: 0, yaw: 0 })
      this.props[i]!.update(pose, false)
    })
  }

  repsDone(i: number, t: number): number {
    return Math.min(this.reps[i]!, Math.floor(t / this.repTime + 0.5))
  }

  override focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, this.event === 'bench' ? 0.7 : 1, 0)
  }

  override facing(): number {
    return -Math.PI / 2 * 0.75
  }

  override dispose(): void {
    this.props.forEach((p) => p.dispose())
    super.dispose()
  }
}

export interface ThrowRow {
  velocityMph: number
  distanceM: number
  angle: number
  path: [number, number][]
  time: number
}

/** Max-distance throws in parallel lanes, then the landing spots stay marked. */
export class ThrowStage extends LaneStage {
  readonly ball: Ball
  readonly rows: ThrowRow[]
  private readonly props: HeldProp[]
  private readonly kind: ThrowKind
  private readonly motionTime = 1.7

  constructor(scene: THREE.Scene, athletes: Athlete[], ball: Ball, velocities: number[]) {
    super(scene, athletes, 2.4)
    this.ball = ball
    this.kind = ball === 'football' ? 'football' : ball === 'baseball' ? 'baseball' : 'outlet'
    this.rows = velocities.map((mph) => {
      const best = maxDistance(mph * MPH_TO_MS * 0.95, BALLS[ball].drag)
      const f = flight(mph * MPH_TO_MS * 0.95, best.angle, BALLS[ball].drag)
      return { velocityMph: mph, distanceM: f.distance, angle: best.angle, path: f.path, time: f.time }
    })
    this.duration = this.motionTime * 0.58 + Math.max(...this.rows.map((r) => r.time)) + 1.2
    this.loop = false
    this.props = this.rigs.map((rig) => new HeldProp(ball, this.group, rig))
    const longest = Math.max(...this.rows.map((r) => r.distanceM))
    this.captionsList = [
      { at: 0, text: 'Wind up.' },
      { at: this.motionTime * 0.58, text: 'Release.' },
      { at: this.duration - 1, text: `Longest throw: ${(longest / 0.9144).toFixed(0)} yards.` },
    ]
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2f })
    this.rows.forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24).rotateX(-Math.PI / 2), ringMat)
      ring.position.set(this.x(i), 0.02, r.distanceM)
      ring.visible = false
      ring.name = `land-${i}`
      const label = textPlane(`${(r.distanceM / 0.9144).toFixed(0)} yd`, 0.6, '#ffffff')
      label.position.set(this.x(i), 0.03, r.distanceM + 1.3)
      label.rotation.z = Math.PI
      label.visible = false
      label.name = `label-${i}`
      this.group.add(ring, label)
    })
    this.render(0)
  }

  render(t: number): void {
    const release = this.motionTime * 0.58
    this.rigs.forEach((rig, i) => {
      const u = Math.min(0.999, t / this.motionTime)
      const pose = throwMotion(u, rig.dims, rig.athlete.movement.throw, this.kind)
      rig.applyPose(pose, { x: this.x(i), z: 0, yaw: 0 })
      const row = this.rows[i]!
      this.props[i]!.update(pose, false, (s, from, obj) => {
        const k = Math.min(1, s / row.time)
        const idx = Math.min(row.path.length - 1, Math.floor(k * (row.path.length - 1)))
        const [x, y] = row.path[idx]!
        obj.position.set(this.x(i), Math.max(0.1, from.y - 2 + y), from.z + x)
        if (this.ball === 'football') obj.quaternion.setFromEuler(new THREE.Euler(-Math.atan2(row.path[Math.min(idx + 1, row.path.length - 1)]![1] - y, 1), 0, 0))
        return true
      }, t - release)
      const landed = t - release >= row.time
      this.group.getObjectByName(`land-${i}`)!.visible = landed
      this.group.getObjectByName(`label-${i}`)!.visible = landed
    })
  }

  override focus(out: THREE.Vector3): THREE.Vector3 {
    const release = this.motionTime * 0.58
    const k = Math.max(0, Math.min(1, (this.time - release) / Math.max(...this.rows.map((r) => r.time))))
    return out.set(0, 1.5, Math.max(...this.rows.map((r) => r.distanceM)) * 0.5 * k)
  }

  override framing(): number {
    return 1.2 + Math.max(...this.rows.map((r) => r.distanceM)) / 30
  }

  /** High and behind the throwers, looking down the field. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(5 + this.lanes, 6, -9)
  }

  override dispose(): void {
    this.props.forEach((p) => p.dispose())
    super.dispose()
  }
}

type Path = { x: number; z: number }[]

/** Drill courses in metres, starting at the origin. */
function course(event: AgilityEvent): Path {
  const y = YD_TO_M
  switch (event) {
    case 'shuttle':
      return [
        { x: 0, z: 0 },
        { x: 5 * y, z: 0 },
        { x: -5 * y, z: 0 },
        { x: 0, z: 0 },
      ]
    case 'threeCone':
      return [
        { x: 0, z: 0 },
        { x: 0, z: 5 * y },
        { x: 0, z: 0 },
        { x: 0, z: 5 * y },
        { x: -0.6, z: 5 * y + 0.6 },
        { x: -5 * y, z: 5 * y },
        { x: -0.6, z: 5 * y + 0.4 },
        { x: 0, z: 4.4 },
        { x: 0, z: 0 },
      ]
    case 'laneAgility':
      return [
        { x: 0, z: 0 },
        { x: 0, z: 5.8 },
        { x: -4.9, z: 5.8 },
        { x: -4.9, z: 0 },
        { x: 0, z: 0 },
      ]
    default:
      return [{ x: 0, z: 0 }]
  }
}

/** Agility drills on cones; sit-and-reach as a seated reach. */
export class AgilityStage extends LaneStage {
  readonly event: AgilityEvent
  readonly times: number[]
  private readonly paths: Path[]
  private readonly segs: { len: number; cum: number }[][]

  constructor(scene: THREE.Scene, athletes: Athlete[], event: AgilityEvent) {
    super(scene, athletes, event === 'sitReach' ? 1.6 : 7.5)
    this.event = event
    this.times = athletes.map((a) => agilityValue(a, event).value)
    this.paths = athletes.map(() => course(event))
    this.segs = this.paths.map((p) => {
      let cum = 0
      return p.slice(1).map((pt, k) => {
        const len = Math.hypot(pt.x - p[k]!.x, pt.z - p[k]!.z)
        cum += len
        return { len, cum }
      })
    })
    this.duration = event === 'sitReach' ? 3 : 0.8 + Math.max(...this.times) + 1
    this.loop = event === 'sitReach'
    const cone = new THREE.MeshStandardMaterial({ color: 0xff7a2f })
    if (event !== 'sitReach') {
      this.paths.forEach((p, i) => {
        for (const pt of p) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 12), cone)
          const b = this.base(i)
          c.position.set(b.x + pt.x, 0.15, b.z + pt.z)
          c.castShadow = true
          this.group.add(c)
        }
      })
    }
    this.captionsList = event === 'sitReach' ? [{ at: 0, text: 'Reach forward and hold.' }] : [{ at: 0, text: 'Set.' }, { at: 0.8, text: 'Go!' }]
    this.render(0)
  }

  /** The shuttle runs across the field, so its lanes stack front to back instead. */
  private base(i: number): { x: number; z: number } {
    return this.event === 'shuttle' ? { x: 0, z: (i - (this.lanes - 1) / 2) * 3 } : { x: this.x(i), z: 0 }
  }

  private where(i: number, t: number): { x: number; z: number; yaw: number; speed: number; cutting: number } {
    const p = this.paths[i]!
    const segs = this.segs[i]!
    const total = segs[segs.length - 1]?.cum ?? 0
    const T = this.times[i]!
    const k = Math.max(0, Math.min(1, t / T))
    // Even pace along the course, slowing into each change of direction.
    const d = k * total
    let s = 0
    while (s < segs.length - 1 && segs[s]!.cum < d) s++
    const seg = segs[s]!
    const startCum = seg.cum - seg.len
    const local = seg.len ? (d - startCum) / seg.len : 0
    const a = p[s]!
    const b = p[s + 1] ?? a
    const x = a.x + (b.x - a.x) * local
    const z = a.z + (b.z - a.z) * local
    const yaw = Math.atan2(b.x - a.x, b.z - a.z)
    const edge = Math.min(local, 1 - local) * seg.len
    const cutting = s < segs.length - 1 && 1 - local < 0.15 ? 1 - (1 - local) / 0.15 : 0
    return { x, z, yaw, speed: Math.min(1, 0.35 + edge / 2.5), cutting }
  }

  render(t: number): void {
    this.rigs.forEach((rig, i) => {
      if (this.event === 'sitReach') {
        const reach = Math.min(1, Math.max(0.2, (this.times[i]! - 4) / 14))
        rig.applyPose(sitReach((t % 3) / 3, rig.dims, reach), { ...this.base(i), yaw: 0 })
        return
      }
      const raceT = t - 0.8
      if (raceT < 0) {
        rig.applyPose(sprintStance(rig.dims), { ...this.base(i), yaw: this.event === 'shuttle' ? Math.PI / 2 : 0 })
        return
      }
      const w = this.where(i, raceT)
      const finished = raceT >= this.times[i]!
      const pose = finished ? idle(t) : w.cutting > 0.5 ? cut(w.cutting, rig.dims, 1) : run(((raceT * 2.2) % 1), rig.athlete.movement.run, w.speed, 0)
      const b = this.base(i)
      rig.applyPose(pose, { x: b.x + w.x, z: b.z + w.z, yaw: w.yaw })
    })
  }

  override focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.event === 'shuttle' || this.event === 'sitReach' ? 0 : -1.5, 0.9, this.event === 'shuttle' ? 0 : 2.5)
  }

  override facing(): number {
    return this.event === 'shuttle' ? -Math.PI / 2 : -Math.PI / 4
  }
}
