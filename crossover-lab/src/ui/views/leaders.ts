import type { Athlete, League, MetricKey, Quality } from '../../data/types'
import { QUALITY_ORDER, weakest } from '../../data/types'
import { formatMetric, METRICS } from '../../data/metrics'
import { resolveMetric } from '../../data/resolve'
import { allAthletes } from '../../data/roster'
import { GRADE_DEFS, gradesFor, overall } from '../../grades/grades'
import { liftValue } from '../../sim/events'
import { strengthAtReference } from '../../sim/normalize'
import { topSpeedMph } from '../../sim/sprint'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { qualityChip, selectField } from '../components'
import type { AppContext, View } from '../context'
import { h, mount } from '../dom'
import { athleteColor } from '../settings'

interface Entry {
  value: number
  display: string
  quality: Quality
}

interface Board {
  id: string
  label: string
  higherIsBetter: boolean
  get: (a: Athlete) => Entry | undefined
}

const derivedBoards: Board[] = [
  { id: 'ovr', label: 'Overall grade', higherIsBetter: true, get: (a) => { const o = overall(a); return { value: o.value, display: String(o.value), quality: o.quality } } },
  { id: 'topSpeed', label: 'Top speed (estimated)', higherIsBetter: true, get: (a) => { const t = topSpeedMph(a); return { value: t.value, display: `${t.value.toFixed(1)} mph`, quality: t.quality } } },
  {
    id: 'strength',
    label: 'Strength total at 200 lb bodyweight',
    higherIsBetter: true,
    get: (a) => {
      const w = resolveMetric(a, 'weightLb')
      if (!w) return undefined
      const lifts = (['bench', 'squat', 'deadlift'] as const).map((k) => liftValue(a, k))
      const total = lifts.reduce((s, l) => s + l.value, 0)
      return { value: strengthAtReference(total, w.value), display: `${strengthAtReference(total, w.value).toFixed(0)} lb`, quality: weakest(w.quality, 'ESTIMATED', ...lifts.map((l) => l.quality)) }
    },
  },
]

const metricBoards: Board[] = (Object.keys(METRICS) as MetricKey[]).map((key) => ({
  id: `m:${key}`,
  label: METRICS[key].label,
  higherIsBetter: METRICS[key].higherIsBetter,
  get: (a) => {
    const m = resolveMetric(a, key)
    return m ? { value: m.value, display: formatMetric(key, m.value), quality: m.quality } : undefined
  },
}))

const gradeBoards: Board[] = GRADE_DEFS.map((d) => ({
  id: `g:${d.id}`,
  label: `${d.label} grade${d.group === 'Shared' ? '' : ` (${d.group})`}`,
  higherIsBetter: true,
  get: (a) => {
    if (d.group !== 'Shared' && d.group !== a.league) return undefined
    const g = gradesFor(a).find((x) => x.id === d.id)
    return g ? { value: g.value, display: String(g.value), quality: g.quality } : undefined
  },
}))

const BOARDS = [...derivedBoards, ...gradeBoards, ...metricBoards]

let state = { board: 'topSpeed', league: 'all' as 'all' | League, quality: 'SIMULATED' as Quality, custom: true }

export function leadersView(ctx: AppContext): View {
  const root = h('div', { class: 'stack', style: { gap: '20px' } })
  let stage: LineupStage | null = null

  const ranked = (board: Board, pool: Athlete[]) =>
    pool
      .map((a) => ({ a, e: board.get(a) }))
      .filter((x): x is { a: Athlete; e: Entry } => !!x.e && QUALITY_ORDER[x.e.quality] <= QUALITY_ORDER[state.quality])
      .sort((x, y) => (board.higherIsBetter ? y.e.value - x.e.value : x.e.value - y.e.value))

  const build = () => {
    const roster = allAthletes()
    const pool = roster.filter((a) => (state.league === 'all' || a.league === state.league) && (state.custom || !a.custom))
    const board = BOARDS.find((b) => b.id === state.board) ?? derivedBoards[1]!
    const rows = ranked(board, pool)
    const top = rows.slice(0, 4).map((r) => r.a)
    if (top.length) {
      stage = new LineupStage(ctx.viewer.scene, top, signatureMotion, 1.7)
      ctx.viewer.setEnvironment('studio')
      ctx.viewer.setController(stage)
      ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'] })
      top.forEach((a, i) =>
        ctx.viewer.addLabel(`l${i}`, h('div', { style: { '--swatch': athleteColor(roster.findIndex((x) => x.id === a.id)) } }, `${i + 1}. ${a.name.split(' ').slice(-1)[0]}`), (o) => {
          stage!.rigs[i]!.jointWorld('head', o)
          o.y += 0.34
          return o
        }),
      )
    }

    const champion = (board: Board, question: string) => {
      const r = ranked(board, roster.filter((a) => state.custom || !a.custom))[0]
      return h(
        'button',
        { class: 'card', type: 'button', style: { textAlign: 'left', alignItems: 'flex-start', cursor: 'pointer', font: 'inherit', color: 'inherit' }, onclick: () => ((state = { ...state, board: board.id, league: 'all' }), build()) },
        h('span', { class: 'eyebrow' }, question),
        r ? h('strong', { style: { fontFamily: 'var(--display)', fontSize: '1.9rem', textTransform: 'uppercase', lineHeight: '1' } }, r.a.name) : h('span', null, 'No data'),
        r ? h('span', { class: 'tags' }, h('span', { class: 'num' }, r.e.display), qualityChip(r.e.quality)) : null,
      )
    }

    mount(
      root,
      h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Leaderboards · all three leagues'), h('h1', null, 'Who leads on any number')),
      h(
        'div',
        { class: 'live' },
        champion(derivedBoards[1]!, 'Fastest'),
        champion(derivedBoards[2]!, 'Strongest for his size'),
        champion(metricBoards.find((b) => b.id === 'm:maxVerticalIn')!, 'Highest jumper'),
      ),
      h(
        'div',
        { class: 'row' },
        selectField('board', 'Rank by', BOARDS.map((b) => ({ value: b.id, label: b.label })), board.id, (v) => ((state = { ...state, board: v }), build())),
        selectField<'all' | League>('league', 'League', [{ value: 'all', label: 'All leagues' }, { value: 'NFL', label: 'NFL' }, { value: 'MLB', label: 'MLB' }, { value: 'NBA', label: 'NBA' }], state.league, (v) => ((state = { ...state, league: v }), build())),
        selectField<Quality>('quality', 'Data allowed', [{ value: 'SIMULATED', label: 'Everything' }, { value: 'ESTIMATED', label: 'Verified and estimated' }, { value: 'VERIFIED', label: 'Verified only' }], state.quality, (v) => ((state = { ...state, quality: v }), build())),
        h('label', { class: 'toggle', for: 'lead-custom' }, h('input', { type: 'checkbox', id: 'lead-custom', checked: state.custom, onchange: (e: Event) => ((state = { ...state, custom: (e.target as HTMLInputElement).checked }), build()) }), 'Include custom builds'),
      ),
      rows.length
        ? h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Athlete'), h('th', null, 'League'), h('th', { class: 'n' }, board.label), h('th', null, 'Data'))),
              h(
                'tbody',
                null,
                rows.map((r, i) => h('tr', { class: i === 0 ? 'lead' : '' }, h('td', null, h('span', { class: 'rank' }, i + 1)), h('td', null, h('a', { href: `#a.${r.a.id}.overview` }, r.a.name), r.a.custom ? ' (custom)' : ''), h('td', null, r.a.league), h('td', { class: 'n' }, r.e.display), h('td', null, qualityChip(r.e.quality)))),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No athlete has this figure at the data level you allowed. Loosen the data filter or pick another number.'),
      h('p', { class: 'src' }, 'Cross-league boards compare figures measured in different ways. Top speed is estimated from each athlete’s own sprint test; strength is scaled to 200 lb bodyweight.'),
    )
  }
  build()
  return { el: root }
}
