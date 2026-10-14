import type { League } from './types'

/**
 * Position codes per league and the position group each one is graded against (see
 * grades/norms.ts). Groups: NFL RB, WR, TE, QB, DB, LB, DL, OL, ST; MLB H (position player),
 * P (pitcher), TWP (two-way); NBA G, W, B.
 */
export interface PositionDef {
  code: string
  label: string
  group: string
}

export const POSITIONS: Record<League, PositionDef[]> = {
  NFL: [
    { code: 'QB', label: 'Quarterback', group: 'QB' },
    { code: 'RB', label: 'Running back', group: 'RB' },
    { code: 'FB', label: 'Fullback', group: 'RB' },
    { code: 'WR', label: 'Wide receiver', group: 'WR' },
    { code: 'TE', label: 'Tight end', group: 'TE' },
    { code: 'OT', label: 'Offensive tackle', group: 'OL' },
    { code: 'OG', label: 'Guard', group: 'OL' },
    { code: 'C', label: 'Center', group: 'OL' },
    { code: 'OL', label: 'Offensive lineman', group: 'OL' },
    { code: 'DE', label: 'Defensive end', group: 'DL' },
    { code: 'DT', label: 'Defensive tackle', group: 'DL' },
    { code: 'NT', label: 'Nose tackle', group: 'DL' },
    { code: 'EDGE', label: 'Edge rusher', group: 'DL' },
    { code: 'DL', label: 'Defensive lineman', group: 'DL' },
    { code: 'LB', label: 'Linebacker', group: 'LB' },
    { code: 'ILB', label: 'Inside linebacker', group: 'LB' },
    { code: 'OLB', label: 'Outside linebacker', group: 'LB' },
    { code: 'CB', label: 'Cornerback', group: 'DB' },
    { code: 'S', label: 'Safety', group: 'DB' },
    { code: 'FS', label: 'Free safety', group: 'DB' },
    { code: 'SS', label: 'Strong safety', group: 'DB' },
    { code: 'DB', label: 'Defensive back', group: 'DB' },
    { code: 'K', label: 'Kicker', group: 'ST' },
    { code: 'P', label: 'Punter', group: 'ST' },
    { code: 'LS', label: 'Long snapper', group: 'ST' },
  ],
  MLB: [
    { code: 'SP', label: 'Starting pitcher', group: 'P' },
    { code: 'RP', label: 'Relief pitcher', group: 'P' },
    { code: 'P', label: 'Pitcher', group: 'P' },
    { code: 'C', label: 'Catcher', group: 'H' },
    { code: '1B', label: 'First base', group: 'H' },
    { code: '2B', label: 'Second base', group: 'H' },
    { code: '3B', label: 'Third base', group: 'H' },
    { code: 'SS', label: 'Shortstop', group: 'H' },
    { code: 'LF', label: 'Left field', group: 'H' },
    { code: 'CF', label: 'Center field', group: 'H' },
    { code: 'RF', label: 'Right field', group: 'H' },
    { code: 'OF', label: 'Outfield', group: 'H' },
    { code: 'IF', label: 'Infield', group: 'H' },
    { code: 'DH', label: 'Designated hitter', group: 'H' },
    { code: 'TWP', label: 'Two-way player', group: 'TWP' },
  ],
  NBA: [
    { code: 'PG', label: 'Point guard', group: 'G' },
    { code: 'SG', label: 'Shooting guard', group: 'G' },
    { code: 'G', label: 'Guard', group: 'G' },
    { code: 'SF', label: 'Small forward', group: 'W' },
    { code: 'GF', label: 'Guard-forward', group: 'W' },
    { code: 'F', label: 'Forward', group: 'W' },
    { code: 'PF', label: 'Power forward', group: 'B' },
    { code: 'FC', label: 'Forward-center', group: 'B' },
    { code: 'C', label: 'Center', group: 'B' },
  ],
}

const FALLBACK: Record<League, string> = { NFL: 'RB', MLB: 'H', NBA: 'G' }

/**
 * Position group for a position code or a free-text position ("Running back", "SS/2B").
 * Takes the first recognisable code; falls back to the league's default group.
 */
export function positionGroupFor(league: League, position: string): string {
  const list = POSITIONS[league]
  const text = position.trim()
  const byLabel = list.find((p) => p.label.toLowerCase() === text.toLowerCase())
  if (byLabel) return byLabel.group
  for (const token of text.toUpperCase().split(/[^A-Z0-9]+/)) {
    const hit = list.find((p) => p.code === token)
    if (hit) return hit.group
  }
  const lower = text.toLowerCase()
  for (const p of list) if (lower.includes(p.label.toLowerCase())) return p.group
  return FALLBACK[league]
}

export function positionLabel(league: League, code: string): string {
  return POSITIONS[league].find((p) => p.code === code.toUpperCase())?.label ?? code
}
