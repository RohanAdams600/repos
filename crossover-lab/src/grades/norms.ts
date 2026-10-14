import type { League } from '../data/types'

/**
 * Position reference distributions for z-scores and percentiles. These are approximate
 * pro-level means and spreads written for the demo and are labeled ESTIMATED everywhere they
 * surface. Replace them with licensed norm tables before any grade is published as fact.
 */
export interface Norm {
  mean: number
  sd: number
  better: 'high' | 'low'
}

export type NormKey =
  | 'fortyS'
  | 'threeQuarterSprintS'
  | 'sprintSpeedFtS'
  | 'maxVerticalIn'
  | 'standingVerticalIn'
  | 'broadJumpIn'
  | 'shuttleS'
  | 'threeConeS'
  | 'laneAgilityS'
  | 'relStrength'
  | 'bodyFatPct'
  | 'sitReachIn'
  | 'repeatSprintDropPct'
  | 'gamesPlayedPct'
  | 'workload'
  | 'rushYardsPerCarry'
  | 'rushTdRate'
  | 'yardsAfterContactPerCarry'
  | 'catchRatePct'
  | 'throwVelocityMph'
  | 'momentum'
  | 'battingAvg'
  | 'strikeoutPct'
  | 'sluggingPct'
  | 'maxExitVelocityMph'
  | 'homeRuns'
  | 'obpMinusAvg'
  | 'stolenBases'
  | 'fastballVelocityMph'
  | 'walksPer9'
  | 'pitchingStrikeoutPer9'
  | 'threePointPct'
  | 'midRangePct'
  | 'rimFinishPct'
  | 'freeThrowPct'
  | 'astTov'
  | 'assistsPerGame'
  | 'reboundsPerGame'
  | 'stealsPerGame'
  | 'blocksPerGame'
  | 'stocks'
  | 'apeIndexIn'
  | 'standingReachIn'
  | 'benchReps225'
  | 'armStrengthMph'
  | 'batSpeedMph'
  | 'spinRateRpm'
  | 'homeToFirstS'
  | 'avgSpeedMph'
  | 'fastballMaxMph'
  | 'weightLb'
  | 'heightIn'
  | 'wingspanIn'
  | 'topSpeedMph'
  | 'tenSplitS'
  | 'speedScore'

type NormTable = Partial<Record<NormKey, Norm>>

const hi = (mean: number, sd: number): Norm => ({ mean, sd, better: 'high' })
const lo = (mean: number, sd: number): Norm => ({ mean, sd, better: 'low' })

const SHARED: NormTable = {
  maxVerticalIn: hi(33, 3.5),
  standingVerticalIn: hi(28, 3.5),
  broadJumpIn: hi(114, 7),
  shuttleS: lo(4.35, 0.15),
  threeConeS: lo(7.15, 0.2),
  relStrength: hi(33, 4),
  bodyFatPct: lo(11, 3),
  sitReachIn: hi(13, 3),
  repeatSprintDropPct: lo(5.5, 1.5),
  gamesPlayedPct: hi(80, 15),
}

const GROUPS: Record<string, NormTable> = {
  RB: {
    tenSplitS: lo(1.58, 0.05),
    benchReps225: hi(19, 4),
    weightLb: hi(213, 12),
    heightIn: hi(70.5, 1.5),
    topSpeedMph: hi(20.5, 0.9),
    speedScore: hi(100, 12),
    fortyS: lo(4.55, 0.1),
    maxVerticalIn: hi(34.5, 3),
    standingVerticalIn: hi(29.5, 3),
    broadJumpIn: hi(119, 5),
    shuttleS: lo(4.3, 0.12),
    threeConeS: lo(7.08, 0.18),
    relStrength: hi(37, 3.5),
    bodyFatPct: lo(10, 2.5),
    gamesPlayedPct: hi(78, 15),
    workload: hi(14, 4.5),
    rushYardsPerCarry: hi(4.3, 0.45),
    rushTdRate: hi(3, 1),
    yardsAfterContactPerCarry: hi(2.9, 0.35),
    catchRatePct: hi(77, 6),
    throwVelocityMph: hi(48, 5),
    momentum: hi(960, 60),
  },
  TWP: {
    sprintSpeedFtS: hi(27, 1.4),
    maxVerticalIn: hi(30, 3.5),
    standingVerticalIn: hi(25, 3.5),
    broadJumpIn: hi(108, 6),
    shuttleS: lo(4.45, 0.15),
    threeConeS: lo(7.3, 0.2),
    relStrength: hi(33, 3.5),
    bodyFatPct: lo(13, 3),
    workload: hi(140, 18),
    battingAvg: hi(0.248, 0.025),
    strikeoutPct: lo(22.5, 5),
    sluggingPct: hi(0.41, 0.06),
    maxExitVelocityMph: hi(109.5, 3.5),
    homeRuns: hi(20, 10),
    obpMinusAvg: hi(0.07, 0.02),
    stolenBases: hi(12, 10),
    throwVelocityMph: hi(95, 2.5),
    fastballVelocityMph: hi(94.2, 2),
    walksPer9: lo(3.2, 0.8),
    pitchingStrikeoutPer9: hi(8.8, 1.6),
  },
  WR: { fortyS: lo(4.5, 0.09), tenSplitS: lo(1.56, 0.05), maxVerticalIn: hi(35.5, 3), broadJumpIn: hi(121, 5), benchReps225: hi(14, 4), shuttleS: lo(4.25, 0.12), threeConeS: lo(6.95, 0.18), weightLb: hi(200, 13), heightIn: hi(72.5, 2.2), topSpeedMph: hi(20.8, 0.9), catchRatePct: hi(66, 6), speedScore: hi(95, 12) },
  TE: { fortyS: lo(4.7, 0.12), tenSplitS: lo(1.63, 0.05), maxVerticalIn: hi(33, 3), broadJumpIn: hi(117, 5), benchReps225: hi(19, 4), shuttleS: lo(4.4, 0.13), threeConeS: lo(7.15, 0.2), weightLb: hi(250, 8), heightIn: hi(76.5, 1.3), topSpeedMph: hi(19.5, 0.9), catchRatePct: hi(70, 6), speedScore: hi(105, 12) },
  QB: { fortyS: lo(4.8, 0.15), tenSplitS: lo(1.66, 0.06), maxVerticalIn: hi(31, 3), broadJumpIn: hi(113, 6), weightLb: hi(220, 12), heightIn: hi(75, 1.5), throwVelocityMph: hi(56, 3), topSpeedMph: hi(18.5, 1.2) },
  DB: { fortyS: lo(4.49, 0.08), tenSplitS: lo(1.55, 0.05), maxVerticalIn: hi(36, 3), broadJumpIn: hi(122, 5), benchReps225: hi(15, 4), shuttleS: lo(4.18, 0.12), threeConeS: lo(6.95, 0.18), weightLb: hi(198, 10), heightIn: hi(71.5, 1.8), topSpeedMph: hi(20.6, 0.8) },
  LB: { fortyS: lo(4.65, 0.12), tenSplitS: lo(1.6, 0.05), maxVerticalIn: hi(34, 3), broadJumpIn: hi(119, 5), benchReps225: hi(21, 4), shuttleS: lo(4.3, 0.13), threeConeS: lo(7.1, 0.2), weightLb: hi(238, 10), heightIn: hi(74, 1.3), topSpeedMph: hi(19.8, 0.9) },
  DL: { fortyS: lo(4.95, 0.18), tenSplitS: lo(1.72, 0.06), maxVerticalIn: hi(31, 3), broadJumpIn: hi(112, 6), benchReps225: hi(25, 5), shuttleS: lo(4.55, 0.15), threeConeS: lo(7.5, 0.25), weightLb: hi(290, 25), heightIn: hi(75.5, 1.5), topSpeedMph: hi(18.5, 1) },
  OL: { fortyS: lo(5.25, 0.15), tenSplitS: lo(1.8, 0.06), maxVerticalIn: hi(28, 3), broadJumpIn: hi(104, 5), benchReps225: hi(25, 5), shuttleS: lo(4.7, 0.15), threeConeS: lo(7.8, 0.25), weightLb: hi(314, 10), heightIn: hi(77, 1.2), topSpeedMph: hi(17, 1) },
  H: { sprintSpeedFtS: hi(27, 1.4), armStrengthMph: hi(85, 5), batSpeedMph: hi(71.5, 2.5), maxExitVelocityMph: hi(110, 3.5), homeToFirstS: lo(4.35, 0.2), weightLb: hi(210, 18), heightIn: hi(73.5, 2), battingAvg: hi(0.248, 0.025), sluggingPct: hi(0.41, 0.06), homeRuns: hi(20, 10), stolenBases: hi(12, 10), strikeoutPct: lo(22.5, 5), obpMinusAvg: hi(0.07, 0.02), throwVelocityMph: hi(85, 5) },
  P: { fastballVelocityMph: hi(94.2, 2), fastballMaxMph: hi(97, 2.5), spinRateRpm: hi(2300, 180), weightLb: hi(215, 18), heightIn: hi(75, 2), walksPer9: lo(3.2, 0.8), pitchingStrikeoutPer9: hi(8.8, 1.6), throwVelocityMph: hi(96, 2.5) },
  W: { threeQuarterSprintS: lo(3.3, 0.12), maxVerticalIn: hi(34.5, 3), standingVerticalIn: hi(28.5, 3), laneAgilityS: lo(11.35, 0.35), heightIn: hi(79, 1.2), wingspanIn: hi(84, 2.5), standingReachIn: hi(105, 2.5), weightLb: hi(215, 12), apeIndexIn: hi(4, 2.5), avgSpeedMph: hi(4.3, 0.25), threePointPct: hi(35.5, 3.5), reboundsPerGame: hi(5, 1.8), stealsPerGame: hi(1, 0.35), blocksPerGame: hi(0.6, 0.3), stocks: hi(1.6, 0.5), assistsPerGame: hi(2.8, 1.5) },
  B: { threeQuarterSprintS: lo(3.42, 0.13), maxVerticalIn: hi(31.5, 3.5), standingVerticalIn: hi(26.5, 3), laneAgilityS: lo(11.9, 0.45), heightIn: hi(82, 1.3), wingspanIn: hi(87.5, 2.5), standingReachIn: hi(110.5, 2.5), weightLb: hi(240, 15), apeIndexIn: hi(5, 3), avgSpeedMph: hi(4.05, 0.25), reboundsPerGame: hi(8, 2.5), blocksPerGame: hi(1.1, 0.5), stocks: hi(1.8, 0.6), rimFinishPct: hi(66, 5), assistsPerGame: hi(2, 1.2) },
  G: {
    heightIn: hi(76, 1.5),
    wingspanIn: hi(81, 2.5),
    weightLb: hi(195, 12),
    avgSpeedMph: hi(4.4, 0.25),
    threeQuarterSprintS: lo(3.27, 0.12),
    maxVerticalIn: hi(35.5, 3),
    standingVerticalIn: hi(29.5, 2.8),
    broadJumpIn: hi(112, 5),
    laneAgilityS: lo(11.2, 0.35),
    shuttleS: lo(4.25, 0.15),
    threeConeS: lo(7.05, 0.2),
    relStrength: hi(29, 3.5),
    bodyFatPct: lo(8.5, 2),
    workload: hi(30, 4),
    threePointPct: hi(35.5, 3),
    midRangePct: hi(41, 4),
    rimFinishPct: hi(60, 5),
    freeThrowPct: hi(80, 6),
    astTov: hi(2, 0.5),
    assistsPerGame: hi(4, 2),
    reboundsPerGame: hi(3.8, 1.2),
    stealsPerGame: hi(1, 0.35),
    blocksPerGame: hi(0.35, 0.2),
    stocks: hi(1.35, 0.45),
    apeIndexIn: hi(3, 2.5),
    standingReachIn: hi(99, 2.5),
    throwVelocityMph: hi(40, 5),
  },
}

/** League fallbacks for position groups that have no table of their own (custom athletes). */
const LEAGUE_GROUP: Record<League, string> = { NFL: 'RB', MLB: 'TWP', NBA: 'G' }

export const GROUP_LABEL: Record<string, string> = {
  RB: 'NFL running backs',
  WR: 'NFL wide receivers',
  TE: 'NFL tight ends',
  QB: 'NFL quarterbacks',
  DB: 'NFL defensive backs',
  LB: 'NFL linebackers',
  DL: 'NFL defensive linemen',
  OL: 'NFL offensive linemen',
  TWP: 'MLB regulars',
  H: 'MLB position players',
  P: 'MLB pitchers',
  G: 'NBA guards',
  W: 'NBA wings',
  B: 'NBA bigs',
}

export function normFor(group: string, league: League, key: NormKey): Norm | undefined {
  const table = GROUPS[group] ?? GROUPS[LEAGUE_GROUP[league]]
  return table?.[key] ?? SHARED[key]
}

export function groupFor(group: string, league: League): string {
  return GROUPS[group] ? group : LEAGUE_GROUP[league]
}

export function zScore(norm: Norm, value: number): number {
  const z = (value - norm.mean) / norm.sd
  return norm.better === 'high' ? z : -z
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** Pitch-type norms: velocity plus the movement that makes the pitch work. */
export interface PitchNorm {
  velocity: Norm
  movement: Norm
  movementAxis: 'vertical' | 'horizontal'
  movementLabel: string
}

export const PITCH_NORMS: Record<string, PitchNorm> = {
  'four-seam': { velocity: hi(94.2, 2), movement: hi(15.5, 2.5), movementAxis: 'vertical', movementLabel: 'induced vertical break' },
  sinker: { velocity: hi(93.3, 2), movement: hi(15, 2.5), movementAxis: 'horizontal', movementLabel: 'arm-side run' },
  cutter: { velocity: hi(89, 2.5), movement: hi(3.5, 2), movementAxis: 'horizontal', movementLabel: 'glove-side cut' },
  slider: { velocity: hi(85.5, 2.5), movement: hi(5, 3), movementAxis: 'horizontal', movementLabel: 'sweep' },
  sweeper: { velocity: hi(82.5, 2.5), movement: hi(14.5, 3), movementAxis: 'horizontal', movementLabel: 'sweep' },
  curveball: { velocity: hi(79, 3), movement: lo(-9, 4), movementAxis: 'vertical', movementLabel: 'drop' },
  splitter: { velocity: hi(86.5, 2.5), movement: lo(4, 3), movementAxis: 'vertical', movementLabel: 'drop' },
  changeup: { velocity: hi(85.5, 2.5), movement: lo(7, 3), movementAxis: 'vertical', movementLabel: 'drop' },
}
