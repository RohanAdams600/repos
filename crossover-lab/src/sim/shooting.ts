import type { Athlete, MetricKey, Quality } from '../data/types'
import { weakest } from '../data/types'
import { resolveMetric } from '../data/resolve'
import { gradesFor } from '../grades/grades'

export type Zone = 'rim' | 'paint' | 'midLeft' | 'midCenter' | 'midRight' | 'cornerLeft' | 'cornerRight' | 'wingLeft' | 'wingRight' | 'top' | 'freeThrow'

/** Court position of each zone in metres from the centre of the rim (x across, y out). */
export const ZONES: Record<Zone, { label: string; x: number; y: number; three: boolean }> = {
  rim: { label: 'At the rim', x: 0, y: 0.6, three: false },
  paint: { label: 'Paint', x: 1.2, y: 2.2, three: false },
  midLeft: { label: 'Left elbow', x: -2.4, y: 4.3, three: false },
  midCenter: { label: 'Top of the key (mid)', x: 0, y: 5.2, three: false },
  midRight: { label: 'Right baseline (mid)', x: 4.6, y: 0.9, three: false },
  cornerLeft: { label: 'Left corner three', x: -6.6, y: 0.8, three: true },
  cornerRight: { label: 'Right corner three', x: 6.6, y: 0.8, three: true },
  wingLeft: { label: 'Left wing three', x: -5.2, y: 4.9, three: true },
  wingRight: { label: 'Right wing three', x: 5.2, y: 4.9, three: true },
  top: { label: 'Top of the key three', x: 0, y: 7.3, three: true },
  freeThrow: { label: 'Free throw', x: 0, y: 4.2, three: false },
}

export interface ShotProbability {
  p: number
  quality: Quality
  basis: string
}

/** Defaults for athletes from other sports, in percent. */
const NON_NBA: Record<'three' | 'mid' | 'rim' | 'ft', number> = { three: 22, mid: 31, rim: 52, ft: 62 }

function pct(a: Athlete, key: MetricKey, fallback: number, label: string): ShotProbability {
  const m = resolveMetric(a, key)
  if (m) return { p: m.value / 100, quality: m.quality, basis: m.note ?? `${label} from the profile.` }
  return { p: fallback / 100, quality: a.league === 'NBA' ? 'SIMULATED' : 'ESTIMATED', basis: a.league === 'NBA' ? `No ${label.toLowerCase()} figure; league-typical default.` : `Cross-sport default for a pro athlete who does not play basketball (${fallback}%).` }
}

export function makeProbability(a: Athlete, zone: Zone): ShotProbability {
  const z = ZONES[zone]
  if (zone === 'freeThrow') return pct(a, 'freeThrowPct', NON_NBA.ft, 'Free throw')
  if (zone === 'rim' || zone === 'paint') {
    const base = pct(a, 'rimFinishPct', NON_NBA.rim, 'At-rim')
    // Jumping ability helps non-shooters finish; the paint is harder than the rim.
    const vertical = gradesFor(a).find((g) => g.id === 'vertical')
    const lift = a.league === 'NBA' ? 0 : ((vertical?.z ?? 0) * 0.03)
    const p = Math.min(0.85, Math.max(0.05, base.p + lift - (zone === 'paint' ? 0.16 : 0)))
    return { p, quality: weakest(base.quality, vertical && a.league !== 'NBA' ? vertical.quality : 'VERIFIED'), basis: base.basis + (zone === 'paint' ? ' Paint floaters 16 points lower.' : '') }
  }
  if (z.three) {
    const base = pct(a, 'threePointPct', NON_NBA.three, '3-point')
    const corner = zone === 'cornerLeft' || zone === 'cornerRight'
    return { p: Math.min(0.6, base.p + (corner ? 0.03 : zone === 'top' ? -0.01 : 0)), quality: base.quality, basis: base.basis + (corner ? ' Corner threes are shorter: +3 points.' : '') }
  }
  return pct(a, 'midRangePct', NON_NBA.mid, 'Mid-range')
}

export interface Shot {
  zone: Zone
  made: boolean
  p: number
  /** Where a miss hits the rim, -1 left ... 1 right, for the animation. */
  miss: number
  isMoneyBall?: boolean
}

export function shootRound(a: Athlete, zones: Zone[], rng: () => number, moneyEvery = 0): Shot[] {
  return zones.map((zone, i) => {
    const prob = makeProbability(a, zone)
    // The fifth ball of each rack is the money ball; tired arms late in a rack cost a point.
    const fatigue = moneyEvery ? (i % moneyEvery) * 0.005 : 0
    const p = Math.max(0.02, prob.p - fatigue)
    const made = rng() < p
    return { zone, made, p, miss: made ? 0 : rng() * 2 - 1, isMoneyBall: moneyEvery > 0 && i % moneyEvery === moneyEvery - 1 }
  })
}

export const THREE_POINT_RACKS: Zone[] = ['cornerLeft', 'wingLeft', 'top', 'wingRight', 'cornerRight']

/** Classic three-point contest: five racks of five, the last ball of each rack worth two. Max 30. */
export function threePointContest(a: Athlete, rng: () => number): { shots: Shot[]; score: number } {
  const zones = THREE_POINT_RACKS.flatMap((z) => [z, z, z, z, z])
  const shots = shootRound(a, zones, rng, 5)
  const score = shots.reduce((s, x) => s + (x.made ? (x.isMoneyBall ? 2 : 1) : 0), 0)
  return { shots, score }
}

export function freeThrowContest(a: Athlete, rng: () => number, attempts = 10): { shots: Shot[]; made: number } {
  const shots = shootRound(a, Array.from({ length: attempts }, () => 'freeThrow' as Zone), rng)
  return { shots, made: shots.filter((s) => s.made).length }
}

export const SHOT_CHART_ZONES: Zone[] = ['rim', 'paint', 'midLeft', 'midCenter', 'midRight', 'cornerLeft', 'wingLeft', 'top', 'wingRight', 'cornerRight']

/** Shot chart challenge: N shots from every zone, two points inside the arc, three outside. */
export function shotChartChallenge(a: Athlete, rng: () => number, perZone = 3): { shots: Shot[]; points: number } {
  const zones = SHOT_CHART_ZONES.flatMap((z) => Array.from({ length: perZone }, () => z))
  const shots = shootRound(a, zones, rng)
  const points = shots.reduce((s, x) => s + (x.made ? (ZONES[x.zone].three ? 3 : 2) : 0), 0)
  return { shots, points }
}
