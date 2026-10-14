import type { Athlete, League } from '../data/types'
import { resolveMetric } from '../data/resolve'
import { jumpValue } from '../sim/events'
import { sprintProfile } from '../sim/sprint'
import { IN_TO_M } from '../data/metrics'
import { CONTACT_AT, idle, measurePose, jump, lift, mirror, RELEASE_AT, run, SHOT_RELEASE_AT, shoot, sitReach, sprintStance, swing, throwMotion, cut, type Pose } from '../three/motions'
import type { Rig } from '../three/rig'
import type { Caption } from './timeline'

export type MotionId = 'idle' | 'tpose' | 'run' | 'sprintStart' | 'vertical' | 'broad' | 'throw' | 'pitch' | 'outlet' | 'swing' | 'shoot' | 'bench' | 'squat' | 'deadlift' | 'clean' | 'sitReach' | 'cut'

export type PropKind = 'football' | 'baseball' | 'basketball' | 'bat' | 'barbell' | 'none'

export interface MotionSpec {
  id: MotionId
  label: string
  loop: boolean
  /** Seconds for one cycle or one rep. */
  duration: (a: Athlete) => number
  /** Captions at normalized times. */
  captions: Caption[]
  prop: (a: Athlete) => PropKind
  /** u is 0..1 through the motion. */
  pose: (rig: Rig, u: number) => Pose
  /** Normalized time of release or contact, when the motion has one. */
  release?: number
}

const NATIVE_THROW: Record<League, MotionId> = { NFL: 'throw', MLB: 'pitch', NBA: 'outlet' }

export function signatureMotion(a: Athlete): MotionId {
  return a.league === 'NFL' ? 'run' : a.league === 'MLB' ? 'swing' : 'shoot'
}

export function nativeThrow(a: Athlete): MotionId {
  return NATIVE_THROW[a.league]
}

function cycleSeconds(a: Athlete): number {
  // One cycle is two steps at top-speed cadence.
  return 120 / a.movement.run.cadenceSpm
}

export const MOTIONS: Record<MotionId, MotionSpec> = {
  idle: {
    id: 'idle',
    label: 'Stance',
    loop: true,
    duration: () => 4,
    captions: [{ at: 0, text: 'Relaxed stance.' }],
    prop: () => 'none',
    pose: (_rig, u) => idle(u * 4),
  },
  tpose: {
    id: 'tpose',
    label: 'Measurement pose',
    loop: true,
    duration: () => 4,
    captions: [{ at: 0, text: 'Arms out to show wingspan.' }],
    prop: () => 'none',
    pose: (_rig, u) => measurePose(u * 4),
  },
  run: {
    id: 'run',
    label: 'Top-speed stride',
    loop: true,
    duration: cycleSeconds,
    captions: [
      { at: 0, text: 'Right foot strikes under the hips.' },
      { at: 0.25, text: 'Right leg drives back; left knee comes through high.' },
      { at: 0.5, text: 'Left foot strikes.' },
      { at: 0.75, text: 'Left leg drives back; right knee comes through.' },
    ],
    prop: (a) => (a.league === 'NFL' ? 'football' : 'none'),
    pose: (rig, u) => run(u, rig.athlete.movement.run, 1, 0, rig.athlete.league === 'NFL' ? 'footballR' : 'none'),
  },
  sprintStart: {
    id: 'sprintStart',
    label: 'Sprint start',
    loop: false,
    duration: () => 1.6,
    captions: [
      { at: 0, text: 'Set in a two-point stance.' },
      { at: 0.3, text: 'First steps: deep forward lean, short powerful strides.' },
      { at: 0.75, text: 'Rising toward upright running.' },
    ],
    prop: () => 'none',
    pose: (rig, u) => {
      if (u < 0.25) return sprintStance(rig.dims)
      const k = (u - 0.25) / 0.75
      return run((k * 3.2) % 1, rig.athlete.movement.run, 0.3 + 0.6 * k, 1 - k)
    },
  },
  vertical: {
    id: 'vertical',
    label: 'Vertical jump',
    loop: true,
    duration: () => 1.9,
    captions: [
      { at: 0, text: 'Countermovement: hips and knees load, arms swing back.' },
      { at: 0.3, text: 'Drive: hips, knees and ankles extend together; arms swing up.' },
      { at: 0.42, text: 'Takeoff.' },
      { at: 0.62, text: 'Peak of the jump.' },
      { at: 0.82, text: 'Landing: knees bend to absorb the force.' },
    ],
    prop: () => 'none',
    pose: (rig, u) => jump(u, rig.dims, { height: jumpValue(rig.athlete, 'maxVertical').value * IN_TO_M, sig: rig.athlete.movement.jump }),
  },
  broad: {
    id: 'broad',
    label: 'Broad jump',
    loop: true,
    duration: () => 2,
    captions: [
      { at: 0, text: 'Load: deep hip hinge, arms back.' },
      { at: 0.3, text: 'Drive out at about 40 degrees.' },
      { at: 0.55, text: 'Knees tuck to reach the feet forward.' },
      { at: 0.82, text: 'Stick the landing.' },
    ],
    prop: () => 'none',
    pose: (rig, u) => jump(u, rig.dims, { height: 0.55, sig: rig.athlete.movement.jump, forward: jumpValue(rig.athlete, 'broadJump').value * IN_TO_M }),
  },
  throw: {
    id: 'throw',
    label: 'Football throw',
    loop: true,
    duration: () => 1.7,
    release: RELEASE_AT.football,
    captions: [
      { at: 0, text: 'Closed stance, ball at the ear.' },
      { at: 0.25, text: 'Stride toward the target.' },
      { at: RELEASE_AT.football - 0.13, text: 'Front foot plants; hips open ahead of the shoulders.' },
      { at: RELEASE_AT.football, text: 'Release.' },
      { at: RELEASE_AT.football + 0.08, text: 'Follow-through across the body.' },
    ],
    prop: () => 'football',
    pose: (rig, u) => handed(rig, throwMotion(u, rig.dims, rig.athlete.movement.throw, 'football'), rig.athlete.throws === 'L'),
  },
  pitch: {
    id: 'pitch',
    label: 'Pitch',
    loop: true,
    duration: () => 1.9,
    release: RELEASE_AT.pitch,
    captions: [
      { at: 0, text: 'Set position.' },
      { at: 0.12, text: 'Leg lift: weight gathers over the back leg.' },
      { at: 0.35, text: 'Stride toward the plate; hips lead.' },
      { at: RELEASE_AT.pitch - 0.13, text: 'Foot strike: maximum hip-shoulder separation.' },
      { at: RELEASE_AT.pitch - 0.05, text: 'Arm cocking: maximum layback.' },
      { at: RELEASE_AT.pitch, text: 'Release.' },
      { at: RELEASE_AT.pitch + 0.1, text: 'Deceleration and follow-through.' },
    ],
    prop: () => 'baseball',
    pose: (rig, u) => handed(rig, throwMotion(u, rig.dims, rig.athlete.movement.throw, 'pitch'), rig.athlete.throws === 'L'),
  },
  outlet: {
    id: 'outlet',
    label: 'Outlet pass',
    loop: true,
    duration: () => 1.5,
    release: RELEASE_AT.outlet,
    captions: [
      { at: 0, text: 'Ball in one hand behind the head.' },
      { at: 0.3, text: 'Step and turn the shoulders.' },
      { at: RELEASE_AT.outlet, text: 'Release.' },
    ],
    prop: () => 'basketball',
    pose: (rig, u) => throwMotion(u, rig.dims, rig.athlete.movement.throw, 'outlet'),
  },
  swing: {
    id: 'swing',
    label: 'Swing',
    loop: true,
    duration: () => 1.8,
    release: CONTACT_AT,
    captions: [
      { at: 0, text: 'Stance: hands by the back shoulder.' },
      { at: 0.15, text: 'Load: hands and hips coil back.' },
      { at: 0.35, text: 'Stride: front foot goes down.' },
      { at: 0.5, text: 'Hips fire, then the shoulders.' },
      { at: CONTACT_AT, text: 'Contact.' },
      { at: 0.7, text: 'Extension and finish.' },
    ],
    prop: () => 'bat',
    pose: (rig, u) => handed(rig, swing(u, rig.dims, rig.athlete.movement.swing), rig.athlete.bats === 'L' || (rig.athlete.bats === undefined && rig.athlete.movement.swing.batsLeft)),
  },
  shoot: {
    id: 'shoot',
    label: 'Jump shot',
    loop: true,
    duration: () => 1.6,
    release: SHOT_RELEASE_AT,
    captions: [
      { at: 0, text: 'Catch and dip.' },
      { at: 0.25, text: 'Rise: legs drive, ball goes to the set point.' },
      { at: SHOT_RELEASE_AT, text: 'Release at the top of the jump.' },
      { at: 0.6, text: 'Hold the follow-through.' },
      { at: 0.82, text: 'Land balanced.' },
    ],
    prop: () => 'basketball',
    pose: (rig, u) => shoot(u, rig.dims, rig.athlete.movement.shoot),
  },
  bench: liftSpec('bench', 'Bench press', ['Bar over the shoulders, arms locked.', 'Lower to the chest under control.', 'Press back to lockout.']),
  squat: liftSpec('squat', 'Back squat', ['Bar on the upper back.', 'Sit down and back to depth.', 'Drive up through the mid-foot.']),
  deadlift: liftSpec('deadlift', 'Deadlift', ['Bar over the mid-foot, back flat.', 'Push the floor away; hips and shoulders rise together.', 'Lockout, then lower under control.']),
  clean: {
    ...liftSpec('clean', 'Power clean', ['First pull from the floor.', 'Triple extension.', 'Drop under into the front rack.', 'Stand up.']),
    captions: [
      { at: 0, text: 'First pull from the floor.' },
      { at: 0.3, text: 'Second pull: triple extension.' },
      { at: 0.45, text: 'Drop under into the front rack.' },
      { at: 0.8, text: 'Stand up with the bar.' },
    ],
  },
  sitReach: {
    id: 'sitReach',
    label: 'Sit and reach',
    loop: true,
    duration: () => 3,
    captions: [
      { at: 0, text: 'Seated, legs straight.' },
      { at: 0.3, text: 'Reach forward slowly.' },
      { at: 0.5, text: 'Hold the furthest point.' },
    ],
    prop: () => 'none',
    pose: (rig, u) => sitReach(u, rig.dims, Math.min(1, Math.max(0.2, ((resolveMetric(rig.athlete, 'sitReachIn')?.value ?? 13) - 4) / 14))),
  },
  cut: {
    id: 'cut',
    label: 'Cut',
    loop: true,
    duration: () => 1.2,
    captions: [
      { at: 0, text: 'Approach.' },
      { at: 0.35, text: 'Plant: hips drop, inside edge of the foot grips.' },
      { at: 0.7, text: 'Push off in the new direction.' },
    ],
    prop: () => 'none',
    pose: (rig, u) => cut(u, rig.dims, 1),
  },
}

function liftSpec(id: 'bench' | 'squat' | 'deadlift' | 'clean', label: string, lines: string[]): MotionSpec {
  return {
    id,
    label,
    loop: true,
    duration: () => (id === 'clean' ? 2.6 : 2.4),
    captions: lines.map((text, i) => ({ at: i / lines.length, text })),
    prop: () => 'barbell',
    pose: (rig, u) => lift(u, rig.dims, id),
  }
}

function handed(_rig: Rig, p: Pose, left: boolean): Pose {
  return left ? mirror(p) : p
}

export function motionsFor(a: Athlete): MotionId[] {
  const base: MotionId[] = ['idle', 'run', 'sprintStart', 'vertical', 'broad', 'cut']
  const sport: MotionId[] = a.league === 'NFL' ? ['throw'] : a.league === 'MLB' ? ['swing', 'pitch'] : ['shoot', 'outlet']
  return [...base.slice(0, 2), ...sport, ...base.slice(2), 'squat', 'bench', 'deadlift', 'clean', 'sitReach', 'tpose']
}

/** Top-speed share for a cadence label in the UI. */
export function topSpeedLabel(a: Athlete): string {
  return `${(sprintProfile(a).vmax / 0.44704).toFixed(1)} mph`
}
