/**
 * Metric catalogue: units, direction and plausibility bounds.
 *
 * Bounds reject typos and fabricated numbers at input time (for example a 160 mph fastball).
 * They are deliberately wide: they are not performance judgements.
 */

import type { MetricType } from '@/generated/prisma/enums'

export type { MetricType }

export type MetricDefinition = {
  type: MetricType
  label: string
  shortLabel: string
  unit: 'mph' | 's' | 'yd' | '%'
  /** False for timed events where a lower number is better. */
  higherIsBetter: boolean
  min: number
  max: number
  decimals: number
  sport: 'BASEBALL' | 'HOCKEY' | 'FOOTBALL'
}

export const METRIC_DEFINITIONS: Record<MetricType, MetricDefinition> = {
  EXIT_VELOCITY: { type: 'EXIT_VELOCITY', label: 'Exit velocity', shortLabel: 'Exit velo', unit: 'mph', higherIsBetter: true, min: 30, max: 125, decimals: 1, sport: 'BASEBALL' },
  PITCH_VELO: { type: 'PITCH_VELO', label: 'Pitch velocity', shortLabel: 'Pitch velo', unit: 'mph', higherIsBetter: true, min: 30, max: 106, decimals: 1, sport: 'BASEBALL' },
  SIXTY_YARD_DASH: { type: 'SIXTY_YARD_DASH', label: '60-yard dash', shortLabel: '60 yd', unit: 's', higherIsBetter: false, min: 5.8, max: 11, decimals: 2, sport: 'BASEBALL' },
  POP_TIME: { type: 'POP_TIME', label: 'Pop time', shortLabel: 'Pop', unit: 's', higherIsBetter: false, min: 1.6, max: 3.5, decimals: 2, sport: 'BASEBALL' },
  INFIELD_VELO: { type: 'INFIELD_VELO', label: 'Infield velocity', shortLabel: 'IF velo', unit: 'mph', higherIsBetter: true, min: 40, max: 100, decimals: 1, sport: 'BASEBALL' },
  OUTFIELD_VELO: { type: 'OUTFIELD_VELO', label: 'Outfield velocity', shortLabel: 'OF velo', unit: 'mph', higherIsBetter: true, min: 40, max: 105, decimals: 1, sport: 'BASEBALL' },
  BAT_SPEED: { type: 'BAT_SPEED', label: 'Bat speed', shortLabel: 'Bat speed', unit: 'mph', higherIsBetter: true, min: 30, max: 95, decimals: 1, sport: 'BASEBALL' },
  SLAPSHOT_SPEED: { type: 'SLAPSHOT_SPEED', label: 'Slapshot speed', shortLabel: 'Slapshot', unit: 'mph', higherIsBetter: true, min: 30, max: 110, decimals: 1, sport: 'HOCKEY' },
  WRIST_SHOT_SPEED: { type: 'WRIST_SHOT_SPEED', label: 'Wrist shot speed', shortLabel: 'Wrist shot', unit: 'mph', higherIsBetter: true, min: 20, max: 95, decimals: 1, sport: 'HOCKEY' },
  THROW_VELOCITY: { type: 'THROW_VELOCITY', label: 'Throw velocity', shortLabel: 'Throw velo', unit: 'mph', higherIsBetter: true, min: 20, max: 70, decimals: 1, sport: 'FOOTBALL' },
  THROW_DISTANCE: { type: 'THROW_DISTANCE', label: 'Throw distance', shortLabel: 'Distance', unit: 'yd', higherIsBetter: true, min: 10, max: 85, decimals: 0, sport: 'FOOTBALL' },
  SPIRAL_EFFICIENCY: { type: 'SPIRAL_EFFICIENCY', label: 'Spiral efficiency', shortLabel: 'Spiral', unit: '%', higherIsBetter: true, min: 1, max: 100, decimals: 0, sport: 'FOOTBALL' },
  FORTY_YARD_DASH: { type: 'FORTY_YARD_DASH', label: '40-yard dash', shortLabel: '40 yd', unit: 's', higherIsBetter: false, min: 4.1, max: 8, decimals: 2, sport: 'FOOTBALL' },
}

export const METRIC_TYPES = Object.keys(METRIC_DEFINITIONS) as MetricType[]

export function isPlausibleMetricValue(type: MetricType, value: number): boolean {
  const def = METRIC_DEFINITIONS[type]
  return Number.isFinite(value) && value >= def.min && value <= def.max
}

export function formatMetric(type: MetricType, value: number): string {
  const def = METRIC_DEFINITIONS[type]
  return `${value.toFixed(def.decimals)} ${def.unit}`
}

/** Returns the better of two values for the metric's direction. */
export function betterValue(type: MetricType, a: number, b: number): number {
  return METRIC_DEFINITIONS[type].higherIsBetter ? Math.max(a, b) : Math.min(a, b)
}

/** Database enum values differ from Prisma keys where a value starts with a digit. Needed for raw SQL. */
const METRIC_DB_OVERRIDES: Partial<Record<MetricType, string>> = {
  SIXTY_YARD_DASH: '60_YARD_DASH',
  FORTY_YARD_DASH: '40_YARD_DASH',
}

export function metricDbValue(type: MetricType): string {
  return METRIC_DB_OVERRIDES[type] ?? type
}

export function metricTypeFromDb(value: string): MetricType | null {
  const match = METRIC_TYPES.find((t) => metricDbValue(t) === value)
  return match ?? null
}
