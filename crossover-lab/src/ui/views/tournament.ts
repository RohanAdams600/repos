import { allAthletes, getAthlete } from '../../data/roster'
import { DEFAULT_EVENTS, EVENTS, runTournament, type EventId } from '../../sim/tournament'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { qualityChip } from '../components'
import type { AppContext, View } from '../context'
import { h, mount } from '../dom'
import { athleteColor } from '../settings'

let state: { ids: string[]; events: EventId[]; seed: number } = { ids: ['jonathan-taylor', 'shohei-ohtani', 'donovan-mitchell'], events: DEFAULT_EVENTS, seed: 20261014 }

export function tournamentView(ctx: AppContext): View {
  const root = h('div', { class: 'stack', style: { gap: '20px' } })

  const build = () => {
    const roster = allAthletes()
    const athletes = state.ids.map((id) => getAthlete(id)).filter((a) => a !== undefined)
    const standings = runTournament(athletes, state.events, state.seed)
    // The podium stands on the stage in finishing order: winner in the middle.
    const order = standings.length >= 3 ? [standings[1]!, standings[0]!, standings[2]!, ...standings.slice(3)] : standings
    const stage = new LineupStage(ctx.viewer.scene, order.map((s) => s.athlete), signatureMotion, 1.8)
    ctx.viewer.setEnvironment('studio')
    ctx.viewer.setController(stage)
    ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'], record: true })
    order.forEach((s, i) => {
      const place = standings.indexOf(s) + 1
      ctx.viewer.addLabel(`p${i}`, h('div', { style: { '--swatch': athleteColor(roster.findIndex((a) => a.id === s.athlete.id)) } }, `${place}. ${s.athlete.name.split(' ').slice(-1)[0]} · ${s.total}`), (o) => {
        stage.rigs[i]!.jointWorld('head', o)
        o.y += 0.34
        return o
      })
    })

    const picker = h(
      'div',
      { class: 'picker', role: 'group', 'aria-label': 'Competitors' },
      roster.map((a, i) => {
        const on = state.ids.includes(a.id)
        return h(
          'button',
          {
            class: 'pick',
            type: 'button',
            'aria-pressed': String(on),
            style: { '--c': athleteColor(i) },
            onclick: () => {
              const ids = on ? state.ids.filter((x) => x !== a.id) : [...state.ids, a.id]
              if (ids.length < 2) return
              state = { ...state, ids }
              build()
            },
          },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          a.name,
        )
      }),
    )

    const eventPicker = h(
      'div',
      { class: 'picker', role: 'group', 'aria-label': 'Events' },
      (Object.keys(EVENTS) as EventId[]).map((id) => {
        const on = state.events.includes(id)
        return h(
          'button',
          {
            class: 'pick',
            type: 'button',
            'aria-pressed': String(on),
            onclick: () => {
              const events = on ? state.events.filter((x) => x !== id) : [...state.events, id]
              if (events.length === 0) return
              state = { ...state, events }
              build()
            },
          },
          EVENTS[id].label,
        )
      }),
    )

    const winner = standings[0]!
    const table = h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Event'), standings.map((s) => h('th', { class: 'n' }, s.athlete.name.split(' ').slice(-1)[0]!)))),
        h(
          'tbody',
          null,
          state.events.map((id, k) =>
            h(
              'tr',
              null,
              h('td', null, EVENTS[id].label),
              standings.map((s) => {
                const r = s.results[k]!
                const best = Math.max(...standings.map((x) => x.results[k]!.points))
                return h('td', { class: 'n', style: r.points === best ? { fontWeight: '700' } : null }, h('div', null, `${r.points}`), h('div', { class: 'src' }, r.display, ' ', qualityChip(r.quality)))
              }),
            ),
          ),
          h('tr', { class: 'lead' }, h('td', null, 'Total'), standings.map((s) => h('td', { class: 'n' }, h('span', { class: 'rank' }, s.total)))),
        ),
      ),
    )

    mount(
      root,
      h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Tournament · multi-event'), h('h1', null, `${winner.athlete.name} wins the decathlon`)),
      h(
        'div',
        { class: 'podium', role: 'list', 'aria-label': 'Podium' },
        standings.slice(0, 3).map((s, i) => h('div', { class: `step${i === 0 ? ' first' : ''}`, role: 'listitem', style: { minHeight: `${120 - i * 22}px` } }, h('span', { class: 'rank' }, `${i + 1}`), h('strong', null, s.athlete.name), h('span', { class: 'num' }, `${s.total} pts`), qualityChip(s.quality))),
      ),
      h('section', { class: 'section' }, h('h2', null, 'Competitors'), picker),
      h('section', { class: 'section' }, h('h2', null, `Events (${state.events.length})`), eventPicker),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Points by event'), h('button', { class: 'btn ghost', type: 'button', onclick: () => ((state = { ...state, seed: (Math.random() * 2 ** 31) >>> 0 }), build()) }, 'Rerun shooting events')), table),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Scoring'),
        h('p', null, 'Each event uses the decathlon formula: points = a × (b − time)^c for timed events and a × (mark − b)^c for marks. The 100 m uses the official decathlon table and the 200 m the official heptathlon table; the others are calibrated so an elite pro scores about 900. Strength events use lifts scaled to 200 lb bodyweight.'),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'data' },
            h('thead', null, h('tr', null, h('th', null, 'Event'), h('th', { class: 'n' }, 'a'), h('th', { class: 'n' }, 'b'), h('th', { class: 'n' }, 'c'), h('th', { class: 'n' }, '900 pts at'))),
            h(
              'tbody',
              null,
              state.events.map((id) => {
                const e = EVENTS[id]
                const target = e.kind === 'time' ? e.b - Math.pow(900 / e.a, 1 / e.c) : e.b + Math.pow(900 / e.a, 1 / e.c)
                return h('tr', null, h('td', null, e.label), h('td', { class: 'n' }, e.a), h('td', { class: 'n' }, e.b), h('td', { class: 'n' }, e.c), h('td', { class: 'n' }, `${target.toFixed(2)} ${e.unit}`))
              }),
            ),
          ),
        ),
      ),
      h('p', { class: 'note' }, h('strong', null, 'Fairness note. '), 'Simulated from the data on file. Several events sit outside each athlete’s sport, and those results are estimates or demo values as labeled.'),
    )
  }

  build()
  return { el: root }
}
