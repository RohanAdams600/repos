/**
 * Data layer types. Every number shown in the app is a `Measured` value carrying one of three
 * quality labels, so the UI can never show a figure without saying where it came from.
 *
 * VERIFIED   cross-checked against the cited public source on the retrieval date.
 * ESTIMATED  derived from verified inputs by a documented formula, or a figure whose public
 *            sources disagree (the note says how).
 * SIMULATED  no public source exists; a demo value that stands in until a licensed feed does.
 */
export type Quality = 'VERIFIED' | 'ESTIMATED' | 'SIMULATED'

export const QUALITY_ORDER: Record<Quality, number> = { VERIFIED: 0, ESTIMATED: 1, SIMULATED: 2 }

/** The weaker of two labels: a result is only as good as its weakest input. */
export function weakest(...qualities: Quality[]): Quality {
  let worst: Quality = 'VERIFIED'
  for (const q of qualities) if (QUALITY_ORDER[q] > QUALITY_ORDER[worst]) worst = q
  return worst
}

export interface Source {
  id: string
  title: string
  publisher: string
  /** Absent for material that is not online, such as reference photos supplied by the owner. */
  url?: string
  /** Publication or event date (ISO yyyy-mm-dd) when the source states one. */
  published?: string
  /** Date the figure was checked against the source (ISO yyyy-mm-dd). */
  retrieved: string
}

export interface Measured {
  value: number
  quality: Quality
  /** Id of an entry in the athlete's `sources`. Required for VERIFIED values. */
  sourceId?: string
  /** Date the value applies to (a combine date, a season end). */
  asOf?: string
  note?: string
}

export type League = 'NFL' | 'MLB' | 'NBA'

/** Every metric key the app understands. Units are fixed per key (see metrics.ts). */
export type MetricKey =
  // body
  | 'heightIn'
  | 'weightLb'
  | 'wingspanIn'
  | 'handSizeIn'
  | 'bodyFatPct'
  | 'standingReachIn'
  // speed
  | 'fortyS'
  | 'tenSplitS'
  | 'threeQuarterSprintS'
  | 'sprintSpeedFtS'
  | 'topSpeedMph'
  // jump
  | 'maxVerticalIn'
  | 'standingVerticalIn'
  | 'broadJumpIn'
  // agility and mobility
  | 'shuttleS'
  | 'threeConeS'
  | 'laneAgilityS'
  | 'sitReachIn'
  // strength
  | 'bench1RmLb'
  | 'squat1RmLb'
  | 'deadlift1RmLb'
  | 'clean1RmLb'
  // conditioning and availability
  | 'repeatSprintDropPct'
  | 'gamesPlayedPct'
  // throwing
  | 'throwVelocityMph'
  | 'throwDistanceYd'
  // NFL production
  | 'rushYardsPerCarry'
  | 'rushYards'
  | 'rushTd'
  | 'carries'
  | 'receptions'
  | 'receivingYards'
  | 'catchRatePct'
  | 'yardsAfterContactPerCarry'
  // MLB production and tracking
  | 'battingAvg'
  | 'onBasePct'
  | 'sluggingPct'
  | 'homeRuns'
  | 'stolenBases'
  | 'maxExitVelocityMph'
  | 'avgExitVelocityMph'
  | 'batSpeedMph'
  | 'avgLaunchAngleDeg'
  | 'strikeoutPct'
  | 'fastballVelocityMph'
  | 'fastballMaxMph'
  | 'pitchingEra'
  | 'pitchingStrikeoutPer9'
  | 'walksPer9'
  // NBA production
  | 'pointsPerGame'
  | 'threePointPct'
  | 'freeThrowPct'
  | 'midRangePct'
  | 'rimFinishPct'
  | 'assistsPerGame'
  | 'turnoversPerGame'
  | 'reboundsPerGame'
  | 'stealsPerGame'
  | 'blocksPerGame'
  | 'minutesPerGame'

export type Metrics = Partial<Record<MetricKey, Measured>>

export interface SeasonLine {
  /** Display label, e.g. "2024" or "2024-25". */
  season: string
  /** Sort key: the calendar year the season ends in. */
  year: number
  team: string
  games?: Measured
  metrics: Metrics
  notes?: string
}

/** Body part ids shared by the 3D rig, the injury body map and the gear heat map. */
export type BodySegment =
  | 'head'
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'pelvis'
  | 'upperArmL'
  | 'upperArmR'
  | 'forearmL'
  | 'forearmR'
  | 'handL'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'footL'
  | 'footR'

export type GearSlot =
  | 'helmet'
  | 'facemask'
  | 'visor'
  | 'cap'
  | 'battingHelmet'
  | 'headband'
  | 'jersey'
  | 'undershirt'
  | 'pants'
  | 'shorts'
  | 'compressionSleeveL'
  | 'compressionSleeveR'
  | 'shootingSleeveR'
  | 'gloves'
  | 'battingGloves'
  | 'fieldingGlove'
  | 'wristbands'
  | 'elbowGuard'
  | 'legGuard'
  | 'kneeSleeves'
  | 'socks'
  | 'shoes'

export type GearKind =
  | 'helmet'
  | 'facemask'
  | 'cap'
  | 'jersey'
  | 'undershirt'
  | 'bottoms'
  | 'compression'
  | 'gloves'
  | 'wristband'
  | 'guard'
  | 'socks'
  | 'shoes'

export interface GearVariant {
  id: string
  label: string
  color?: string
  /** Free-form style hint read by the 3D builder (e.g. 'high-top', 'two-bar'). */
  style?: string
}

/** One point of wear or stress on a body segment, for the gear use heat map. */
export interface Hotspot {
  segment: BodySegment
  /** 0 = top of the segment (joint nearest the torso), 1 = far end. */
  along: number
  /** Which face of the segment. */
  face: 'front' | 'back' | 'inner' | 'outer' | 'top' | 'bottom' | 'around'
  /** 0..1 relative intensity. */
  intensity: number
  label: string
}

export interface GearUse {
  /** Share of game snaps, plate appearances or minutes in which the item is worn or used. */
  usagePct: number
  quality: Quality
  note: string
  hotspots: Hotspot[]
}

export interface GearItem {
  id: string
  slot: GearSlot
  kind: GearKind
  name: string
  color: string
  accent?: string
  /** What the reference shows or what the profile assumes. */
  description: string
  quality: Quality
  /** Where this came from: a reference photo, a source id, or "demo default". */
  basis: string
  /** Shown on the model by default. Items with false are in the closet: the gear panel can add them. */
  worn: boolean
  variants?: GearVariant[]
  defaultVariant?: string
  use: GearUse
}

export interface GearSeason {
  season: string
  quality: Quality
  changes: string[]
}

export interface MovementSignature {
  quality: Quality
  basis: string
  run: {
    strideLengthM: number
    cadenceSpm: number
    /** Forward trunk lean at top speed, degrees. */
    leanDeg: number
    /** Peak shoulder swing each way, degrees. */
    armSwingDeg: number
    /** Peak hip flexion of the swing leg, degrees. */
    kneeDriveDeg: number
    style: string
  }
  throw: {
    /** 0 = sidearm, 90 = straight over the top. */
    armSlotDeg: number
    hipShoulderSeparationDeg: number
    strideLengthPctHeight: number
    style: string
  }
  shoot: {
    releaseAngleDeg: number
    /** Set point above the head as a share of height. */
    setPointPct: number
    jumpOnShot: boolean
    style: string
  }
  swing: {
    attackAngleDeg: number
    legKick: 'none' | 'toe-tap' | 'small' | 'high'
    batsLeft: boolean
    style: string
  }
  jump: {
    takeoff: 'one-foot' | 'two-foot'
    landingKneeFlexDeg: number
    armDrive: number
    style: string
  }
}

export interface Injury {
  date: string
  segment: BodySegment
  side?: 'L' | 'R'
  title: string
  detail: string
  /** Games missed when the source states it. */
  gamesMissed?: number
  surgery?: boolean
  quality: Quality
  sourceId: string
}

export type MediaKind = 'photo' | 'video' | 'page' | 'article'

export interface MediaItem {
  id: string
  kind: MediaKind
  title: string
  /** Who publishes or licenses it. Every item cites its source. */
  source: string
  url: string
  date: string
  /** Whether `date` is the publication date or the date the page was checked. */
  dateKind: 'published' | 'accessed'
  season?: string
  /** Link-out items open the official page; licensed items are fetched by a provider with a key. */
  delivery: 'link-out' | 'licensed-api'
  tags: string[]
}

export interface Kit {
  /** Generic team colors only: never a logo or wordmark. */
  primary: string
  secondary: string
  trim: string
  number: string
}

export interface Athlete {
  id: string
  name: string
  league: League
  position: string
  /** Position group used for position-adjusted percentiles, e.g. 'RB', 'TWP', 'G'. */
  positionGroup: string
  team: string
  bats?: 'L' | 'R' | 'S'
  throws?: 'L' | 'R'
  born?: string
  kit: Kit
  /** Current measurables. Season lines override these for grade history. */
  metrics: Metrics
  seasons: SeasonLine[]
  gear: GearItem[]
  gearHistory: GearSeason[]
  movement: MovementSignature
  injuries: Injury[]
  media: MediaItem[]
  /** Pitch arsenal for pitchers. */
  pitches?: Pitch[]
  sources: Record<string, Source>
  /** Free text shown under the name. */
  summary: string
  /** True for custom athletes made in Build-an-athlete. */
  custom?: boolean
  /** Last date anyone reviewed this profile. */
  reviewed: string
}

export interface Pitch {
  type: 'four-seam' | 'sinker' | 'cutter' | 'slider' | 'sweeper' | 'curveball' | 'splitter' | 'changeup'
  usagePct: Measured
  velocityMph: Measured
  /** Induced vertical break, inches (positive = rides). */
  verticalBreakIn: Measured
  /** Horizontal break, inches, from the catcher's view (positive = arm side for a right-hander). */
  horizontalBreakIn: Measured
  spinRpm: Measured
}
