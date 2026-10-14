import * as THREE from 'three'
import type { Athlete, League } from '../../data/types'
import { formatMetric } from '../../data/metrics'
import { resolveMetric } from '../../data/resolve'
import { allAthletes, getAthlete } from '../../data/roster'
import { heightM, massKg } from '../../sim/normalize'
import { MOTIONS, type MotionId, type MotionSpec } from '../../stage/motion-library'
import { run } from '../../three/motions'
import type { EnvKind } from '../../three/env'
import { qualityChip, seg } from '../components'
import { h, toast } from '../dom'
import { athleteColor } from '../settings'
import type { AthleteScope } from './athlete'

/**
 * The 360 showroom: the athlete in a natural stance or a sport pose, on a turntable, with zoom
 * targets, measurement overlays and a form gallery frozen at key frames. A second athlete can
 * stand in a matched split screen: same lens, same angle, same distance.
 */
export interface PosePreset {
  id: string
  label: string
  motion: MotionId
  /** Where to freeze the motion (0..1); undefined plays it (breathing, the measurement pose). */
  at?: number
  leagues: League[]
}

export const POSES: PosePreset[] = [
  { id: 'natural', label: 'Natural stance', motion: 'idle', leagues: ['NFL', 'MLB', 'NBA'] },
  { id: 'measure', label: 'Wingspan pose', motion: 'tpose', leagues: ['NFL', 'MLB', 'NBA'] },
  { id: 'qbThrow', label: 'QB throwing', motion: 'throw', at: 0.32, leagues: ['NFL'] },
  { id: 'sprintStart', label: 'Sprint start', motion: 'sprintStart', at: 0.1, leagues: ['NFL', 'MLB', 'NBA'] },
  { id: 'battingStance', label: 'Batting stance', motion: 'swing', at: 0.02, leagues: ['MLB'] },
  { id: 'pitchingSet', label: 'Pitching set', motion: 'pitch', at: 0, leagues: ['MLB'] },
  { id: 'shootingForm', label: 'Shooting form', motion: 'shoot', at: 0.42, leagues: ['NBA'] },
]

export type KeyFrame = 'load' | 'peak' | 'release' | 'followThrough'
export const KEY_LABEL: Record<KeyFrame, string> = { load: 'Load', peak: 'Peak', release: 'Release', followThrough: 'Follow-through' }

export interface FormDef {
  id: string
  label: string
  spec: () => MotionSpec | null
  /** Key frames as 0..1 positions through the motion. */
  keys: (spec: MotionSpec) => Record<KeyFrame, number>
  note?: string
}

/** Key frames from a motion's release (or contact) point: wind-up, the moment before, the moment, after. */
function fromRelease(spec: MotionSpec): Record<KeyFrame, number> {
  const r = spec.release ?? 0.6
  return { load: r * 0.55, peak: r * 0.9, release: r, followThrough: Math.min(0.98, r + (1 - r) * 0.55) }
}

/** A stride cycle: foot strike, drive, opposite strike, recovery. */
const strideKeys = (): Record<KeyFrame, number> => ({ load: 0, peak: 0.25, release: 0.5, followThrough: 0.75 })

const carrySpec = (): MotionSpec => ({
  ...MOTIONS.run,
  label: 'Ball carry',
  prop: () => 'football',
  pose: (rig, u) => run(u, rig.athlete.movement.run, 1, 0, 'footballR'),
  captions: [
    { at: 0, text: 'Ball high and tight: tip up, elbow pinned.' },
    { at: 0.5, text: 'Free arm drives; the carry arm stays locked.' },
  ],
})

export const FORMS: FormDef[] = [
  { id: 'swing', label: 'Swing', spec: () => MOTIONS.swing, keys: fromRelease },
  { id: 'jumper', label: 'Jump shot', spec: () => MOTIONS.shoot, keys: fromRelease },
  { id: 'throw', label: 'Throw', spec: () => MOTIONS.throw, keys: fromRelease },
  { id: 'pitch', label: 'Pitch', spec: () => MOTIONS.pitch, keys: fromRelease },
  { id: 'sprint', label: 'Sprint', spec: () => MOTIONS.run, keys: strideKeys },
  { id: 'carry', label: 'Carry', spec: carrySpec, keys: strideKeys },
  { id: 'catch', label: 'Catch', spec: () => null, keys: strideKeys, note: 'Catch motion arrives with the extended motion library.' },
  { id: 'block', label: 'Block', spec: () => null, keys: strideKeys, note: 'Pass-block motion arrives with the extended motion library.' },
]

const VENUE: Record<League, EnvKind> = { NFL: 'stadium', MLB: 'ballpark', NBA: 'arena' }

type Zoom = 'full' | 'face' | 'torso' | 'hands' | 'feet'
const ZOOM: Record<Exclude<Zoom, 'full'>, { distance: number; dir: [number, number, number] }> = {
  face: { distance: 0.62, dir: [0.45, 0.08, 1] },
  torso: { distance: 1.5, dir: [0.5, 0.12, 1] },
  hands: { distance: 0.62, dir: [-0.9, 0.2, 0.7] },
  feet: { distance: 0.95, dir: [0.6, 0.45, 1] },
}

export function showroomTab(scope: AthleteScope, partnerId?: string): HTMLElement {
  const a = scope.athlete
  const ctx = scope.ctx
  const viewer = ctx.viewer
  let partner: Athlete | undefined = partnerId ? getAthlete(partnerId) : undefined
  let pose = POSES[0]!
  let form: FormDef | null = null
  let key: KeyFrame | null = null
  let place: 'studio' | 'day' | 'night' = 'studio'
  const overlays = { height: true, body: false, wingspan: false }
  const objects: THREE.Object3D[] = []
  const labelIds: string[] = []

  const clearOverlays = () => {
    for (const o of objects) {
      o.parent?.remove(o)
      o.traverse((x) => {
        if (x instanceof THREE.Mesh) {
          x.geometry.dispose()
          ;(x.material as THREE.Material).dispose()
        }
      })
    }
    objects.length = 0
    for (const id of labelIds) viewer.removeLabel(id)
    labelIds.length = 0
  }

  const environment = () => {
    if (place === 'studio') viewer.setEnvironment('studio')
    else viewer.setEnvironment(VENUE[a.league], { night: place === 'night' })
  }

  /** A ruler beside the athlete: ticks every 6 in, a longer one each foot. */
  const ruler = (who: Athlete, x: number, side: 0 | 1) => {
    const H = heightM(who)
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a2f })
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, H, 0.012), mat)
    bar.position.y = H / 2
    g.add(bar)
    for (let inch = 0; inch <= H / 0.0254 + 0.01; inch += 6) {
      const long = inch % 12 === 0
      const tick = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.09 : 0.05, 0.006, 0.006), mat.clone())
      tick.position.set(long ? 0.045 : 0.025, inch * 0.0254, 0)
      g.add(tick)
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.008, 0.008), mat.clone())
    top.position.set(0.25, H, 0)
    g.add(top)
    g.position.set(x - 0.62, 0, 0.05)
    scope.stage.group.add(g)
    objects.push(g)
    const m = resolveMetric(who, 'heightIn')
    const id = `ruler-${side}`
    viewer.addLabel(id, h('div', { style: { '--swatch': athleteColor(side) } }, m ? formatMetric('heightIn', m.value) : 'Height not on file', m ? qualityChip(m.quality) : null), (out) => out.set(x - 0.62, H + 0.08, 0.05), partner ? side : undefined)
    labelIds.push(id)
  }

  const bodyLabel = (who: Athlete, rigIndex: number, side: 0 | 1) => {
    const w = resolveMetric(who, 'weightLb')
    const bf = resolveMetric(who, 'bodyFatPct')
    const bmi = massKg(who) / heightM(who) ** 2
    const id = `body-${side}`
    viewer.addLabel(
      id,
      h(
        'div',
        { style: { '--swatch': athleteColor(side) } },
        w ? [`${formatMetric('weightLb', w.value)} `, qualityChip(w.quality)] : 'Weight not on file',
        bf ? [` · body fat ${formatMetric('bodyFatPct', bf.value)} `, qualityChip(bf.quality)] : '',
        w ? [` · BMI ${bmi.toFixed(1)} `, qualityChip('ESTIMATED', 'Computed from height and weight.')] : '',
      ),
      (out) => {
        const rig = scope.stage.rigs[rigIndex]
        if (!rig) return null
        return rig.jointWorld('chest', out).add(new THREE.Vector3(0.35, 0.05, 0))
      },
      partner ? side : undefined,
    )
    labelIds.push(id)
  }

  const wingspanLabel = (who: Athlete, rigIndex: number, side: 0 | 1) => {
    const m = resolveMetric(who, 'wingspanIn')
    const id = `span-${side}`
    viewer.addLabel(
      id,
      h('div', { style: { '--swatch': athleteColor(side) } }, m ? `Wingspan ${formatMetric('wingspanIn', m.value)} ` : 'Wingspan not on file', m ? qualityChip(m.quality) : null),
      (out) => {
        const rig = scope.stage.rigs[rigIndex]
        if (!rig) return null
        return rig.jointWorld('neck', out).add(new THREE.Vector3(0, 0.32, 0))
      },
      partner ? side : undefined,
    )
    labelIds.push(id)
  }

  const drawOverlays = () => {
    clearOverlays()
    const people: [Athlete, number, 0 | 1][] = [[a, 0, 0]]
    if (partner) people.push([partner, scope.stage.rigs.length - 1, 1])
    for (const [who, rigIndex, side] of people) {
      const x = side === 1 ? 40 : 0
      if (overlays.height) ruler(who, x, side)
      if (overlays.body) bodyLabel(who, rigIndex, side)
      if (overlays.wingspan) wingspanLabel(who, rigIndex, side)
    }
  }

  const freeze = () => {
    const stage = scope.stage
    const spec = stage.motion
    if (form && key) {
      stage.playing = false
      stage.seek(form.keys(spec)[key] * stage.duration)
    } else if (!form && pose.at !== undefined) {
      stage.playing = false
      stage.seek(pose.at * stage.duration)
    } else {
      stage.playing = true
    }
  }

  const build = () => {
    const motion = form ? (form.spec()?.id ?? 'idle') : pose.motion
    scope.setStage(motion, undefined, -0.9, partner)
    if (form) {
      const spec = form.spec()
      if (spec) scope.stage.setSpec(spec)
    }
    environment()
    freeze()
    drawOverlays()
    viewer.setPreset('broadcast', true)
    status.textContent = describe()
  }

  const describe = () => {
    const what = form ? `${form.label}${key ? `, frozen at ${KEY_LABEL[key].toLowerCase()}` : ', playing'}` : pose.label
    return `${what}${partner ? `, side by side with ${partner.name}` : ''}.`
  }

  const status = h('p', { class: 'muted', 'aria-live': 'polite' })

  // Pose presets: the league's own first.
  const poseButtons = h(
    'div',
    { class: 'picker', role: 'group', 'aria-label': 'Pose presets' },
    POSES.filter((p) => p.leagues.includes(a.league)).map((p) =>
      h(
        'button',
        {
          type: 'button',
          class: 'pick',
          'aria-pressed': String(!form && p.id === pose.id),
          onclick: (e: Event) => {
            pose = p
            form = null
            key = null
            if (p.id === 'measure') overlays.wingspan = true
            build()
            markPressed(e.currentTarget as HTMLElement)
          },
        },
        p.label,
      ),
    ),
  )

  const keyRow = h('div', { class: 'seg', role: 'group', 'aria-label': 'Key frame' })
  const drawKeys = () => {
    keyRow.replaceChildren(
      ...(['load', 'peak', 'release', 'followThrough'] as KeyFrame[]).map((k) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(key === k),
            disabled: !form || !form.spec(),
            onclick: () => {
              key = k
              freeze()
              viewer.turntable = true
              turntableToggle.checked = true
              drawKeys()
              status.textContent = describe()
            },
          },
          KEY_LABEL[k],
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          disabled: !form || !form.spec(),
          onclick: () => {
            key = null
            scope.stage.restart()
            drawKeys()
            status.textContent = describe()
          },
        },
        '▶ Play',
      ),
    )
  }

  const formButtons = h(
    'div',
    { class: 'picker', role: 'group', 'aria-label': 'Form gallery' },
    FORMS.map((f) =>
      h(
        'button',
        {
          type: 'button',
          class: 'pick',
          disabled: !f.spec(),
          title: f.note ?? '',
          onclick: (e: Event) => {
            form = f
            key = 'release'
            build()
            drawKeys()
            markPressed(e.currentTarget as HTMLElement)
          },
        },
        f.label,
      ),
    ),
  )

  const markPressed = (el: HTMLElement) => {
    for (const b of [...poseButtons.querySelectorAll('button'), ...formButtons.querySelectorAll('button')]) b.setAttribute('aria-pressed', String(b === el))
  }

  const zoomSeg = seg<Zoom>(
    [
      { value: 'full', label: 'Full body' },
      { value: 'face', label: 'Face' },
      { value: 'torso', label: 'Torso' },
      { value: 'hands', label: 'Hands' },
      { value: 'feet', label: 'Shoes' },
    ],
    'full',
    (z) => {
      if (z === 'full') {
        viewer.setPreset('broadcast')
        return
      }
      const spec = ZOOM[z]
      const target = scope.stage.rig.focusPoint(z === 'face' ? 'face' : z === 'torso' ? 'torso' : z === 'hands' ? 'hands' : 'feet', new THREE.Vector3())
      viewer.frameTarget(target, new THREE.Vector3(...spec.dir), spec.distance * (scope.stage.rig.dims.height / 1.85))
    },
    'Zoom',
  )

  const turntableToggle = h('input', {
    type: 'checkbox',
    id: 'turntable',
    onchange: (e: Event) => {
      viewer.turntable = (e.target as HTMLInputElement).checked
    },
  }) as HTMLInputElement

  const overlayToggle = (id: keyof typeof overlays, label: string) =>
    h(
      'label',
      { class: 'toggle', for: `ov-${id}` },
      h('input', {
        type: 'checkbox',
        id: `ov-${id}`,
        checked: overlays[id],
        onchange: (e: Event) => {
          overlays[id] = (e.target as HTMLInputElement).checked
          drawOverlays()
        },
      }),
      label,
    )

  const placeSeg = seg<'studio' | 'day' | 'night'>(
    [
      { value: 'studio', label: 'Studio' },
      { value: 'day', label: a.league === 'NBA' ? 'Arena' : 'Venue, day' },
      ...(a.league === 'NBA' ? [] : [{ value: 'night' as const, label: 'Venue, night' }]),
    ],
    place,
    (v) => {
      place = v
      environment()
    },
    'Setting',
  )

  const partnerSelect = h(
    'select',
    {
      id: 'showroom-partner',
      onchange: (e: Event) => {
        const id = (e.target as HTMLSelectElement).value
        partner = id ? getAthlete(id) : undefined
        build()
        toast(partner ? `Side by side with ${partner.name}` : 'Side by side off')
      },
    },
    h('option', { value: '' }, 'Nobody (single view)'),
    allAthletes()
      .filter((x) => x.id !== a.id)
      .sort((x, y) => Number(y.league === a.league) - Number(x.league === a.league) || x.name.localeCompare(y.name))
      .map((x) => h('option', { value: x.id, selected: x.id === partner?.id }, `${x.name} (${x.league}, ${x.position})`)),
  )

  scope.onLeave(() => {
    clearOverlays()
    viewer.turntable = false
  })

  drawKeys()
  build()

  return h(
    'div',
    { class: 'stack', style: { gap: '20px' } },
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Showroom'), placeSeg),
      status,
      h('div', { class: 'row' }, zoomSeg, h('label', { class: 'toggle', for: 'turntable' }, turntableToggle, '360 turntable')),
      h('p', { class: 'src' }, 'Drag to orbit, scroll or pinch to zoom. The figure is sized from the measurements on file; its face is a generic sculpt, not a likeness.'),
    ),
    h('section', { class: 'section' }, h('h2', null, 'Poses'), poseButtons),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Form gallery'),
      formButtons,
      keyRow,
      h('p', { class: 'src' }, 'Pick a form, freeze it at a key frame and orbit it in 360, then play the whole motion. Motions are procedural, shaped by the athlete’s movement profile, not motion capture.'),
    ),
    h('section', { class: 'section' }, h('h2', null, 'Overlays'), h('div', { class: 'row' }, overlayToggle('height', 'Height ruler'), overlayToggle('body', 'Weight and body composition'), overlayToggle('wingspan', 'Wingspan'))),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Side by side'),
      h('label', { for: 'showroom-partner', class: 'field' }, h('span', { class: 'label' }, 'Second athlete'), partnerSelect),
      h('p', { class: 'src' }, 'The screen splits in two with matching cameras: the same lens, angle and distance on each athlete, so the difference in size and form is real.'),
    ),
  )
}
