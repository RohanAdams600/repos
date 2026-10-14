import type { Athlete, League, MetricKey } from '../data/types'
import { formatMetric, METRICS } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { qualityChip } from './components'
import { fmtDate, h } from './dom'

/**
 * The "Key 6": six headline measurables pinned under every athlete header, chosen per league and
 * position group. A figure that is not on file shows as a dash with "not on file", never as a
 * guess.
 */
const BY_GROUP: Record<string, MetricKey[]> = {
  QB: ['throwVelocityMph', 'fortyS', 'heightIn', 'handSizeIn', 'weightLb', 'maxVerticalIn'],
  OL: ['weightLb', 'armLengthIn', 'benchReps225', 'tenSplitS', 'fortyS', 'broadJumpIn'],
  DL: ['weightLb', 'armLengthIn', 'tenSplitS', 'fortyS', 'benchReps225', 'broadJumpIn'],
  H: ['sprintSpeedFtS', 'maxExitVelocityMph', 'batSpeedMph', 'armStrengthMph', 'homeToFirstS', 'avgExitVelocityMph'],
  P: ['fastballMaxMph', 'fastballVelocityMph', 'spinRateRpm', 'pitchingStrikeoutPer9', 'walksPer9', 'heightIn'],
  TWP: ['fastballMaxMph', 'maxExitVelocityMph', 'sprintSpeedFtS', 'batSpeedMph', 'fastballVelocityMph', 'homeRuns'],
}

const BY_LEAGUE: Record<League, MetricKey[]> = {
  NFL: ['fortyS', 'tenSplitS', 'topSpeedMph', 'maxVerticalIn', 'broadJumpIn', 'benchReps225'],
  MLB: ['sprintSpeedFtS', 'maxExitVelocityMph', 'batSpeedMph', 'armStrengthMph', 'fastballMaxMph', 'homeToFirstS'],
  NBA: ['heightIn', 'wingspanIn', 'standingReachIn', 'maxVerticalIn', 'laneAgilityS', 'threeQuarterSprintS'],
}

/** Short labels so six cells fit side by side. */
const SHORT: Partial<Record<MetricKey, string>> = {
  fortyS: '40-yard',
  tenSplitS: '10-yd split',
  topSpeedMph: 'Top speed',
  maxVerticalIn: 'Vertical',
  standingVerticalIn: 'Standing vert',
  broadJumpIn: 'Broad jump',
  benchReps225: 'Bench reps',
  throwVelocityMph: 'Throw velo',
  handSizeIn: 'Hand size',
  armLengthIn: 'Arm length',
  sprintSpeedFtS: 'Sprint speed',
  maxExitVelocityMph: 'Max exit velo',
  avgExitVelocityMph: 'Avg exit velo',
  batSpeedMph: 'Bat speed',
  armStrengthMph: 'Arm strength',
  homeToFirstS: 'Home to first',
  fastballMaxMph: 'Max fastball',
  fastballVelocityMph: 'Avg fastball',
  spinRateRpm: 'Spin rate',
  pitchingStrikeoutPer9: 'K per 9',
  walksPer9: 'BB per 9',
  homeRuns: 'Home runs',
  standingReachIn: 'Reach',
  laneAgilityS: 'Lane agility',
  threeQuarterSprintS: '3/4 sprint',
  weightLb: 'Weight',
  heightIn: 'Height',
  wingspanIn: 'Wingspan',
}

export function keySix(a: Athlete): MetricKey[] {
  return BY_GROUP[a.positionGroup] ?? BY_LEAGUE[a.league]
}

export function keySixStrip(a: Athlete): HTMLElement {
  const cells = keySix(a).map((key) => {
    const m = resolveMetric(a, key)
    const def = METRICS[key]
    if (!m) {
      return h('div', { class: 'k6 k6-empty', role: 'listitem', title: `${def.label}: not on file` }, h('span', { class: 'k6-label' }, SHORT[key] ?? def.label), h('span', { class: 'k6-value' }, '—'), h('span', { class: 'k6-src' }, 'Not on file'))
    }
    const src = m.sourceId ? a.sources[m.sourceId] : undefined
    const when = m.asOf ? fmtDate(m.asOf) : src?.published ? fmtDate(src.published) : src ? `checked ${fmtDate(src.retrieved)}` : ''
    const title = [def.label, src ? `${src.publisher}: ${src.title}` : 'No source on file', when, m.note ?? ''].filter(Boolean).join(' · ')
    return h(
      'div',
      { class: 'k6', role: 'listitem', title },
      h('span', { class: 'k6-label' }, SHORT[key] ?? def.label),
      h('span', { class: 'k6-value' }, formatMetric(key, m.value).replace(/ \(.*\)$/, '')),
      h('span', { class: 'k6-src' }, qualityChip(m.quality), ' ', src ? src.publisher : '', when ? ` · ${when}` : ''),
    )
  })
  return h('div', { class: 'key6', role: 'list', 'aria-label': 'Key measurables' }, cells)
}
