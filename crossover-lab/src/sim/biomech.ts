import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { jointAngles } from '../three/motions'
import type { Rig } from '../three/rig'
import type { MotionSpec } from '../stage/motion-library'
import { massKg } from './normalize'
import { sprintProfile } from './sprint'

export interface AngleSamples {
  u: number[]
  kneeR: number[]
  hipR: number[]
  elbowR: number[]
  trunkLean: number[]
  trunkTwist: number[]
  hipYaw: number[]
}

/** Joint angles (degrees) through one cycle of a motion, read from the model's poses. */
export function sampleAngles(rig: Rig, motion: MotionSpec, n = 90): AngleSamples {
  const out: AngleSamples = { u: [], kneeR: [], hipR: [], elbowR: [], trunkLean: [], trunkTwist: [], hipYaw: [] }
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const a = jointAngles(motion.pose(rig, Math.min(0.9999, u)))
    out.u.push(u)
    out.kneeR.push(a.kneeR)
    out.hipR.push(a.hipR)
    out.elbowR.push(a.elbowR)
    out.trunkLean.push(a.trunkLean)
    out.trunkTwist.push(a.trunkTwist + a.hipYaw)
    out.hipYaw.push(a.hipYaw)
  }
  return out
}

/** Peak rotation speed (deg/s) of a series sampled evenly over `duration` seconds. */
export function peakRate(series: number[], duration: number): number {
  const dt = duration / (series.length - 1)
  let peak = 0
  for (let i = 1; i < series.length; i++) peak = Math.max(peak, Math.abs(series[i]! - series[i - 1]!) / dt)
  return peak
}

export interface GroundReaction {
  peakN: number
  bodyweights: number
  contactMs: number
  flightMs: number
  quality: Quality
  method: string
}

/**
 * Peak vertical ground reaction force at top speed from the spring-mass sine model
 * (Morin et al. 2005): F = m·g·(π/2)·(flight/contact + 1). Contact time shortens with speed
 * (about 0.95/v seconds); step time comes from cadence.
 */
export function groundReaction(a: Athlete): GroundReaction {
  const p = sprintProfile(a)
  const m = massKg(a)
  const step = 60 / a.movement.run.cadenceSpm
  const contact = Math.min(step * 0.7, 0.95 / p.vmax)
  const flight = Math.max(0, step - contact)
  const bodyweights = (Math.PI / 2) * (flight / contact + 1)
  return {
    peakN: m * 9.81 * bodyweights,
    bodyweights,
    contactMs: contact * 1000,
    flightMs: flight * 1000,
    quality: weakest(p.quality, a.movement.quality, 'ESTIMATED'),
    method: 'Spring-mass sine model: peak force = body weight × π/2 × (flight time ÷ contact time + 1), at the modelled top speed and cadence.',
  }
}
