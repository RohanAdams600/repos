import type { MetricKey } from './types'

export interface MetricDef {
  label: string
  unit: string
  decimals: number
  /** For leaderboards and percentiles. */
  higherIsBetter: boolean
  group: 'Body' | 'Speed' | 'Jump' | 'Agility' | 'Strength' | 'Conditioning' | 'Throwing' | 'Football' | 'Baseball' | 'Basketball'
  /** Leading zero dropped, baseball style (.310). */
  rate?: boolean
}

export const METRICS: Record<MetricKey, MetricDef> = {
  heightIn: { label: 'Height', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Body' },
  weightLb: { label: 'Weight', unit: 'lb', decimals: 0, higherIsBetter: true, group: 'Body' },
  wingspanIn: { label: 'Wingspan', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Body' },
  handSizeIn: { label: 'Hand size', unit: 'in', decimals: 2, higherIsBetter: true, group: 'Body' },
  bodyFatPct: { label: 'Body fat', unit: '%', decimals: 1, higherIsBetter: false, group: 'Body' },
  standingReachIn: { label: 'Standing reach', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Body' },
  fortyS: { label: '40-yard dash', unit: 's', decimals: 2, higherIsBetter: false, group: 'Speed' },
  tenSplitS: { label: '10-yard split', unit: 's', decimals: 2, higherIsBetter: false, group: 'Speed' },
  threeQuarterSprintS: { label: '3/4-court sprint', unit: 's', decimals: 2, higherIsBetter: false, group: 'Speed' },
  sprintSpeedFtS: { label: 'Sprint speed', unit: 'ft/s', decimals: 1, higherIsBetter: true, group: 'Speed' },
  topSpeedMph: { label: 'Top speed', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Speed' },
  maxVerticalIn: { label: 'Max vertical', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Jump' },
  standingVerticalIn: { label: 'Standing vertical', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Jump' },
  broadJumpIn: { label: 'Broad jump', unit: 'in', decimals: 0, higherIsBetter: true, group: 'Jump' },
  shuttleS: { label: '5-10-5 shuttle', unit: 's', decimals: 2, higherIsBetter: false, group: 'Agility' },
  threeConeS: { label: '3-cone drill', unit: 's', decimals: 2, higherIsBetter: false, group: 'Agility' },
  laneAgilityS: { label: 'Lane agility', unit: 's', decimals: 2, higherIsBetter: false, group: 'Agility' },
  sitReachIn: { label: 'Sit and reach', unit: 'in', decimals: 1, higherIsBetter: true, group: 'Agility' },
  bench1RmLb: { label: 'Bench press 1RM', unit: 'lb', decimals: 0, higherIsBetter: true, group: 'Strength' },
  squat1RmLb: { label: 'Back squat 1RM', unit: 'lb', decimals: 0, higherIsBetter: true, group: 'Strength' },
  deadlift1RmLb: { label: 'Deadlift 1RM', unit: 'lb', decimals: 0, higherIsBetter: true, group: 'Strength' },
  clean1RmLb: { label: 'Power clean 1RM', unit: 'lb', decimals: 0, higherIsBetter: true, group: 'Strength' },
  repeatSprintDropPct: { label: 'Repeat-sprint drop-off', unit: '%', decimals: 1, higherIsBetter: false, group: 'Conditioning' },
  gamesPlayedPct: { label: 'Games available', unit: '%', decimals: 0, higherIsBetter: true, group: 'Conditioning' },
  throwVelocityMph: { label: 'Throw velocity', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Throwing' },
  throwDistanceYd: { label: 'Throw distance', unit: 'yd', decimals: 0, higherIsBetter: true, group: 'Throwing' },
  rushYardsPerCarry: { label: 'Yards per carry', unit: 'yd', decimals: 1, higherIsBetter: true, group: 'Football' },
  rushYards: { label: 'Rushing yards', unit: 'yd', decimals: 0, higherIsBetter: true, group: 'Football' },
  rushTd: { label: 'Rushing TD', unit: '', decimals: 0, higherIsBetter: true, group: 'Football' },
  carries: { label: 'Carries', unit: '', decimals: 0, higherIsBetter: true, group: 'Football' },
  receptions: { label: 'Receptions', unit: '', decimals: 0, higherIsBetter: true, group: 'Football' },
  receivingYards: { label: 'Receiving yards', unit: 'yd', decimals: 0, higherIsBetter: true, group: 'Football' },
  catchRatePct: { label: 'Catch rate', unit: '%', decimals: 1, higherIsBetter: true, group: 'Football' },
  yardsAfterContactPerCarry: { label: 'Yards after contact', unit: 'yd', decimals: 2, higherIsBetter: true, group: 'Football' },
  battingAvg: { label: 'Batting average', unit: '', decimals: 3, higherIsBetter: true, group: 'Baseball', rate: true },
  onBasePct: { label: 'On-base pct', unit: '', decimals: 3, higherIsBetter: true, group: 'Baseball', rate: true },
  sluggingPct: { label: 'Slugging pct', unit: '', decimals: 3, higherIsBetter: true, group: 'Baseball', rate: true },
  homeRuns: { label: 'Home runs', unit: '', decimals: 0, higherIsBetter: true, group: 'Baseball' },
  stolenBases: { label: 'Stolen bases', unit: '', decimals: 0, higherIsBetter: true, group: 'Baseball' },
  maxExitVelocityMph: { label: 'Max exit velocity', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  avgExitVelocityMph: { label: 'Avg exit velocity', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  batSpeedMph: { label: 'Bat speed', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  avgLaunchAngleDeg: { label: 'Avg launch angle', unit: 'deg', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  strikeoutPct: { label: 'Strikeout rate', unit: '%', decimals: 1, higherIsBetter: false, group: 'Baseball' },
  fastballVelocityMph: { label: 'Avg fastball', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  fastballMaxMph: { label: 'Max fastball', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  pitchingEra: { label: 'ERA', unit: '', decimals: 2, higherIsBetter: false, group: 'Baseball' },
  pitchingStrikeoutPer9: { label: 'Strikeouts per 9', unit: '', decimals: 1, higherIsBetter: true, group: 'Baseball' },
  walksPer9: { label: 'Walks per 9', unit: '', decimals: 1, higherIsBetter: false, group: 'Baseball' },
  pointsPerGame: { label: 'Points per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  threePointPct: { label: '3-point pct', unit: '%', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  freeThrowPct: { label: 'Free throw pct', unit: '%', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  midRangePct: { label: 'Mid-range pct', unit: '%', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  rimFinishPct: { label: 'At-rim pct', unit: '%', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  assistsPerGame: { label: 'Assists per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  turnoversPerGame: { label: 'Turnovers per game', unit: '', decimals: 1, higherIsBetter: false, group: 'Basketball' },
  reboundsPerGame: { label: 'Rebounds per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  stealsPerGame: { label: 'Steals per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  blocksPerGame: { label: 'Blocks per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  minutesPerGame: { label: 'Minutes per game', unit: '', decimals: 1, higherIsBetter: true, group: 'Basketball' },
  benchReps225: { label: 'Bench reps at 225 lb', unit: 'reps', decimals: 0, higherIsBetter: true, group: 'Strength' },
  armLengthIn: { label: 'Arm length', unit: 'in', decimals: 2, higherIsBetter: true, group: 'Body' },
  handLengthIn: { label: 'Hand length', unit: 'in', decimals: 2, higherIsBetter: true, group: 'Body' },
  handWidthIn: { label: 'Hand width', unit: 'in', decimals: 2, higherIsBetter: true, group: 'Body' },
  shoeSizeUs: { label: 'Shoe size (US)', unit: '', decimals: 1, higherIsBetter: true, group: 'Body' },
  armStrengthMph: { label: 'Fielding arm strength', unit: 'mph', decimals: 1, higherIsBetter: true, group: 'Throwing' },
  spinRateRpm: { label: 'Spin rate', unit: 'rpm', decimals: 0, higherIsBetter: true, group: 'Baseball' },
  homeToFirstS: { label: 'Home to first', unit: 's', decimals: 2, higherIsBetter: false, group: 'Speed' },
  avgSpeedMph: { label: 'Average speed (tracking)', unit: 'mph', decimals: 2, higherIsBetter: true, group: 'Speed' },
  brokenTackles: { label: 'Broken tackles', unit: '', decimals: 0, higherIsBetter: true, group: 'Football' },
  yardsAfterContact: { label: 'Yards after contact', unit: 'yd', decimals: 0, higherIsBetter: true, group: 'Football' },
  draftPick: { label: 'Draft pick (overall)', unit: '', decimals: 0, higherIsBetter: false, group: 'Body' },
}

export function formatMetric(key: MetricKey, value: number): string {
  const def = METRICS[key]
  let text = value.toFixed(def.decimals)
  if (def.rate && value < 1) text = text.replace(/^0/, '')
  if (key === 'heightIn' || key === 'wingspanIn' || key === 'standingReachIn') return `${feetInches(value)} (${text} in)`
  if (key === 'broadJumpIn') return `${feetInches(value)} (${text} in)`
  return def.unit ? `${text} ${def.unit}` : text
}

export function feetInches(inches: number): string {
  const feet = Math.floor(inches / 12)
  const rest = inches - feet * 12
  const restText = Number.isInteger(Math.round(rest * 4) / 4) ? String(Math.round(rest)) : (Math.round(rest * 4) / 4).toString()
  return `${feet}'${restText}"`
}

export const IN_TO_M = 0.0254
export const LB_TO_KG = 0.45359237
export const MPH_TO_MS = 0.44704
export const FTS_TO_MS = 0.3048
export const YD_TO_M = 0.9144
