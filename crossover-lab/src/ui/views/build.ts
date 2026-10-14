import type { Athlete } from '../../data/types'
import { allAthletes, BUILT_IN, removeCustomAthlete, saveCustomAthlete } from '../../data/roster'
import { gradesFor, overall } from '../../grades/grades'
import { blendAthletes, type BlendWeights } from '../../sim/build'
import { topSpeedMph } from '../../sim/sprint'
import { signatureMotion } from '../../stage/motion-library'
import { ShowcaseStage } from '../../stage/showcase'
import { gradeTile, mixBar, qualityChip, selectField } from '../components'
import type { AppContext, View } from '../context'
import { h, mount, toast } from '../dom'
import { feetInches } from '../../data/metrics'
import { resolveMetric } from '../../data/resolve'

let state = { a: 'jonathan-taylor', b: 'donovan-mitchell', base: 'A' as 'A' | 'B', name: 'Taylor-Mitchell', number: '1', w: { body: 0.3, speed: 0.5, power: 0.7, agility: 0.5, skill: 0 } as BlendWeights }

const GROUPS: { key: keyof BlendWeights; label: string; help: string }[] = [
  { key: 'body', label: 'Body', help: 'Height, weight, wingspan, hands, body fat' },
  { key: 'speed', label: 'Speed', help: '40-yard time and running style' },
  { key: 'power', label: 'Power', help: 'Jumps, lifts, throwing arm' },
  { key: 'agility', label: 'Agility', help: 'Shuttle, cones, mobility, conditioning' },
  { key: 'skill', label: 'Sport skills', help: 'Production stats (same sport only) and technique' },
]

export function buildView(ctx: AppContext): View {
  const root = h('div', { class: 'stack', style: { gap: '20px' } })
  let stage: ShowcaseStage | null = null
  let timer = 0

  const make = (): Athlete => {
    const a = allAthletes().find((x) => x.id === state.a) ?? BUILT_IN[0]!
    const b = allAthletes().find((x) => x.id === state.b) ?? BUILT_IN[2]!
    return blendAthletes(a, b, state.w, { name: state.name, number: state.number, base: state.base, today: new Date().toISOString().slice(0, 10) })
  }

  const preview = h('div', { class: 'stack', style: { gap: '14px' } })

  const showStage = (athlete: Athlete) => {
    stage = new ShowcaseStage(ctx.viewer.scene, athlete, signatureMotion(athlete))
    ctx.viewer.setEnvironment('studio')
    ctx.viewer.setController(stage)
    ctx.hud.bind(stage, { transport: true, record: true })
    ctx.viewer.addLabel('name', h('div', null, `${athlete.name} #${athlete.kit.number}`), (o) => {
      stage!.rig.jointWorld('head', o)
      o.y += 0.36
      return o
    })
  }

  const drawPreview = (rebuildStage: boolean) => {
    const athlete = make()
    if (rebuildStage) showStage(athlete)
    const grades = gradesFor(athlete)
    const o = overall(athlete, grades)
    const top = [...grades].sort((x, y) => y.value - x.value).slice(0, 6)
    const h1 = resolveMetric(athlete, 'heightIn')
    const w1 = resolveMetric(athlete, 'weightLb')
    mount(
      preview,
      h(
        'div',
        { class: 'athlete-head' },
        h('div', { class: 'ovr' }, h('small', null, 'OVR'), h('b', null, o.value), h('small', null, 'CUSTOM')),
        h('div', { class: 'meta' }, h('div', { class: 'tags' }, h('span', { class: 'tag league' }, athlete.league), h('span', { class: 'tag' }, athlete.position), qualityChip('SIMULATED')), h('h2', { style: { fontFamily: 'var(--display)', fontSize: '2rem', textTransform: 'uppercase' } }, athlete.name), h('span', { class: 'muted num' }, `${h1 ? feetInches(h1.value) : ''} · ${w1 ? `${w1.value.toFixed(0)} lb` : ''} · ${topSpeedMph(athlete).value.toFixed(1)} mph top speed`)),
      ),
      mixBar(o.mix),
      h('div', { class: 'grades' }, top.map((g) => gradeTile(g, athlete))),
      h('p', { class: 'src' }, athlete.summary),
    )
  }

  const schedule = () => {
    window.clearTimeout(timer)
    drawPreview(false)
    timer = window.setTimeout(() => drawPreview(true), 250)
  }

  const build = () => {
    const roster = allAthletes()
    const options = roster.filter((x) => !x.custom || x.id === state.a || x.id === state.b).map((x) => ({ value: x.id, label: x.name }))
    const saved = roster.filter((x) => x.custom)
    mount(
      root,
      h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Build-an-athlete'), h('h1', null, 'Blend two athletes')),
      h(
        'div',
        { class: 'row' },
        selectField('parent-a', 'Athlete A', options, state.a, (v) => ((state = { ...state, a: v }), build())),
        selectField('parent-b', 'Athlete B', options, state.b, (v) => ((state = { ...state, b: v }), build())),
        selectField<'A' | 'B'>('base', 'Plays the sport of', [{ value: 'A', label: 'Athlete A' }, { value: 'B', label: 'Athlete B' }], state.base, (v) => ((state = { ...state, base: v }), schedule())),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Traits'),
        ...GROUPS.map((g) => {
          const id = `blend-${g.key}`
          const value = h('span', { class: 'num mono' }, `${Math.round((1 - state.w[g.key]) * 100)} / ${Math.round(state.w[g.key] * 100)}`)
          return h(
            'div',
            { class: 'field' },
            h('label', { for: id }, `${g.label}: A / B`),
            h('input', {
              type: 'range',
              id,
              min: '0',
              max: '100',
              step: '5',
              value: String(Math.round(state.w[g.key] * 100)),
              'aria-valuetext': `${Math.round((1 - state.w[g.key]) * 100)} percent athlete A`,
              oninput: (e: Event) => {
                const v = Number((e.target as HTMLInputElement).value) / 100
                state = { ...state, w: { ...state.w, [g.key]: v } }
                value.textContent = `${Math.round((1 - v) * 100)} / ${Math.round(v * 100)}`
                ;(e.target as HTMLInputElement).setAttribute('aria-valuetext', `${Math.round((1 - v) * 100)} percent athlete A`)
                schedule()
              },
            }),
            h('span', { class: 'row', style: { justifyContent: 'space-between', gap: '6px' } }, h('span', { class: 'src' }, g.help), value),
          )
        }),
      ),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: 'build-name' }, 'Name'), h('input', { type: 'text', id: 'build-name', value: state.name, maxlength: '40', oninput: (e: Event) => ((state = { ...state, name: (e.target as HTMLInputElement).value }), schedule()) })),
        h('div', { class: 'field' }, h('label', { for: 'build-number' }, 'Number'), h('input', { type: 'text', id: 'build-number', value: state.number, maxlength: '2', inputmode: 'numeric', style: { width: '5rem' }, oninput: (e: Event) => ((state = { ...state, number: (e.target as HTMLInputElement).value.replace(/\D/g, '') }), schedule()) })),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              const athlete = make()
              saveCustomAthlete(athlete)
              toast(`${athlete.name} saved to the roster in this browser`)
              build()
            },
          },
          'Save to roster',
        ),
      ),
      h('section', { class: 'section' }, h('h2', null, 'Preview'), preview),
      h('p', { class: 'note' }, h('strong', null, 'Every figure on a custom athlete is simulated. '), 'Sport skills only blend between athletes of the same sport; across sports the custom athlete keeps the base athlete’s skills.'),
      h(
        'section',
        { class: 'section' },
        h('h2', null, `Saved builds (${saved.length})`),
        saved.length
          ? h(
              'div',
              { class: 'list' },
              saved.map((x) =>
                h(
                  'div',
                  null,
                  h('a', { class: 'grow', href: `#a.${x.id}.overview` }, x.name),
                  h('span', { class: 'tag' }, x.league),
                  h('button', { class: 'btn ghost', type: 'button', onclick: () => (removeCustomAthlete(x.id), toast(`${x.name} removed`), build()) }, 'Remove'),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Saved builds join the roster for head-to-heads, the decathlon and leaderboards. They stay in this browser.'),
      ),
    )
    drawPreview(true)
  }

  build()
  return {
    el: root,
    dispose() {
      window.clearTimeout(timer)
    },
  }
}
