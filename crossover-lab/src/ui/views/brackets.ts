import './brackets.css'
import { allAthletes, getAthlete } from '../../data/roster'
import type { Athlete, League } from '../../data/types'
import {
  byCoverage,
  createEventLadder,
  DEFAULT_FIELD,
  defaultEntrants,
  EVENTS,
  expectedMark,
  formatMark,
  LADDER_HASH_PREFIX,
  ladderHash,
  LEAGUE_EVENTS,
  LEAGUES,
  loadLadder,
  MAX_ENTRANTS,
  MIN_ENTRANTS,
  parseLadderHash,
  playLadderChallenge,
  resetLadder,
  runEventBracket,
  saveLadder,
  type BracketEvent,
  type EventBracket,
  type EventRun,
  type SharedLadder,
} from '../../data/ladder-store'
import { canChallenge, LADDER_REACH, type BracketMatch, type Ladder } from '../../sim/brackets'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion, type MotionId } from '../../stage/motion-library'
import { qualityChip, selectField } from '../components'
import type { AppContext, View } from '../context'
import { copyText, fmtDate, h, mount, toast } from '../dom'
import { athleteColor } from '../settings'

/** Re-exported so the router can recognise '#ladder.<code>' links without importing the store. */
export { parseLadderHash, LADDER_HASH_PREFIX } from '../../data/ladder-store'

/** The page's own route; shared ladder links close back to it. */
const HOME = '#brackets'

interface BracketState {
  league: League
  event: BracketEvent
  /** Hand-picked entrants, or null for the default field of `size`. */
  ids: string[] | null
  size: number
  seed: number
}

/** Kept between visits so coming back to the page shows the same bracket. */
let state: BracketState = { league: 'NFL', event: 'forty', ids: null, size: DEFAULT_FIELD, seed: 20261014 }

/** Each event's loop on the stage: sprints stride, jumpers jump, agility cuts. */
const STAGE_MOTION: Record<BracketEvent, ((a: Athlete) => MotionId) | MotionId> = {
  forty: 'run',
  homeToFirst: 'run',
  maxVertical: 'vertical',
  laneAgility: 'cut',
  overall: signatureMotion,
}

const NOISE_TEXT: Record<BracketEvent, string> = {
  forty: 'Each heat is one run: the time the sprint model gives for the athlete’s figures, plus a random draw with a spread of 0.04 s.',
  homeToFirst: 'Each heat is one trip down the line: the home-to-first time on file (or the sprint model plus the swing finish), plus a random draw with a spread of 0.06 s.',
  maxVertical: 'Each heat is one jump: the max vertical on file (or an estimate from the standing vertical), plus a random draw with a spread of 1.2 in.',
  laneAgility: 'Each heat is one run of the lane agility drill: the time on file (or one read from the agility grade), plus a random draw with a spread of 0.15 s.',
  overall: 'Each heat is one game score: the athlete’s overall grade plus a random draw with a spread of 4 points.',
}

const defined = <T>(x: T | undefined): x is T => x !== undefined

function leagueAthletes(league: League): Athlete[] {
  return allAthletes().filter((a) => a.league === league)
}

/** The chosen field, dropping anyone no longer on file (cleared imports, deleted customs). */
function entrantIds(): string[] {
  const pool = new Set(leagueAthletes(state.league).map((a) => a.id))
  const ids = state.ids ?? defaultEntrants(allAthletes(), state.league, state.event, state.size)
  return ids.filter((id) => pool.has(id))
}

function entrants(): Athlete[] {
  return entrantIds().map((id) => getAthlete(id)).filter(defined)
}

function nameOf(id: string | null): string {
  if (!id) return 'TBD'
  return getAthlete(id)?.name ?? `${id} (not on file here)`
}

/** Local date and time of a ladder result. */
function when(at: number): string {
  const d = new Date(at)
  if (!Number.isFinite(d.getTime())) return ''
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${fmtDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function eventLabel(league: League, event: BracketEvent): string {
  return `${league} · ${EVENTS[event].label}`
}

/**
 * Brackets and the challenge ladder. `hash` defaults to the current location so the router can
 * send '#ladder.<code>' links here unchanged; a valid one opens that shared ladder.
 */
export function bracketsView(ctx: AppContext, hash: string = typeof location === 'undefined' ? '' : location.hash): View {
  let shared: SharedLadder | null = parseLadderHash(hash)
  const badLink = hash.startsWith(LADDER_HASH_PREFIX) && !shared
  if (shared) state = { ...state, league: shared.league, event: shared.event, ids: state.league === shared.league ? state.ids : null }

  const controls = h('div', { class: 'stack' })
  const bracketOut = h('div', { class: 'stack' })
  const bracketLive = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' })
  const ladderStatus = h('div', { role: 'status', 'aria-live': 'polite' })
  const ladderOut = h('div', { class: 'stack' })
  const ladderHeading = h('h2', { id: 'br-ladder-title' })
  let stageKey = ''
  let stageTimer = 0

  const setChoice = (change: Partial<BracketState>, focusId: string) => {
    const league = change.league ?? state.league
    state = { ...state, ...change, ids: change.ids !== undefined ? change.ids : league === state.league ? state.ids : null }
    if (shared) {
      // A shared ladder belongs to its own league and event: any change goes back to your own.
      shared = null
      ctx.navigate(HOME)
      return
    }
    ladderStatus.replaceChildren()
    renderControls()
    renderBracket(true)
    renderLadder()
    document.getElementById(focusId)?.focus()
  }

  // ------------------------------------------------------------------------------------------
  // Controls

  const renderControls = () => {
    const pool = byCoverage(leagueAthletes(state.league), state.event)
    const most = Math.min(MAX_ENTRANTS, pool.length)
    const sizes = Array.from({ length: Math.max(0, most - MIN_ENTRANTS + 1) }, (_, i) => String(i + MIN_ENTRANTS))
    const sizeOptions = [...(state.ids ? [{ value: 'custom', label: 'Hand-picked' }] : []), ...sizes.map((n) => ({ value: n, label: `Top ${n}` }))]
    const seedInput = h('input', {
      id: 'br-seed',
      type: 'number',
      inputmode: 'numeric',
      min: '0',
      step: '1',
      value: String(state.seed),
      onchange: () => {
        const n = Math.floor(Number(seedInput.value))
        if (!Number.isFinite(n) || seedInput.value.trim() === '') {
          seedInput.value = String(state.seed)
          return
        }
        state = { ...state, seed: n >>> 0 }
        seedInput.value = String(state.seed)
        renderBracket(true)
      },
    })
    const row = h(
      'div',
      { class: 'br-controls' },
      selectField('br-league', 'League', LEAGUES.map((l) => ({ value: l, label: l })), state.league, (v) => setChoice({ league: v, event: LEAGUE_EVENTS[v][0]! }, 'br-league')),
      selectField('br-event', 'Event', LEAGUE_EVENTS[state.league].map((e) => ({ value: e, label: EVENTS[e].label })), state.event, (v) => setChoice({ event: v }, 'br-event')),
      sizes.length ? selectField('br-size', 'Field, by data coverage', sizeOptions, state.ids ? 'custom' : String(Math.min(state.size, most)), (v) => (v === 'custom' ? undefined : setChoice({ size: Number(v), ids: null }, 'br-size'))) : null,
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'br-seed' }, 'Seed'),
        h(
          'div',
          { class: 'br-inline' },
          seedInput,
          h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onclick: () => {
                state = { ...state, seed: (Math.random() * 2 ** 31) >>> 0 }
                seedInput.value = String(state.seed)
                renderBracket(true)
              },
            },
            'New seed',
          ),
        ),
      ),
    )
    mount(controls, row, pool.length < MIN_ENTRANTS ? h('p', { class: 'note' }, `Fewer than two ${state.league} athletes are on file, so there is no field to draw. Import a roster to add more.`) : entrantPicker(pool))
  }

  const entrantPicker = (pool: Athlete[]): HTMLElement => {
    const chosen = new Set(entrantIds())
    const count = h('span', { class: 'src' })
    const boxes: HTMLInputElement[] = []
    const sync = () => {
      count.textContent = ` ${chosen.size} chosen (${MIN_ENTRANTS} to ${MAX_ENTRANTS})`
      for (const b of boxes) b.disabled = !b.checked && chosen.size >= MAX_ENTRANTS
    }
    const items = pool.map((a) => {
      const e = expectedMark(a, state.event)
      const box = h('input', {
        type: 'checkbox',
        id: `br-e-${a.id}`,
        checked: chosen.has(a.id),
        onchange: () => {
          if (box.checked) chosen.add(a.id)
          else chosen.delete(a.id)
          state = { ...state, ids: pool.filter((x) => chosen.has(x.id)).map((x) => x.id) }
          // The quick pick no longer describes the field, so it says so.
          const size = controls.querySelector<HTMLSelectElement>('#br-size')
          if (size && size.value !== 'custom') {
            if (!size.querySelector('option[value="custom"]')) size.prepend(h('option', { value: 'custom' }, 'Hand-picked'))
            size.value = 'custom'
          }
          sync()
          renderBracket(true)
          renderLadder()
        },
      })
      boxes.push(box)
      const mark =
        state.event === 'overall' && e.thin
          ? h('span', { class: 'tag' }, 'Thin data: no overall shown')
          : [h('span', { class: 'num', title: e.basis }, e.thin ? `${formatMark(state.event, e.value)} default` : `${formatMark(state.event, e.value)} expected`), qualityChip(e.quality, e.basis)]
      return h(
        'li',
        null,
        h(
          'label',
          { for: box.id },
          box,
          h('span', { class: 'br-pick-main' }, h('strong', null, a.name), h('span', { class: 'src' }, `${a.position} · ${a.team}`)),
          h('span', { class: 'br-pick-mark' }, mark),
        ),
      )
    })
    sync()
    return h(
      'fieldset',
      { class: 'br-entrants' },
      h('legend', null, 'Entrants', count),
      h('p', { class: 'src', style: { margin: '0 0 4px' } }, `Sorted by data coverage: athletes with their own ${EVENTS[state.event].label.toLowerCase()} figures first, then by how much of their overall grade rests on measured data.`),
      h('ul', { class: 'br-picks' }, items),
    )
  }

  // ------------------------------------------------------------------------------------------
  // Bracket

  const seedCell = (id: string | null, seeds: Map<string, number>) => h('span', { class: 'br-seed' }, h('span', { class: 'sr-only' }, 'Seed '), id ? String(seeds.get(id) ?? '') : '')

  const matchCard = (m: BracketMatch, heat: { a: EventRun; b: EventRun } | undefined, seeds: Map<string, number>): HTMLElement => {
    if (m.bye) {
      const id = m.a ?? m.b
      return h('li', { class: 'br-match bye' }, h('div', { class: 'br-side' }, seedCell(id, seeds), h('span', { class: 'br-name' }, nameOf(id)), h('span'), h('span', { class: 'br-res' }, 'Bye')), h('div', { class: 'br-meta src' }, 'Advances without a heat.'))
    }
    const side = (id: string | null, run: EventRun | undefined) =>
      h('div', { class: `br-side${m.winner === id ? ' win' : ''}` }, seedCell(id, seeds), h('span', { class: 'br-name' }, nameOf(id)), h('span', { class: 'br-mark' }, run?.display ?? ''), h('span', { class: 'br-res' }, m.winner === id ? 'Won' : 'Lost'))
    return h(
      'li',
      { class: 'br-match' },
      side(m.a, heat?.a),
      side(m.b, heat?.b),
      h('div', { class: 'br-meta' }, h('span', { class: 'src' }, heat ? 'One seeded attempt each' : m.score), qualityChip(m.quality ?? 'SIMULATED', 'Decided by a seeded random draw around each expected mark.')),
    )
  }

  /**
   * The last four on the stage, champion beside the runner-up. Building a figure takes tens of
   * milliseconds, so after the first draw the stage waits for clicks to settle and is rebuilt
   * only when the four change.
   */
  const queueStage = (run: EventBracket | null, now = false) => {
    window.clearTimeout(stageTimer)
    if (now) updateStage(run)
    else stageTimer = window.setTimeout(() => updateStage(run), 350)
  }

  const updateStage = (run: EventBracket | null) => {
    const cast: { id: string; role: string }[] = []
    if (run) {
      const rounds = run.bracket.rounds
      const final = rounds.at(-1)?.matches[0]
      const champion = run.bracket.champion
      const loser = (m: BracketMatch) => (m.bye ? null : m.winner === m.a ? m.b : m.a)
      const runnerUp = final ? loser(final) : null
      const semis = rounds.length >= 2 ? rounds.at(-2)!.matches.map(loser).filter((x): x is string => x !== null) : []
      if (semis[0]) cast.push({ id: semis[0], role: 'Semifinal' })
      if (runnerUp) cast.push({ id: runnerUp, role: 'Final' })
      if (champion) cast.push({ id: champion, role: 'Champion' })
      if (semis[1]) cast.push({ id: semis[1], role: 'Semifinal' })
    }
    const key = `${state.event}|${cast.map((c) => `${c.id}:${c.role}`).join(',')}`
    if (key === stageKey) return
    stageKey = key
    const athletes = cast.map((c) => getAthlete(c.id)).filter(defined)
    const motion = STAGE_MOTION[state.event]
    const stage = new LineupStage(ctx.viewer.scene, athletes, typeof motion === 'function' ? motion : () => motion, 1.8)
    ctx.viewer.setEnvironment('studio')
    ctx.viewer.setController(stage)
    ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'], record: true })
    athletes.forEach((a, i) =>
      ctx.viewer.addLabel(`br${i}`, h('div', { style: { '--swatch': athleteColor(i) } }, `${cast[i]?.role ?? ''} · ${a.name}`), (o) => {
        stage.rigs[i]!.jointWorld('head', o)
        o.y += 0.34
        return o
      }),
    )
  }

  const renderBracket = (announceIt: boolean) => {
    const field = entrants()
    if (field.length < MIN_ENTRANTS) {
      mount(bracketOut, h('p', { class: 'note' }, 'Pick at least two entrants to draw a bracket.'))
      if (announceIt) bracketLive.textContent = 'Pick at least two entrants to draw a bracket.'
      queueStage(null, !announceIt)
      return
    }
    const run = runEventBracket(field, state.event, state.seed)
    const { bracket, seeds, heats } = run
    const champion = bracket.champion
    const wins = bracket.rounds.reduce((n, r) => n + r.matches.filter((m) => !m.bye && m.winner === champion).length, 0)
    const finalHeat = heats.get(`${bracket.rounds.length - 1}:0`)
    const [won, lost] = finalHeat ? (finalHeat.a.athleteId === champion ? [finalHeat.a, finalHeat.b] : [finalHeat.b, finalHeat.a]) : []
    const finalText = won && lost ? ` · won the final ${won.display} to ${lost.display}` : ''
    const thin = field.filter((a) => expectedMark(a, state.event).thin)
    const def = EVENTS[state.event]

    mount(
      bracketOut,
      h(
        'div',
        { class: 'br-champ' },
        h('div', { class: 'stack', style: { gap: '2px', flex: '1 1 180px' } }, h('span', { class: 'eyebrow' }, `Champion · ${eventLabel(state.league, state.event)}`), h('span', { class: 'br-champ-name' }, nameOf(champion)), h('span', { class: 'src' }, `${wins} heat${wins === 1 ? '' : 's'} won${finalText} · seed ${state.seed}`)),
        bracket.quality ? qualityChip(bracket.quality, 'Every heat is a seeded random draw.') : null,
      ),
      h(
        'ol',
        { class: 'br-rounds' },
        bracket.rounds.map((round, r) =>
          h(
            'li',
            { class: 'br-round' },
            h('h3', { id: `br-round-${r}` }, round.name),
            h(
              'ol',
              { class: 'br-matches', 'aria-labelledby': `br-round-${r}` },
              round.matches.map((m, i) => matchCard(m, heats.get(`${r}:${i}`), seeds)),
            ),
          ),
        ),
      ),
      h('p', { class: 'src' }, `${NOISE_TEXT[state.event]} The spread is a model setting, not a league statistic. Seeds follow the expected marks, best first, and byes go to the top seeds. The same seed always replays the same bracket.`),
      thin.length
        ? h('p', { class: 'note' }, h('strong', null, `${thin.length} of ${field.length} entrants have thin data. `), state.event === 'overall' ? 'Under 40% of their overall rests on measured grades, so position baselines fill the rest and their game scores are demo values. ' : `They have no ${def.label.toLowerCase()} figures on file, so their expected mark is a league default (SIMULATED). `, 'They are seeded last.')
        : null,
    )
    if (announceIt) bracketLive.textContent = `${nameOf(champion)} wins the ${def.label} bracket of ${field.length}. Simulated result.`
    queueStage(run, !announceIt)
  }

  // ------------------------------------------------------------------------------------------
  // Ladder

  const rungList = (ladder: Ladder, interactive: boolean, onChallenge: (c: string, d: string) => void): HTMLElement =>
    h(
      'ol',
      { class: 'list br-ladder', 'aria-labelledby': 'br-ladder-title' },
      ladder.order.map((id, i) => {
        const a = getAthlete(id)
        const targets = interactive && a ? ladder.order.slice(Math.max(0, i - LADDER_REACH), i).filter((d) => getAthlete(d) && canChallenge(ladder, id, d)) : []
        return h(
          'li',
          { class: 'br-rung', id: `br-rung-${id}`, tabindex: '-1' },
          h('span', { class: 'br-rung-no' }, h('span', { class: 'sr-only' }, 'Rung '), String(i + 1)),
          h('span', { class: 'grow stack', style: { gap: '1px' } }, h('strong', null, nameOf(id)), h('span', { class: 'src' }, a ? `${a.position} · ${a.team}` : 'Not on file in this browser, so this rung cannot play.')),
          targets.length
            ? h(
                'span',
                { class: 'br-challenges', role: 'group', 'aria-label': `Challenges open to ${nameOf(id)}` },
                targets.map((d) => {
                  const rung = ladder.order.indexOf(d) + 1
                  // The visible words start the accessible name, so voice control can say them.
                  return h('button', { class: 'btn ghost', type: 'button', onclick: () => onChallenge(id, d) }, `Challenge #${rung}`, h('span', { class: 'sr-only' }, `, ${nameOf(d)}`))
                }),
              )
            : null,
        )
      }),
    )

  const historyList = (ladder: Ladder): HTMLElement =>
    ladder.history.length === 0
      ? h('p', { class: 'src' }, 'No challenges yet.')
      : h(
          'ol',
          { class: 'list br-history', reversed: true },
          [...ladder.history].reverse().map((r) =>
            h(
              'li',
              null,
              h(
                'span',
                { class: 'grow stack', style: { gap: '2px' } },
                h('span', null, h('strong', null, nameOf(r.winner)), r.winner === r.challenger ? ` beat ${nameOf(r.defender)} and took the rung` : ` held off ${nameOf(r.challenger)}`),
                h('span', { class: 'src' }, `${when(r.at)} · ${r.score}, challenger first`),
              ),
              qualityChip(r.quality),
            ),
          ),
        )

  const renderShared = (s: SharedLadder) => {
    ladderHeading.textContent = `Shared ladder · ${eventLabel(s.league, s.event)}`
    const missing = s.ladder.order.filter((id) => !getAthlete(id)).length
    mount(
      ladderOut,
      h('p', { class: 'note' }, h('strong', null, 'Someone shared this ladder. '), `${s.ladder.order.length} rungs and the latest ${s.ladder.history.length} results. It is shown read-only; save it to this browser to keep challenging. `, missing ? `${missing} athlete${missing === 1 ? ' is' : 's are'} not on file here (imported or custom athletes only exist in the browser that added them).` : ''),
      rungList(s.ladder, false, () => undefined),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              const label = eventLabel(s.league, s.event)
              if (loadLadder(s.league, s.event) && !window.confirm(`Replace your saved ${label} ladder with this shared one? Your order and history for it will be lost.`)) return
              saveLadder(s.league, s.event, s.ladder)
              toast(`Saved the ${label} ladder`)
              shared = null
              ctx.navigate(HOME)
            },
          },
          'Save to this browser',
        ),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => ((shared = null), ctx.navigate(HOME)) }, 'Close shared ladder'),
      ),
      h('h3', null, 'Results'),
      historyList(s.ladder),
    )
  }

  const renderLadder = (focusId?: string) => {
    if (shared) {
      renderShared(shared)
      return
    }
    const { league, event } = state
    ladderHeading.textContent = `Challenge ladder · ${eventLabel(league, event)}`
    const stored = loadLadder(league, event)
    const field = entrants()
    if (!stored && field.length < MIN_ENTRANTS) {
      mount(ladderOut, h('p', { class: 'note' }, 'Pick at least two entrants above to start a ladder.'))
      return
    }
    const ladder = stored ?? createEventLadder(field, event)

    const onChallenge = (cId: string, dId: string) => {
      const c = getAthlete(cId)
      const d = getAthlete(dId)
      if (!c || !d || !canChallenge(ladder, cId, dId)) return
      const { ladder: next, heat } = playLadderChallenge(ladder, event, c, d, Date.now())
      saveLadder(league, event, next)
      const won = heat.winner === cId
      mount(
        ladderStatus,
        h(
          'p',
          { class: 'note' },
          h('strong', null, won ? `${c.name} beats ${d.name}. ` : `${d.name} holds off ${c.name}. `),
          `${c.name} ${heat.a.display}, ${d.name} ${heat.b.display}. `,
          won ? `${c.name} moves up to rung ${next.order.indexOf(cId) + 1}. ` : 'The order stays the same. ',
          qualityChip(heat.quality, 'Decided by a seeded random draw around each expected mark.'),
        ),
      )
      renderLadder(`br-rung-${cId}`)
    }

    const shareInput = h('input', { type: 'text', id: 'br-share', readonly: true, placeholder: 'Share link appears here', 'aria-label': 'Share link for this ladder' })
    mount(
      ladderOut,
      h(
        'p',
        { class: 'src' },
        stored ? `Saved in this browser, ${stored.history.length} result${stored.history.length === 1 ? '' : 's'} so far. ` : 'Not started: until the first challenge the order follows the entrants chosen above, best expected mark on top. After that it is saved in this browser. ',
        `A challenger may take on anyone up to ${LADDER_REACH} rungs above. Win and take that rung while everyone between moves down one; lose and nothing moves.`,
      ),
      rungList(ladder, true, onChallenge),
      h(
        'div',
        { class: 'br-share' },
        shareInput,
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: async () => {
              const link = `${location.href.split('#')[0]}${ladderHash(league, event, ladder)}`
              shareInput.value = link
              const ok = await copyText(link, shareInput)
              toast(ok ? 'Link copied' : 'Select the link and copy it')
            },
          },
          'Copy share link',
        ),
        h(
          'button',
          {
            class: 'btn ghost',
            type: 'button',
            onclick: () => {
              if (!window.confirm(`Reset the ${eventLabel(league, event)} ladder? Its order and history are deleted from this browser, and it restarts from the entrants chosen above.`)) return
              resetLadder(league, event)
              mount(ladderStatus, h('p', { class: 'note' }, `The ${eventLabel(league, event)} ladder was reset.`))
              renderLadder()
            },
          },
          'Reset ladder',
        ),
      ),
      h('p', { class: 'src' }, `The link carries the order and the latest results. Imported and custom athletes only exist in the browser that added them.`),
      h('h3', null, 'Results'),
      historyList(ladder),
    )
    if (focusId) document.getElementById(focusId)?.focus()
  }

  // ------------------------------------------------------------------------------------------

  renderControls()
  renderBracket(false)
  renderLadder()

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      h('span', { class: 'eyebrow' }, 'Brackets · challenge ladders'),
      h('h1', null, 'Brackets and ladders'),
      h('p', { class: 'muted' }, 'Draw a knockout bracket on one test, or keep a standing ladder where anyone can challenge up to two rungs above. Each heat is one simulated attempt around the athlete’s expected mark, so every result here is SIMULATED.'),
      h('div', { class: 'tags' }, qualityChip('SIMULATED'), h('span', { class: 'src' }, 'heat results and champions'), qualityChip('ESTIMATED'), h('span', { class: 'src' }, 'expected marks from a model on measured figures')),
    ),
    badLink ? h('p', { class: 'note', role: 'alert' }, h('strong', null, 'That ladder link could not be read. '), 'It may have been cut short when it was copied. Showing your own ladders instead.') : null,
    h('section', { class: 'section', 'aria-labelledby': 'br-bracket-title' }, h('h2', { id: 'br-bracket-title' }, 'Bracket'), controls, bracketLive, bracketOut),
    h('section', { class: 'section', 'aria-labelledby': 'br-ladder-title' }, ladderHeading, ladderStatus, ladderOut),
    h('p', { class: 'note' }, h('strong', null, 'Fairness note. '), 'Expected marks come from the figures on file. A measured time or jump is used as it is; a 40 runs through the sprint model, so it is ESTIMATED at best; athletes with no figures for the event get a league default, labelled SIMULATED. Hover or focus a label to see the basis.'),
  )
  return { el, dispose: () => window.clearTimeout(stageTimer) }
}
