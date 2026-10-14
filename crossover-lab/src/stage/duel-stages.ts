import * as THREE from 'three'
import type { Athlete } from '../data/types'
import { carryPath, CONTACT_PLANE, pitchFlight, pitchPosition, type Batter, type DuelSummary, type PitchEvent, type Pitcher } from '../sim/atbat'
import { ZONES, type Shot } from '../sim/shooting'
import { CONTACT_AT, idle, mirror, RELEASE_AT, SHOT_RELEASE_AT, shoot, swing, throwMotion } from '../three/motions'
import { makeBaseball, makeBasketball } from '../three/props'
import { Rig } from '../three/rig'
import { HeldProp } from './props-manager'
import { TimelineStage } from './timeline'

const PITCH_TIME = 1.9
const SWING_TIME = 1.8

interface PitchSlot {
  pa: number
  index: number
  event: PitchEvent
  start: number
  release: number
  arrive: number
  end: number
  flight: ReturnType<typeof pitchFlight>
  batted?: { path: [number, number, number][]; spray: number }
}

const OUTCOME_TEXT: Record<string, string> = { out: 'out', single: 'single', double: 'double', triple: 'triple', homeRun: 'home run', walk: 'walk', strikeout: 'strikeout' }
const RESULT_TEXT: Record<PitchEvent['result'], string> = { ball: 'Ball', calledStrike: 'Called strike', whiff: 'Swinging strike', foul: 'Foul', inPlay: 'In play' }

/** Pitch duel: every pitch of every plate appearance, with ball flight, swing timing and batted balls. */
export class AtBatStage extends TimelineStage {
  readonly pitcher: Pitcher
  readonly batter: Batter
  readonly duel: DuelSummary
  readonly slots: PitchSlot[] = []
  private readonly pitchRig: Rig
  private readonly batRig: Rig
  private readonly ball: THREE.Mesh
  private readonly bat: HeldProp
  private readonly handBall: HeldProp
  private readonly batterX: number

  constructor(scene: THREE.Scene, pitcher: Pitcher, batter: Batter, duel: DuelSummary) {
    super(scene)
    this.pitcher = pitcher
    this.batter = batter
    this.duel = duel
    this.loop = false
    this.pitchRig = new Rig(pitcher.athlete)
    this.batRig = new Rig(batter.athlete)
    this.rigs = [this.batRig, this.pitchRig]
    this.group.add(this.pitchRig.root, this.batRig.root)
    this.batterX = batter.batsLeft ? -0.95 : 0.95
    this.ball = makeBaseball()
    this.group.add(this.ball)
    this.bat = new HeldProp('bat', this.group, this.batRig)
    this.handBall = new HeldProp('baseball', this.group, this.pitchRig)
    // Release from where the model's hand actually is, so the ball leaves the hand.
    const relPose = this.pitchPose(RELEASE_AT.pitch)
    this.pitchRig.applyPose(relPose, this.pitchBase())
    this.pitchRig.root.updateMatrixWorld(true)
    const hand = this.pitchRig.joints[pitcher.throwsRight ? 'wristR' : 'wristL'].getWorldPosition(new THREE.Vector3())
    const realPitcher: Pitcher = { ...pitcher, release: { x: hand.x, y: hand.y - 0.08, z: hand.z } }
    let t = 0.4
    duel.appearances.forEach((pa, paIndex) => {
      pa.pitches.forEach((ev, index) => {
        const flight = pitchFlight(realPitcher, ev.pitch, ev.flight.plate)
        const release = t + RELEASE_AT.pitch * PITCH_TIME
        const arrive = release + flight.time
        const batted = ev.batted ? { path: carryPath(ev.batted.exitVelocityMph, ev.batted.launchAngleDeg), spray: ev.batted.sprayDeg } : undefined
        const end = arrive + (batted ? Math.min(4.5, batted.path[batted.path.length - 1]![0]) + 0.8 : 0.9)
        this.slots.push({ pa: paIndex, index, event: ev, start: t, release, arrive, end, flight, ...(batted ? { batted } : {}) })
        t = end
      })
      const last = this.slots[this.slots.length - 1]!
      this.captionsList.push({ at: last.end - 0.6, text: `Result: ${OUTCOME_TEXT[pa.result]}.` })
      t += 0.6
    })
    this.duration = t
    for (const s of this.slots) {
      const e = s.event
      this.captionsList.push({ at: s.start, text: `Plate appearance ${s.pa + 1}, pitch ${s.index + 1}: ${e.pitch.mph.toFixed(0)} mph ${e.pitch.type}. Count ${e.balls}-${e.strikes}.` })
      this.captionsList.push({ at: s.arrive, text: `${RESULT_TEXT[e.result]}${e.batted ? `: ${e.batted.exitVelocityMph.toFixed(0)} mph off the bat at ${e.batted.launchAngleDeg.toFixed(0)}°, ${OUTCOME_TEXT[e.batted.outcome]}` : ''}.` })
    }
    this.captionsList.sort((a, b) => a.at - b.at)
    this.render(0)
  }

  private pitchBase() {
    return { x: 0, y: 0.25, z: 18.2, yaw: Math.PI }
  }

  private pitchPose(u: number) {
    const p = throwMotion(u, this.pitchRig.dims, this.pitchRig.athlete.movement.throw, 'pitch')
    return this.pitcher.throwsRight ? p : mirror(p)
  }

  slotAt(t: number): PitchSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? (t >= this.duration ? this.slots[this.slots.length - 1] : this.slots[0])
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    if (!slot) return
    const local = t - slot.start
    const pu = Math.min(0.999, local / PITCH_TIME)
    const pPose = this.pitchPose(pu)
    this.pitchRig.applyPose(pPose, this.pitchBase())
    this.handBall.update(pPose, !this.pitcher.throwsRight, () => false, 0)
    // Batter: swing timed so contact lands when the pitch arrives; a take stops after the stride.
    const swingStart = slot.arrive - CONTACT_AT * SWING_TIME
    const su = Math.max(0, (t - swingStart) / SWING_TIME)
    const take = !slot.event.swung
    let bPose = swing(take ? Math.min(su, 0.46) : Math.min(0.999, su), this.batRig.dims, this.batRig.athlete.movement.swing)
    if (this.batter.batsLeft) bPose = mirror(bPose)
    this.batRig.applyPose(bPose, { x: this.batterX, z: 0.1, yaw: this.batter.batsLeft ? Math.PI / 2 : -Math.PI / 2 })
    this.bat.update(bPose, this.batter.batsLeft)
    // Ball.
    this.ball.visible = t >= slot.release
    if (t >= slot.release && t < slot.arrive) {
      const p = pitchPosition(slot.flight, t - slot.release)
      this.ball.position.set(p[0], p[1], p[2])
    } else if (t >= slot.arrive) {
      const after = t - slot.arrive
      if (slot.batted) {
        const path = slot.batted.path
        const sample = path.find((x) => x[0] >= after) ?? path[path.length - 1]!
        const spray = (slot.batted.spray * Math.PI) / 180
        this.ball.position.set(Math.sin(spray) * sample[1], sample[2], CONTACT_PLANE + Math.cos(spray) * sample[1])
      } else {
        const p = pitchPosition(slot.flight, slot.flight.time + Math.min(after, 0.12))
        this.ball.position.set(p[0], p[1], p[2])
        this.ball.visible = after < 0.3
      }
    }
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    const slot = this.slotAt(this.time)
    if (slot?.batted && this.time > slot.arrive) {
      const k = Math.min(1, (this.time - slot.arrive) / 1.5)
      return out.set(this.ball.position.x * 0.5 * k, 1 + 2 * k, this.ball.position.z * 0.5 * k + 6 * (1 - k))
    }
    return out.set(0, 1.2, 7)
  }

  override facing(): number {
    // Broadcast angle from behind and above the pitcher's shoulder, centre-field camera style.
    return Math.PI / 2 + 0.25
  }

  framing(): number {
    return 2.4
  }

  override focusRig(): Rig {
    return this.batRig
  }

  /** Pitches thrown before time t (for the strike-zone plot). */
  pitchesUpTo(t: number): PitchSlot[] {
    return this.slots.filter((s) => s.arrive <= t)
  }

  override dispose(): void {
    this.bat.dispose()
    this.handBall.dispose()
    super.dispose()
  }
}

interface ShotSlot {
  athlete: number
  shot: Shot
  start: number
  release: number
  arrive: number
  end: number
  from?: THREE.Vector3
}

/** Shooting contest: athletes take turns from the contest spots; makes drop through, misses rim out. */
export class ShootingStage extends TimelineStage {
  readonly athletes: Athlete[]
  readonly shots: Shot[][]
  readonly slots: ShotSlot[] = []
  private readonly ball: THREE.Mesh
  private readonly shotTime = 1.3

  constructor(
    scene: THREE.Scene,
    athletes: Athlete[],
    shots: Shot[][],
    private readonly points: (s: Shot) => number,
  ) {
    super(scene)
    this.athletes = athletes
    this.shots = shots
    this.loop = false
    this.rigs = athletes.map((a) => {
      const r = new Rig(a)
      this.group.add(r.root)
      return r
    })
    this.ball = makeBasketball()
    this.group.add(this.ball)
    let t = 0.3
    const rounds = Math.max(...shots.map((s) => s.length))
    for (let k = 0; k < rounds; k++) {
      shots.forEach((list, i) => {
        const shot = list[k]
        if (!shot) return
        const release = t + SHOT_RELEASE_AT * this.shotTime
        const arrive = release + 0.85
        this.slots.push({ athlete: i, shot, start: t, release, arrive, end: arrive + 0.35 })
        t = arrive + 0.35
      })
    }
    this.duration = t + 0.5
    for (const s of this.slots) {
      const z = ZONES[s.shot.zone]
      this.captionsList.push({ at: s.start, text: `${athletes[s.athlete]!.name}: ${z.label}${s.shot.isMoneyBall ? ' (money ball)' : ''}.` })
      this.captionsList.push({ at: s.arrive, text: s.shot.made ? 'Good.' : 'Miss.' })
    }
    this.render(0)
  }

  private spot(s: ShotSlot): { x: number; z: number; yaw: number } {
    const z = ZONES[s.shot.zone]
    return { x: z.x, z: z.y, yaw: Math.atan2(-z.x, -z.y) }
  }

  slotAt(t: number): ShotSlot | undefined {
    return this.slots.find((s) => t >= s.start && t < s.end) ?? this.slots[this.slots.length - 1]
  }

  render(t: number): void {
    const slot = this.slotAt(t)
    this.rigs.forEach((rig, i) => {
      if (slot && slot.athlete === i) {
        const sp = this.spot(slot)
        const u = Math.min(0.999, (t - slot.start) / this.shotTime)
        const pose = shoot(u, rig.dims, rig.athlete.movement.shoot)
        rig.applyPose(pose, { x: sp.x, z: sp.z, yaw: sp.yaw })
        if (t < slot.release) {
          rig.root.updateMatrixWorld(true)
          const a = rig.joints.wristR.getWorldPosition(new THREE.Vector3())
          const b = rig.joints.wristL.getWorldPosition(new THREE.Vector3())
          this.ball.position.copy(a).add(b).multiplyScalar(0.5)
          this.ball.position.y += 0.05
          slot.from = this.ball.position.clone()
        }
      } else {
        // Waiting athletes stand along the baseline.
        rig.applyPose(idle(t + i), { x: -6.5 + i * 1.3, z: -2.4, yaw: 0 })
      }
    })
    if (!slot || t < slot.release) return
    const from = slot.from ?? new THREE.Vector3(0, 2.4, 5)
    const rim = new THREE.Vector3(slot.shot.made ? 0 : slot.shot.miss * 0.24, 3.05, slot.shot.made ? 0 : 0.18)
    if (t < slot.arrive) {
      const k = (t - slot.release) / (slot.arrive - slot.release)
      const apex = Math.max(from.y, rim.y) + 1.1
      this.ball.position.lerpVectors(from, rim, k)
      this.ball.position.y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * (2 * apex - (from.y + rim.y) / 2) + k * k * rim.y
    } else {
      const after = t - slot.arrive
      if (slot.shot.made) this.ball.position.set(0, 3.05 - 9.81 * 0.5 * after * after - after * 1.5, 0)
      else this.ball.position.set(rim.x + Math.sign(slot.shot.miss || 1) * after * 2.5, 3.05 + 1.5 * after - 4.9 * after * after, rim.z + after * 1.5)
      this.ball.position.y = Math.max(0.12, this.ball.position.y)
    }
  }

  scoreAt(t: number): number[] {
    const out = this.athletes.map(() => 0)
    for (const s of this.slots) if (s.arrive <= t && s.shot.made) out[s.athlete]! += this.points(s.shot)
    return out
  }

  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1.6, 3)
  }

  /** From above the top of the key, so every spot and the rim are in view. */
  broadcastOffset(): THREE.Vector3 {
    return new THREE.Vector3(1.5, 5.5, 10.5)
  }

  framing(): number {
    return 2
  }
}
