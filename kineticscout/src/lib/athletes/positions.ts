import type { Position, Sport } from '@/generated/prisma/enums'
import type { MetricType } from '@/lib/metrics/definitions'

export type { Position, Sport }

export const POSITIONS_BY_SPORT: Record<Sport, readonly { value: Position; label: string }[]> = {
  BASEBALL: [
    { value: 'RHP', label: 'Right-handed pitcher' },
    { value: 'LHP', label: 'Left-handed pitcher' },
    { value: 'CATCHER', label: 'Catcher' },
    { value: 'FIRST_BASE', label: 'First base' },
    { value: 'SECOND_BASE', label: 'Second base' },
    { value: 'SHORTSTOP', label: 'Shortstop' },
    { value: 'THIRD_BASE', label: 'Third base' },
    { value: 'OUTFIELD', label: 'Outfield' },
    { value: 'UTILITY', label: 'Utility' },
  ],
  HOCKEY: [
    { value: 'CENTER', label: 'Center' },
    { value: 'WING', label: 'Wing' },
    { value: 'DEFENSE', label: 'Defense' },
    { value: 'GOALIE', label: 'Goalie' },
  ],
  FOOTBALL: [
    { value: 'QUARTERBACK', label: 'Quarterback' },
    { value: 'RUNNING_BACK', label: 'Running back' },
    { value: 'WIDE_RECEIVER', label: 'Wide receiver' },
    { value: 'TIGHT_END', label: 'Tight end' },
    { value: 'OFFENSIVE_LINE', label: 'Offensive line' },
    { value: 'DEFENSIVE_LINE', label: 'Defensive line' },
    { value: 'LINEBACKER', label: 'Linebacker' },
    { value: 'DEFENSIVE_BACK', label: 'Defensive back' },
    { value: 'SPECIALIST', label: 'Kicker or punter' },
  ],
}

export function positionBelongsToSport(position: Position, sport: Sport): boolean {
  return POSITIONS_BY_SPORT[sport].some((p) => p.value === position)
}

export function positionLabel(position: Position): string {
  for (const list of Object.values(POSITIONS_BY_SPORT)) {
    const match = list.find((p) => p.value === position)
    if (match) return match.label
  }
  return position
}

export function isPitcher(position: Position): boolean {
  return position === 'RHP' || position === 'LHP'
}

/**
 * Metrics college programs weigh most for each baseball position, highest weight first.
 * Used by the College Matchmaker to weight per-metric fit.
 */
export function metricWeightsForPosition(position: Position): Partial<Record<MetricType, number>> {
  switch (position) {
    case 'RHP':
    case 'LHP':
      return { PITCH_VELO: 1 }
    case 'CATCHER':
      return { POP_TIME: 0.4, EXIT_VELOCITY: 0.3, INFIELD_VELO: 0.1, SIXTY_YARD_DASH: 0.2 }
    case 'SHORTSTOP':
    case 'SECOND_BASE':
    case 'THIRD_BASE':
    case 'FIRST_BASE':
      return { EXIT_VELOCITY: 0.4, INFIELD_VELO: 0.3, SIXTY_YARD_DASH: 0.3 }
    case 'OUTFIELD':
      return { EXIT_VELOCITY: 0.4, OUTFIELD_VELO: 0.25, SIXTY_YARD_DASH: 0.35 }
    case 'UTILITY':
      return { EXIT_VELOCITY: 0.4, INFIELD_VELO: 0.2, SIXTY_YARD_DASH: 0.4 }
    default:
      return {}
  }
}

const POSITION_DB_OVERRIDES: Partial<Record<Position, string>> = {
  FIRST_BASE: '1B',
  SECOND_BASE: '2B',
  THIRD_BASE: '3B',
}

const ALL_POSITIONS: Position[] = Object.values(POSITIONS_BY_SPORT).flatMap((list) => list.map((p) => p.value))

export function positionDbValue(position: Position): string {
  return POSITION_DB_OVERRIDES[position] ?? position
}

export function positionFromDb(value: string): Position | null {
  return ALL_POSITIONS.find((p) => positionDbValue(p) === value) ?? null
}
