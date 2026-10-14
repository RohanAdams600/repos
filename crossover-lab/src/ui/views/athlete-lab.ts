import { allAthletes } from '../../data/roster'
import { groundReaction, peakRate, sampleAngles, type AngleSamples } from '../../sim/biomech'
import { MOTIONS, type MotionId } from '../../stage/motion-library'
import { lineChart } from '../charts'
import { qualityChip, selectField } from '../components'
import { h } from '../dom'
import { athleteColor } from '../settings'
import type { AthleteScope } from './athlete'

const LAB_MOTIONS: MotionId[] = ['run', 'vertical', 'broad', 'throw', 'pitch', 'swing', 'shoot', 'squat', 'clean']

const CHARTS: { key: keyof Omit<AngleSamples, 'u'>; label: string }[] = [
  { key: 'kneeR', label: 'Right knee flexion' },
  { key: 'hipR', label: 'Right hip flexion' },
  { key: 'elbowR', label: 'Right elbow flexion' },
  { key: 'trunkLean', label: 'Trunk forward lean' },
  { key: 'trunkTwist', label: 'Trunk rotation' },
]

let labState: { other?: string; motion?: MotionId } = {}

export function labTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const others = allAthletes().filter((x) => x.id !== a.id)
  const other = others.find((x) => x.id === labState.other) ?? others[0]
  if (!other) return h('p', { class: 'muted' }, 'Add a second athlete to compare.')
  const motion: MotionId = labState.motion && LAB_MOTIONS.includes(labState.motion) ? labState.motion : scope.motion && LAB_MOTIONS.includes(scope.motion) ? scope.motion : 'run'
  const ghostColor = parseInt(athleteColor(1).slice(1), 16)
  scope.setStage(motion, { athlete: other, color: ghostColor })
  scope.ctx.viewer.addLabel('ghost', h('div', { style: { '--swatch': athleteColor(1) } }, `Ghost: ${other.name}`), (o) => {
    scope.stage.ghost?.jointWorld('head', o)
    o.y += 0.12
    o.x -= 0.55
    return o
  })

  const spec = MOTIONS[motion]
  const mine = sampleAngles(scope.stage.rig, spec)
  const theirs = sampleAngles(scope.stage.ghost!, spec)
  const durA = spec.duration(a)
  const durB = spec.duration(other)

  const charts = CHARTS.map((c) =>
    h(
      'figure',
      { class: 'stack', style: { margin: '0', gap: '4px' } },
      h('figcaption', null, h('strong', null, c.label), h('span', { class: 'src' }, ' · degrees through one cycle')),
      lineChart(
        [
          { label: a.name, color: athleteColor(0), points: mine.u.map((u, i) => ({ x: Math.round(u * 100), y: Math.round(mine[c.key][i]!), quality: 'SIMULATED' as const })).filter((_, i) => i % 6 === 0) },
          { label: other.name, color: athleteColor(1), dashed: true, points: theirs.u.map((u, i) => ({ x: Math.round(u * 100), y: Math.round(theirs[c.key][i]!), quality: 'SIMULATED' as const })).filter((_, i) => i % 6 === 0) },
        ],
        { title: `${c.label}: ${a.name} vs ${other.name}`, height: 170, xLabels: [0, 25, 50, 75, 100].map((x) => ({ x, label: `${x}%` })) },
      ),
    ),
  )

  const row = (label: string, x: string, y: string) => h('tr', null, h('td', null, label), h('td', { class: 'n' }, x), h('td', { class: 'n' }, y))
  const peak = (s: number[]) => `${Math.round(Math.max(...s.map(Math.abs)))}°`
  const grfA = groundReaction(a)
  const grfB = groundReaction(other)
  const table = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Measure'), h('th', { class: 'n' }, a.name), h('th', { class: 'n' }, other.name))),
      h(
        'tbody',
        null,
        row('Peak knee flexion', peak(mine.kneeR), peak(theirs.kneeR)),
        row('Peak hip flexion', peak(mine.hipR), peak(theirs.hipR)),
        row('Peak trunk lean', peak(mine.trunkLean), peak(theirs.trunkLean)),
        row('Peak pelvis rotation speed', `${Math.round(peakRate(mine.hipYaw, durA))}°/s`, `${Math.round(peakRate(theirs.hipYaw, durB))}°/s`),
        row('Peak trunk rotation speed', `${Math.round(peakRate(mine.trunkTwist, durA))}°/s`, `${Math.round(peakRate(theirs.trunkTwist, durB))}°/s`),
        row('Sprint ground reaction force', `${(grfA.peakN / 1000).toFixed(2)} kN (${grfA.bodyweights.toFixed(1)}× BW)`, `${(grfB.peakN / 1000).toFixed(2)} kN (${grfB.bodyweights.toFixed(1)}× BW)`),
        row('Sprint contact / flight', `${grfA.contactMs.toFixed(0)} / ${grfA.flightMs.toFixed(0)} ms`, `${grfB.contactMs.toFixed(0)} / ${grfB.flightMs.toFixed(0)} ms`),
      ),
    ),
  )

  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'div',
      { class: 'row' },
      selectField(
        'lab-other',
        'Ghost overlay',
        others.map((x) => ({ value: x.id, label: x.name })),
        other.id,
        (v) => {
          labState = { ...labState, other: v }
          scope.ctx.navigate(`#a.${a.id}.lab`, true)
        },
      ),
      selectField(
        'lab-motion',
        'Motion',
        LAB_MOTIONS.map((m) => ({ value: m, label: MOTIONS[m].label })),
        motion,
        (v) => {
          labState = { ...labState, motion: v }
          scope.ctx.navigate(`#a.${a.id}.lab`, true)
        },
      ),
    ),
    h('p', { class: 'note' }, h('strong', null, 'Ghost overlay. '), `${other.name} is drawn see-through on the same spot doing the same motion, scaled to his own body. Joint angles come from each athlete's movement signature `, qualityChip(a.movement.quality), ' and ', qualityChip(other.movement.quality), '.'),
    table,
    h('p', { class: 'src' }, grfA.method, ' ', qualityChip(grfA.quality)),
    h('section', { class: 'section' }, h('h2', null, 'Joint angles'), ...charts),
  )
}

export function replayTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const spec = MOTIONS[scope.motion]
  const stage = scope.stage
  const phases = spec.captions.map((c) =>
    h(
      'li',
      null,
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: () => {
            stage.playing = false
            stage.seek(c.at * stage.duration)
          },
        },
        `${Math.round(c.at * 100)}%`,
      ),
      h('span', { class: 'grow' }, c.text),
    ),
  )
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'section',
      { class: 'section' },
      h('h2', null, `${spec.label} replay`),
      h('p', null, `Pick a camera on the stage, slow the action to 0.1×, or step frame by frame. Jump to a phase below. One cycle lasts ${spec.duration(a).toFixed(2)} s at full speed.`),
      h('ul', { class: 'list' }, phases),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Keyboard'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data' },
          h(
            'tbody',
            null,
            [
              ['Space', 'Play or pause'],
              [', and .', 'Back or forward one frame'],
              ['R', 'Restart'],
              ['1 to 4', 'Broadcast, behind, overhead, first-person camera'],
              ['Arrow keys, + and −', 'Orbit and zoom (click the stage first)'],
              ['C', 'Captions on or off'],
              ['?', 'All shortcuts'],
            ].map(([k, d]) => h('tr', null, h('td', null, h('kbd', null, k!)), h('td', null, d!))),
          ),
        ),
      ),
    ),
    h('p', { class: 'src' }, 'Motion is generated from the movement signature, not motion capture. ', qualityChip(a.movement.quality), ' Record a clip from the stage to save the replay as video.'),
  )
}
