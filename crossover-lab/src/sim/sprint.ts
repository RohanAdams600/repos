import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { FTS_TO_MS, MPH_TO_MS, YD_TO_M } from '../data/metrics'
import { resolveMetric } from '../data/resolve'

/**
 * Sprint model: v(t) = vmax * (1 - e^(-t/tau)) * fatigue(t), the classic Furusawa-Hill-Parkinson
 * acceleration curve with a linear speed loss after 6 s for the 100 and 200.
 * vmax is solved from whichever verified sprint the athlete has; tau is a per-league constant.
 */
export interface SprintProfile {
  vmax: number
  tau: number
  /** Share of speed lost per second after FATIGUE_ONSET_S. */
  fatigue: number
  quality: Quality
  basis: string
}

export const TAU_S = 0.7
export const FATIGUE_ONSET_S = 6
/** Statcast sprint speed is the best one-second window on the bases, turns included. */
export const SPRINT_SPEED_TO_TOP = 1.08

/** Distance covered by time t with no fatigue. */
export function distanceAt(vmax: number, tau: number, t: number): number {
  return vmax * (t - tau * (1 - Math.exp(-t / tau)))
}

/** Solve vmax so that `distance` metres takes `time` seconds. */
export function solveVmax(distance: number, time: number, tau: number): number {
  return distance / (time - tau * (1 - Math.exp(-time / tau)))
}

export function sprintProfile(a: Athlete): SprintProfile {
  const tau = TAU_S
  const drop = resolveMetric(a, 'repeatSprintDropPct')
  const fatigue = 0.006 + 0.0006 * (drop?.value ?? 5)
  const forty = resolveMetric(a, 'fortyS')
  if (forty) {
    return {
      vmax: solveVmax(40 * YD_TO_M, forty.value, tau),
      tau,
      fatigue,
      quality: weakest(forty.quality, 'ESTIMATED'),
      basis: `Top speed solved from the ${forty.value.toFixed(2)} s 40-yard dash (${forty.quality.toLowerCase()}).`,
    }
  }
  const quarter = resolveMetric(a, 'threeQuarterSprintS')
  if (quarter) {
    return {
      vmax: solveVmax(75 * 0.3048, quarter.value, tau),
      tau,
      fatigue,
      quality: weakest(quarter.quality, 'ESTIMATED'),
      basis: `Top speed solved from the ${quarter.value.toFixed(2)} s three-quarter-court sprint (${quarter.quality.toLowerCase()}).`,
    }
  }
  const sprint = resolveMetric(a, 'sprintSpeedFtS')
  if (sprint) {
    return {
      vmax: sprint.value * FTS_TO_MS * SPRINT_SPEED_TO_TOP,
      tau,
      fatigue,
      quality: weakest(sprint.quality, 'ESTIMATED'),
      basis: `Statcast sprint speed of ${sprint.value.toFixed(1)} ft/s, raised ${Math.round((SPRINT_SPEED_TO_TOP - 1) * 100)}% for a straight line with no turns.`,
    }
  }
  const top = resolveMetric(a, 'topSpeedMph')
  if (top) return { vmax: top.value * MPH_TO_MS, tau, fatigue, quality: top.quality, basis: 'Measured top speed.' }
  return { vmax: 8.5, tau, fatigue, quality: 'SIMULATED', basis: 'No sprint data; league-average default.' }
}

export interface SprintState {
  t: number
  distance: number
  speed: number
}

/** Integrate the model with fatigue. Returns samples every `dt` seconds until `distance` is reached. */
export function runSprint(p: SprintProfile, distance: number, dt = 1 / 240): { time: number; samples: SprintState[] } {
  const samples: SprintState[] = [{ t: 0, distance: 0, speed: 0 }]
  let t = 0
  let d = 0
  while (d < distance && t < 120) {
    const v0 = speedAt(p, t)
    const v1 = speedAt(p, t + dt)
    const step = ((v0 + v1) / 2) * dt
    if (d + step >= distance) {
      const frac = (distance - d) / step
      t += dt * frac
      d = distance
      samples.push({ t, distance: d, speed: speedAt(p, t) })
      break
    }
    t += dt
    d += step
    samples.push({ t, distance: d, speed: v1 })
  }
  return { time: t, samples }
}

export function speedAt(p: SprintProfile, t: number): number {
  const base = p.vmax * (1 - Math.exp(-t / p.tau))
  const loss = Math.max(0, t - FATIGUE_ONSET_S) * p.fatigue
  return base * Math.max(0.5, 1 - loss)
}

/** Linear lookup into integrated samples. */
export function stateAt(samples: SprintState[], t: number): SprintState {
  if (t <= 0) return samples[0]!
  const last = samples[samples.length - 1]!
  if (t >= last.t) return last
  let lo = 0
  let hi = samples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid]!.t <= t) lo = mid
    else hi = mid
  }
  const a = samples[lo]!
  const b = samples[hi]!
  const k = (t - a.t) / (b.t - a.t || 1)
  return { t, distance: a.distance + (b.distance - a.distance) * k, speed: a.speed + (b.speed - a.speed) * k }
}

export function topSpeedMph(a: Athlete): { value: number; quality: Quality; basis: string } {
  const p = sprintProfile(a)
  return { value: p.vmax / MPH_TO_MS, quality: p.quality, basis: p.basis }
}
