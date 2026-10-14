import { allAthletes } from '../../data/roster'
import { gradesFor } from '../../grades/grades'
import { weeklyCard } from '../../sim/dynasty'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { qualityChip } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h, s } from '../dom'
import { athleteColor } from '../settings'

const KEY: Record<string, string[]> = { NFL: ['speed', 'elusiveness', 'tackleBreaking', 'awareness'], MLB: ['power', 'contact', 'velocity', 'command'], NBA: ['threePoint', 'finishing', 'vertical', 'perimeterDefense'] }
const ABBR: Record<string, string> = { RB: 'RB', TWP: 'TWP', G: 'SG' }

export function cardsView(ctx: AppContext): View {
  const roster = allAthletes()
  const stage = new LineupStage(ctx.viewer.scene, roster.slice(0, 4), signatureMotion, 1.7)
  ctx.viewer.setEnvironment('studio')
  ctx.viewer.setController(stage)
  ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'] })
  const today = new Date()
  const cards = roster.map((a, i) => {
    const card = weeklyCard(a, today)
    const grades = gradesFor(a)
    const keys = (KEY[a.league] ?? []).map((id) => grades.find((g) => g.id === id)).filter((g) => g !== undefined)
    const W = 180
    const H = 40
    const vals = card.weeks.map((w) => w.overall)
    const lo = Math.min(...vals) - 1
    const hi = Math.max(...vals) + 1
    const pts = vals.map((v, k) => `${(k / (vals.length - 1)) * (W - 8) + 4},${H - 4 - ((v - lo) / (hi - lo)) * (H - 8)}`)
    const spark = s(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': `Weekly overall for 8 weeks, from ${vals[0]} to ${vals[vals.length - 1]}` },
      s('polyline', { points: pts.join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      s('circle', { cx: pts[pts.length - 1]!.split(',')[0], cy: pts[pts.length - 1]!.split(',')[1], r: 3.5, fill: 'currentColor' }),
    )
    const current = card.weeks[card.weeks.length - 1]!
    return h(
      'article',
      { class: 'dcard', style: { '--c': athleteColor(i) }, 'aria-label': `${a.name} dynasty card` },
      h('div', { class: 'row', style: { alignItems: 'flex-end', justifyContent: 'space-between' } }, h('span', { class: 'ovr-big' }, current.overall), h('span', { class: 'mono' }, `${a.league} · ${ABBR[a.positionGroup] ?? a.position}`)),
      h('span', { class: 'nm' }, a.name),
      h('span', { class: 'mono' }, `${a.team} · #${a.kit.number}`),
      h('dl', null, keys.map((g) => [h('dt', null, g.label), h('dd', null, g.value)])),
      spark,
      h('span', { class: `mono delta ${card.delta > 0 ? 'up' : card.delta < 0 ? 'down' : ''}` }, card.delta === 0 ? 'No change this week' : `${card.delta > 0 ? '▲' : '▼'} ${Math.abs(card.delta)} this week`),
      h('span', { class: 'mono', style: { fontSize: '11px', opacity: '0.85' } }, `Week of ${fmtDate(current.weekStart)} · stats through ${card.latestStats}`),
    )
  })
  const el = h(
    'div',
    { class: 'stack', style: { gap: '20px' } },
    h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Season mode'), h('h1', null, 'Dynasty cards')),
    h('p', null, 'One card per athlete, rebuilt every Monday. The big number is the current overall grade; the line shows the last eight weeks.'),
    h('div', { class: 'cards' }, cards),
    h('p', { class: 'note' }, h('strong', null, 'Weekly movement is simulated. '), qualityChip('SIMULATED'), ' Live cards would be rebuilt each Monday from the stats feed. Until that feed is connected, the week-to-week line is a small seeded walk that ends at today’s real overall grade.'),
  )
  return { el }
}
