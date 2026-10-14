import type { Athlete, Quality } from '../data/types'
import { weakest } from '../data/types'
import { IN_TO_M, LB_TO_KG } from '../data/metrics'
import { resolveMetric } from '../data/resolve'

/**
 * Cross-sport normalization. Raw numbers favor bigger athletes in strength and power events and
 * taller athletes in reach events, so head-to-heads can show a size-adjusted figure next to the
 * raw one. Every normalized figure is at best ESTIMATED.
 */
export const REFERENCE_WEIGHT_LB = 200
export const REFERENCE_HEIGHT_IN = 74

export interface Normalized {
  value: number
  quality: Quality
  method: string
}

/** Load lifted, scaled to a 200 lb athlete with allometric scaling (strength ∝ mass^0.67). */
export function strengthAtReference(loadLb: number, bodyweightLb: number): number {
  return loadLb * Math.pow(REFERENCE_WEIGHT_LB / bodyweightLb, 0.67)
}

/** Speed scaled to a 6'2" athlete at equal Froude number (v ∝ √leg length). */
export function speedAtReference(speed: number, heightIn: number): number {
  return speed * Math.sqrt(REFERENCE_HEIGHT_IN / heightIn)
}

/** Sayers (1999) peak power from jump height: W = 60.7·cm + 45.3·kg − 2055. */
export function sayersPowerW(jumpIn: number, weightLb: number): number {
  return 60.7 * jumpIn * 2.54 + 45.3 * weightLb * LB_TO_KG - 2055
}

export function normalizeStrength(a: Athlete, loadLb: number, loadQuality: Quality): Normalized | undefined {
  const w = resolveMetric(a, 'weightLb')
  if (!w) return undefined
  return {
    value: strengthAtReference(loadLb, w.value),
    quality: weakest(loadQuality, w.quality, 'ESTIMATED'),
    method: `Scaled to a ${REFERENCE_WEIGHT_LB} lb athlete: load × (${REFERENCE_WEIGHT_LB} ÷ bodyweight)^0.67.`,
  }
}

export function normalizeSpeed(a: Athlete, speed: number, speedQuality: Quality): Normalized | undefined {
  const h = resolveMetric(a, 'heightIn')
  if (!h) return undefined
  return {
    value: speedAtReference(speed, h.value),
    quality: weakest(speedQuality, h.quality, 'ESTIMATED'),
    method: `Scaled to a ${REFERENCE_HEIGHT_IN}-inch athlete at equal Froude number: speed × √(${REFERENCE_HEIGHT_IN} ÷ height).`,
  }
}

export function normalizeJump(a: Athlete, jumpIn: number, jumpQuality: Quality): Normalized | undefined {
  const w = resolveMetric(a, 'weightLb')
  if (!w) return undefined
  const kg = w.value * LB_TO_KG
  return {
    value: sayersPowerW(jumpIn, w.value) / kg,
    quality: weakest(jumpQuality, w.quality, 'ESTIMATED'),
    method: 'Peak power per kilogram (Sayers equation), so heavier jumpers get credit for moving more mass.',
  }
}

/** Height in metres, for the 3D rig and physics. */
export function heightM(a: Athlete): number {
  return (resolveMetric(a, 'heightIn')?.value ?? 74) * IN_TO_M
}

export function massKg(a: Athlete): number {
  return (resolveMetric(a, 'weightLb')?.value ?? 205) * LB_TO_KG
}
