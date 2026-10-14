import './events.css'
import type { Athlete, League, Quality } from '../../data/types'
import { allAthletes } from '../../data/roster'
import { LIFT_LABEL, type LiftEvent } from '../../sim/events'
import { ROUTES, type RouteId } from '../../sim/nfl-events'
import {
  allowsCrossLeague,
  colorNumber,
  coverage,
  createEventStage,
  DEFAULT_SEED,
  EVENTS,
  eventPool,
  eventsFor,
  eventsHash,
  LEAGUE_EVENTS,
  OUTFIELD_DISTANCES_FT,
  parseSeed,
  resolvePicks,
  runEvent,
  type CardCell,
  type EventId,
  type EventOptions,
  type EventRun,
  type ScoreCard,
  type StageLayout,
  type VerticalTest,
  type WhyBlock,
} from '../../stage/event-stages'
import { qualityChip, seg, selectField, sourceCite } from '../components'
import type { AppContext, View } from '../context'
import { copyText, h, toast } from '../dom'
import { LEAGUES } from '../rail'
import { athleteColor } from '../settings'

/**
 * Same-league versus events: pick a league, an event and two athletes; the event runs from the
 * figures on file with a seed (same seed, same result), replays on the stage with matched lanes
 * or one shared spot, and ends in a score card that says what decided it and which figures went
 * in. Races, jumps, lifts and arm events can open to every league (size-adjusted, ESTIMATED).
 * Every outcome is SIMULATED.
 */

const VERTICAL_LABEL: Record<VerticalTest, string> = { maxVertical: 'Max vertical', standingVertical: 'Standing vertical', laneAgility: 'Lane agility' }

/** Per-page choices that are not in the link (options, layout, cross-league). */
const state: { cross: boolean; layout: Partial<Record<EventId, StageLayout>>; opts: Partial<Record<EventId, EventOptions>> } = { cross: false, layout: {}, opts: {} }

export function eventsView(ctx: AppContext, league: League = 'NFL', eventId?: EventId, ids: string[] = [], seed?: number): View {
  const roster = allAthletes()
  const id: EventId = eventId && (LEAGUE_EVENTS[league].includes(eventId) || allowsCrossLeague(eventId)) ? eventId : LEAGUE_EVENTS[league][0]!
  const def = EVENTS[id]
  // A link with an athlete from another league opens in cross-league mode.
  const linkCross = ids.some((x) => roster.find((a) => a.id === x && a.league !== league))
  if (linkCross && allowsCrossLeague(id)) state.cross = true
  const cross = state.cross && allowsCrossLeague(id)
  const pool = eventPool(id, league, cross, roster)
  const resolved = resolvePicks(id, pool, ids)
  const s = seed ?? DEFAULT_SEED
  const go = (next: { league?: League; eventId?: EventId; ids?: string[]; seed?: number }) =>
    ctx.navigate(eventsHash({ league: next.league ?? league, eventId: next.eventId ?? id, ids: next.ids ?? resolved?.picks.map((a) => a.id), seed: next.seed ?? s }), true)

  const leagueTabs = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'League' },
    LEAGUES.map((l) => h('a', { href: `#events.${l}`, 'aria-current': l === league ? 'page' : null }, l)),
  )
  const eventList = h(
    'div',
    { class: 'event-list', role: 'group', 'aria-label': `${league} events` },
    eventsFor(league).map((e) =>
      h(
        'a',
        { class: 'event-pick', href: eventsHash({ league, eventId: e.id }), 'aria-current': e.id === id ? 'true' : null },
        h('strong', null, e.label),
        h('span', { class: 'src' }, e.blurb),
      ),
    ),
  )

  const head = h(
    'div',
    { class: 'stack', style: { gap: '8px' } },
    h('span', { class: 'eyebrow' }, `Versus · ${league}${cross ? ' · cross-league' : ''}`),
    h('h1', null, def.label),
    h('p', { class: 'muted' }, def.blurb),
    leagueTabs,
  )

  if (!resolved) {
    ctx.viewer.setEnvironment(def.env, {})
    ctx.viewer.setController(null)
    ctx.hud.bind(null)
    const el = h(
      'div',
      { class: 'stack', style: { gap: '20px' } },
      head,
      eventList,
      h('p', { class: 'note' }, `Fewer than two ${league} athletes are on file for this event. Add profiles on the Import page, or open cross-league mode for races, jumps, lifts and arm events.`),
      h('a', { class: 'btn', href: '#import' }, 'Import a roster'),
    )
    return { el, dispose: () => undefined }
  }

  const picks = resolved.picks
  const opts = state.opts[id] ?? {}
  const layout = state.layout[id] ?? def.layouts[0]!
  const run = runEvent(id, picks, s, opts, cross)
  const colors = picks.map((a) => athleteColor(roster.findIndex((x) => x.id === a.id))) as [string, string]
  const built = createEventStage(ctx.viewer.scene, run, layout, [colorNumber(colors[0]), colorNumber(colors[1])])
  ctx.viewer.setEnvironment(built.env[0], built.env[1])
  ctx.viewer.setController(built.stage)
  ctx.hud.bind(built.stage, { transport: true, record: true, presets: ['broadcast', 'sideline', 'behind', 'overhead', 'firstPerson', 'closeup'] })
  built.stage.rigs.forEach((rig, i) => {
    const k = picks.findIndex((a) => a.id === rig.athlete.id)
    ctx.viewer.addLabel(`ev${i}`, h('div', { style: { '--swatch': colors[k < 0 ? i % 2 : k] } }, rig.athlete.name.split(' ').slice(-1)[0]!), (o) => {
      rig.jointWorld('head', o)
      o.y += 0.32
      return o
    })
  })

  // Pickers: one per role, each listing the pool with how many of the event's inputs are on file.
  const picker = (slot: 0 | 1) => {
    const keys = def.inputs[slot]
    const options = pool
      .filter((a) => a.id !== picks[1 - slot]!.id)
      .map((a) => {
        const c = coverage(a, keys)
        return { value: a.id, label: `${a.name} · ${a.position}${cross ? ` · ${a.league}` : ''} · ${c.have}/${c.of} inputs` }
      })
    return selectField(`ev-pick-${slot}`, def.roles?.[slot] ?? `Athlete ${slot + 1}`, options, picks[slot]!.id, (v) => {
      const next = picks.map((a) => a.id)
      next[slot] = v
      go({ ids: next })
    })
  }

  const optionControls: HTMLElement[] = []
  const setOpt = (o: EventOptions) => {
    state.opts[id] = { ...opts, ...o }
    go({})
  }
  if (id === 'route-race') {
    optionControls.push(selectField('ev-route', 'Route', (Object.keys(ROUTES) as RouteId[]).map((r) => ({ value: r, label: ROUTES[r].label })), opts.route ?? 'out', (route) => setOpt({ route })))
  }
  if (id === 'lift-off') {
    optionControls.push(selectField('ev-lift', 'Lift', (Object.keys(LIFT_LABEL) as LiftEvent[]).map((l) => ({ value: l, label: LIFT_LABEL[l] })), opts.lift ?? 'bench', (lift) => setOpt({ lift })))
  }
  if (id === 'vertical-agility') {
    optionControls.push(seg((Object.keys(VERTICAL_LABEL) as VerticalTest[]).map((t) => ({ value: t, label: VERTICAL_LABEL[t] })), opts.test ?? 'maxVertical', (test) => setOpt({ test }), 'Test on stage'))
  }
  if (id === 'arm-throw') {
    optionControls.push(selectField('ev-dist', 'Throw distance', OUTFIELD_DISTANCES_FT.map((f) => ({ value: String(f), label: `${f} ft` })), String(opts.distanceFt ?? 250), (v) => setOpt({ distanceFt: Number(v) })))
  }
  if (def.layouts.length > 1) {
    optionControls.push(
      seg(def.layouts.map((l) => ({ value: l, label: l === 'split' ? 'Split field' : 'Shared field' })), layout, (l) => {
        state.layout[id] = l
        go({})
      }, 'Stage layout'),
    )
  }
  if (allowsCrossLeague(id)) {
    const box = h('input', {
      type: 'checkbox',
      id: 'ev-cross',
      checked: cross,
      onchange: (e: Event) => {
        state.cross = (e.target as HTMLInputElement).checked
        go({ ids: state.cross ? picks.map((a) => a.id) : picks.filter((a) => a.league === league).map((a) => a.id) })
      },
    })
    optionControls.push(h('label', { class: 'check', for: 'ev-cross' }, box, ' Cross-league (size-adjusted, estimated)'))
  }

  // Seed: same seed, same result. A new seed reruns the random draws.
  const seedInput = h('input', { type: 'text', inputmode: 'numeric', id: 'ev-seed', value: String(s), 'aria-label': 'Seed', style: { width: '12ch', fontFamily: 'var(--mono)' } })
  const seedRow = h(
    'form',
    {
      class: 'row',
      onsubmit: (e: Event) => {
        e.preventDefault()
        const v = parseSeed((seedInput as HTMLInputElement).value)
        if (v === undefined) return toast('A seed is a whole number from 0 to 4294967295.')
        go({ seed: v })
      },
    },
    h('label', { for: 'ev-seed', class: 'src' }, 'Seed'),
    seedInput,
    h('button', { class: 'btn ghost', type: 'submit' }, 'Use seed'),
    h('button', { class: 'btn', type: 'button', onclick: () => go({ seed: (Math.random() * 2 ** 32) >>> 0 }) }, def.random ? 'Run again, new seed' : 'Run again'),
  )

  const liveEl = h('div', { class: 'live', 'aria-live': 'off' })
  let stopLive: (() => void) | null = null
  if (built.live) {
    const draw = () => {
      const cells = built.live!(built.stage.time)
      liveEl.replaceChildren(
        ...cells.map((c, i) =>
          h('div', { class: 'cell', style: { '--c': colors[i % 2] } }, h('span', { class: 'eyebrow' }, c.label), h('span', { class: 'big' }, c.big), h('span', { class: 'src num' }, c.sub, ' ', qualityChip(c.quality))),
        ),
      )
    }
    let acc = 0
    stopLive = ctx.viewer.onFrame((dt) => {
      acc += Math.max(dt, 1 / 60)
      if (acc < 0.1) return
      acc = 0
      draw()
    })
    draw()
  }

  const link = () => `${location.href.split('#')[0]}${eventsHash({ league, eventId: id, ids: picks.map((a) => a.id), seed: s })}`
  const shareInput = h('input', { type: 'text', readonly: true, value: eventsHash({ league, eventId: id, ids: picks.map((a) => a.id), seed: s }), 'aria-label': 'Event link', style: { flex: '1 1 220px', fontFamily: 'var(--mono)', fontSize: '12px' } })

  const el = h(
    'div',
    { class: 'stack', style: { gap: '20px' } },
    head,
    eventList,
    resolved.changed ? h('p', { class: 'note' }, 'An athlete in the link does not qualify for this event here, so the best-covered athlete on file takes that slot.') : null,
    h('section', { class: 'section' }, h('h2', null, 'Matchup'), h('div', { class: 'row ev-picks' }, picker(0), h('span', { class: 'vs', 'aria-hidden': 'true' }, 'vs'), picker(1)), optionControls.length ? h('div', { class: 'row' }, ...optionControls) : null, seedRow),
    cross ? h('p', { class: 'note' }, h('strong', null, 'Cross-league. '), 'Each athlete is measured in their own sport; size adjustments and conversions are estimates. ', qualityChip('ESTIMATED')) : null,
    scoreCard(run, colors),
    built.live ? h('section', { class: 'section' }, h('h2', null, 'Live'), liveEl) : null,
    whySection(run, colors),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Replay and share'),
      h('p', { class: 'src' }, 'Slow motion (0.1× to 1×), frame steps and cameras are on the stage. A link replays the same result: it carries the event, both athletes and the seed.'),
      h(
        'div',
        { class: 'row' },
        shareInput,
        h('button', { class: 'btn', type: 'button', onclick: async () => toast((await copyText(link(), shareInput)) ? 'Link copied' : 'Select the link and copy it') }, 'Copy link'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => void ctx.hud.record() }, 'Record clip'),
        h('a', { class: 'btn ghost', href: '#brackets' }, 'Brackets and ladders'),
      ),
      picks.some((a) => a.custom) ? h('p', { class: 'src' }, 'A custom athlete only exists in the browser that built it; others opening the link get the default picks.') : null,
    ),
    h('p', { class: 'note' }, h('strong', null, 'Simulated. '), 'These athletes did not meet. The result is a model run from the figures on file, with controlled randomness from the seed; it is not a prediction.'),
  )
  return {
    el,
    dispose() {
      stopLive?.()
    },
  }
}

function cellEl(c: CardCell): HTMLElement {
  return h('span', null, c.text, c.quality ? [' ', qualityChip(c.quality)] : null)
}

function scoreCard(run: EventRun, colors: [string, string]): HTMLElement {
  const card: ScoreCard = run.card
  const names = run.athletes.map((a) => a.name)
  return h(
    'section',
    { class: 'section score-card', 'aria-label': 'Score card' },
    h('div', { class: 'why-top' }, h('span', { class: 'eyebrow' }, 'Score card'), qualityChip(card.quality, 'A simulated outcome.')),
    h('h2', null, card.headline),
    h(
      'div',
      { class: 'score-row' },
      [0, 1].map((i) =>
        h(
          'div',
          { class: 'score-side', 'data-win': card.winner === i ? 'true' : null, style: { '--c': colors[i] } },
          h('span', { class: 'eyebrow' }, run.card.why[i as 0 | 1].role ?? names[i]),
          h('span', { class: 'score-big num' }, card.score[i as 0 | 1]),
          h('span', { class: 'src' }, names[i], card.winner === i ? ' · wins' : card.winner === null ? ' · tie' : ''),
        ),
      ),
    ),
    h('p', { class: 'src' }, card.scoreLabel, ' · ', card.basis),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data card-lines' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'n' }, names[0]), h('th', { class: 'n' }, names[1]))),
        h(
          'tbody',
          null,
          card.lines.map((l) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, l.label),
              [0, 1].map((i) => h('td', { class: l.better === i ? 'n lead' : 'n' }, cellEl(l.cells[i as 0 | 1]))),
            ),
          ),
        ),
      ),
    ),
    card.notes.length ? h('ul', { class: 'notes' }, card.notes.map((n) => h('li', null, n))) : null,
    card.detail.length ? h('details', null, h('summary', null, 'Model detail'), h('ul', { class: 'notes' }, card.detail.map((d) => h('li', null, d)))) : null,
  )
}

function whyBlock(w: WhyBlock, color: string): HTMLElement {
  const a: Athlete = w.athlete
  const q: Quality[] = w.inputs.flatMap((x) => (x.quality ? [x.quality] : []))
  return h(
    'div',
    { class: 'why-card', style: { '--c': color } },
    h('div', { class: 'why-top' }, h('span', { class: 'why-label' }, `${a.name}${w.role ? ` · ${w.role}` : ''}`), h('span', { class: 'src' }, `${q.length} of ${w.inputs.length} inputs on file`)),
    h(
      'ul',
      { class: 'why-inputs' },
      w.inputs.map((x) =>
        h(
          'li',
          null,
          h('strong', null, x.label), ': ', x.text, ' ',
          x.quality ? qualityChip(x.quality, x.note) : h('span', { class: 'src' }, 'not on file; the model uses a position default'),
          x.quality ? sourceCite(a, x.sourceId, x.asOf) : null,
        ),
      ),
    ),
    w.model.length ? h('p', { class: 'src' }, 'Model: ', w.model.map((c, i) => [i ? ' · ' : '', cellEl(c)])) : null,
  )
}

function whySection(run: EventRun, colors: [string, string]): HTMLElement {
  return h(
    'section',
    { class: 'section' },
    h('h2', null, 'What went in'),
    h('p', { class: 'src' }, 'The figures each sim read, with their labels and sources. A result is never better labelled than its weakest input, and every outcome is SIMULATED.'),
    h('div', { class: 'why-grid' }, whyBlock(run.card.why[0], colors[0]), whyBlock(run.card.why[1], colors[1])),
  )
}
