import type { Measured } from './types'

/** A value checked against a cited source. */
export function verified(value: number, sourceId: string, asOf?: string, note?: string): Measured {
  return { value, quality: 'VERIFIED', sourceId, ...(asOf ? { asOf } : {}), ...(note ? { note } : {}) }
}

/** A value derived from verified inputs, or one whose sources disagree. The note says which. */
export function estimated(value: number, note: string, sourceId?: string, asOf?: string): Measured {
  return { value, quality: 'ESTIMATED', note, ...(sourceId ? { sourceId } : {}), ...(asOf ? { asOf } : {}) }
}

/** A demo value with no public source behind it. */
export function simulated(value: number, note = 'No public source; demo value until a licensed feed is connected.'): Measured {
  return { value, quality: 'SIMULATED', note }
}

export const RETRIEVED = '2026-10-14'
