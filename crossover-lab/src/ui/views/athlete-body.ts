import type { BodySegment, Hotspot, Measured, MetricKey, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { feetInches, LB_TO_KG } from '../../data/metrics'
import { resolveMetric } from '../../data/resolve'
import { heatGradientCss } from '../../three/palette'
import { bodyMap, SEGMENT_LABEL } from '../bodymap'
import { qualityChip, seg, sourceCite } from '../components'
import { fmtDate, h } from '../dom'
import { onSettings, settings } from '../settings'
import type { AthleteScope } from './athlete'

interface BodyRow {
  label: string
  value: string
  quality: Quality
  note?: string
  m?: Measured
}

/** Modelled share of muscle and fat by segment for a lean pro athlete (SIMULATED). */
const MUSCLE: Partial<Record<BodySegment, number>> = { thighL: 0.95, thighR: 0.95, chest: 0.85, upperArmL: 0.75, upperArmR: 0.75, shinL: 0.6, shinR: 0.6, pelvis: 0.8, abdomen: 0.55, forearmL: 0.5, forearmR: 0.5, neck: 0.45 }
const FAT: Partial<Record<BodySegment, number>> = { abdomen: 0.9, pelvis: 0.7, thighL: 0.5, thighR: 0.5, chest: 0.45, upperArmL: 0.4, upperArmR: 0.4, shinL: 0.15, shinR: 0.15 }

export function bodyTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  scope.setStage('tpose', undefined, -Math.PI / 2)
  scope.ctx.viewer.removeLabel('name')
  const get = (k: MetricKey) => resolveMetric(a, k)
  const height = get('heightIn')
  const weight = get('weightLb')
  const span = get('wingspanIn')
  const fat = get('bodyFatPct')
  const hand = get('handSizeIn')
  const reach = get('standingReachIn')
  const rows: BodyRow[] = []
  if (height) rows.push({ label: 'Height', value: feetInches(height.value), quality: height.quality, m: height })
  if (weight) rows.push({ label: 'Weight', value: `${weight.value.toFixed(0)} lb (${(weight.value * LB_TO_KG).toFixed(1)} kg)`, quality: weight.quality, m: weight })
  if (height && weight) {
    const bmi = (weight.value * LB_TO_KG) / Math.pow(height.value * 0.0254, 2)
    rows.push({ label: 'BMI', value: bmi.toFixed(1), quality: weakest(height.quality, weight.quality, 'ESTIMATED'), note: 'Weight ÷ height². Misleading for muscular athletes; read with body fat.' })
  }
  if (span) rows.push({ label: 'Wingspan', value: feetInches(span.value), quality: span.quality, m: span })
  if (span && height) rows.push({ label: 'Wingspan minus height', value: `${span.value - height.value >= 0 ? '+' : ''}${(span.value - height.value).toFixed(1)} in`, quality: weakest(span.quality, height.quality), note: 'Ape index. Longer arms help reach, contests and catching radius.' })
  if (reach) rows.push({ label: 'Standing reach', value: feetInches(reach.value), quality: reach.quality, m: reach })
  if (hand) rows.push({ label: 'Hand size', value: `${hand.value.toFixed(2)} in`, quality: hand.quality, m: hand })
  if (fat) rows.push({ label: 'Body fat', value: `${fat.value.toFixed(1)}%`, quality: fat.quality, m: fat })
  if (fat && weight) {
    rows.push({ label: 'Lean mass', value: `${(weight.value * (1 - fat.value / 100)).toFixed(0)} lb`, quality: weakest(fat.quality, weight.quality, 'ESTIMATED'), note: 'Weight × (1 − body fat).' })
    rows.push({ label: 'Fat mass', value: `${((weight.value * fat.value) / 100).toFixed(0)} lb`, quality: weakest(fat.quality, weight.quality, 'ESTIMATED') })
  }

  // Tags pinned to the 3D model.
  const v = scope.ctx.viewer
  const rig = () => scope.stage.rig
  const tag = (id: string, text: string, q: Quality, joint: 'head' | 'wristL' | 'wristR' | 'chest' | 'spine', dy = 0) =>
    v.addLabel(id, h('div', null, text, h('span', { class: 'q' }, q)), (o) => {
      rig().jointWorld(joint, o)
      o.y += dy
      return o
    })
  if (height) tag('h', `Height ${feetInches(height.value)}`, height.quality, 'head', 0.3)
  if (span) tag('w', `Wingspan ${feetInches(span.value)}`, span.quality, 'wristL', 0.12)
  if (hand) tag('hand', `Hand ${hand.value.toFixed(2)} in`, hand.quality, 'wristR', -0.12)
  if (weight) tag('wt', `${weight.value.toFixed(0)} lb`, weight.quality, 'chest', 0.2)
  if (fat) tag('bf', `${fat.value.toFixed(1)}% body fat`, fat.quality, 'spine', 0.05)

  let map: 'off' | 'muscle' | 'fat' = 'off'
  const legend = h('div', { class: 'legend' })
  const apply = () => {
    const stops = heatGradientCss(settings().heatPalette)
    legend.replaceChildren(h('span', null, 'Less'), h('span', { class: 'ramp', 'aria-hidden': 'true' }, stops.map((c) => h('span', { style: { background: c } }))), h('span', null, map === 'fat' ? 'More fat' : 'More muscle'))
    legend.hidden = map === 'off'
    if (map === 'off') {
      rig().setHeatmap(null)
      return
    }
    const girth = rig().dims.girth
    const bf = (fat?.value ?? 12) / 12
    const table = map === 'muscle' ? MUSCLE : FAT
    const hotspots: Hotspot[] = (Object.entries(table) as [BodySegment, number][]).map(([segment, share]) => ({
      segment,
      along: 0.5,
      face: 'around',
      intensity: Math.min(1, share * (map === 'muscle' ? girth : bf * 0.8)),
      label: SEGMENT_LABEL[segment],
    }))
    rig().setHeatmap(hotspots, settings().heatPalette)
  }
  const off = onSettings(apply)
  scope.onLeave(() => {
    off()
    rig().setHeatmap(null)
  })
  apply()

  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Body composition'),
      h(
        'div',
        { class: 'list' },
        rows.map((r) => h('div', null, h('div', { class: 'grow stack', style: { gap: '2px' } }, h('div', null, h('strong', null, r.label), ' ', h('span', { class: 'num' }, r.value)), r.note ? h('span', { class: 'src' }, r.note) : r.m?.note ? h('span', { class: 'src' }, r.m.note) : null, r.m ? sourceCite(a, r.m.sourceId, r.m.asOf) : null), qualityChip(r.quality))),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Muscle and fat map'), legend),
      seg(
        [
          { value: 'off', label: 'Off' },
          { value: 'muscle', label: 'Muscle' },
          { value: 'fat', label: 'Fat' },
        ],
        map,
        (val) => {
          map = val
          apply()
        },
        'Body map',
      ),
      h('p', { class: 'src' }, 'Distribution is modelled from build and body fat for a lean pro athlete. ', qualityChip('SIMULATED'), ' No scan data is used.'),
    ),
  )
}

export function injuriesTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const list = [...a.injuries].sort((x, y) => y.date.localeCompare(x.date))
  const hotspots: Hotspot[] = list.map((i) => ({ segment: i.segment, along: i.segment.startsWith('shin') ? 0.85 : 0.5, face: 'around', intensity: i.surgery ? 1 : 0.7, label: i.title }))
  scope.stage.rig.setHeatmap(hotspots.length ? hotspots : null, settings().heatPalette)
  scope.onLeave(() => scope.stage.rig.setHeatmap(null))
  const missed = list.filter((i) => i.gamesMissed !== undefined).reduce((s, i) => s + (i.gamesMissed ?? 0), 0)
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Injury and recovery timeline'),
      h(
        'div',
        { class: 'row', style: { alignItems: 'flex-start', gap: '18px' } },
        bodyMap(
          list.map((i) => ({ segment: i.segment, surgery: i.surgery, label: `${i.title} (${fmtDate(i.date)})` })),
          `Body map of ${list.length} reported injuries`,
        ),
        h(
          'div',
          { class: 'stack grow', style: { minWidth: '220px' } },
          h('p', null, h('strong', null, `${list.length} reported injuries`), ` · ${missed} games missed where the source gives a count · ${list.filter((i) => i.surgery).length} surgeries`),
          h('p', { class: 'src' }, 'Orange areas on the map and the model mark injured regions; an outlined area means surgery. Only publicly reported injuries are listed, each with its source.'),
        ),
      ),
      h(
        'ol',
        { class: 'timeline' },
        list.map((i) =>
          h(
            'li',
            { class: i.surgery ? 'surgery' : '' },
            h('div', { class: 'tags' }, h('strong', null, fmtDate(i.date)), h('span', null, i.title), qualityChip(i.quality)),
            h('span', null, i.detail),
            h('span', { class: 'src' }, `${SEGMENT_LABEL[i.segment]}${i.gamesMissed !== undefined ? ` · ${i.gamesMissed} games missed` : ''}${i.surgery ? ' · surgery' : ''}`),
            sourceCite(a, i.sourceId),
          ),
        ),
      ),
    ),
  )
}
