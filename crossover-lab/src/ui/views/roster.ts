import { allAthletes } from '../../data/roster'
import { gradesFor, overall } from '../../grades/grades'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { mixBar, qualityChip, tierOf } from '../components'
import type { AppContext, View } from '../context'
import { h } from '../dom'
import { athleteColor } from '../settings'

const KEY_GRADES: Record<string, string[]> = { NFL: ['speed', 'elusiveness', 'tackleBreaking'], MLB: ['power', 'velocity', 'armStrength'], NBA: ['vertical', 'speed', 'threePoint'] }

export function rosterView(ctx: AppContext): View {
  const athletes = allAthletes()
  const stage = new LineupStage(ctx.viewer.scene, athletes, signatureMotion, 1.7)
  ctx.viewer.setEnvironment('studio')
  ctx.viewer.setController(stage)
  ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'], record: true })
  athletes.forEach((a, i) =>
    ctx.viewer.addLabel(`n${i}`, h('div', { style: { '--swatch': athleteColor(i) } }, a.name), (o) => {
      stage.rigs[i]!.jointWorld('head', o)
      o.y += 0.36
      return o
    }),
  )

  const cards = athletes.map((a, i) => {
    const grades = gradesFor(a)
    const o = overall(a, grades)
    const keys = (KEY_GRADES[a.league] ?? []).map((id) => grades.find((g) => g.id === id)).filter((g) => g !== undefined)
    return h(
      'article',
      { class: 'card', style: { borderTop: `4px solid ${athleteColor(i)}` } },
      h(
        'div',
        { class: 'athlete-head' },
        h('div', { class: 'ovr', style: { width: '72px', height: '82px' } }, h('small', null, 'OVR'), h('b', { style: { fontSize: '2.6rem' } }, o.value), h('small', null, tierOf(o.value).label.toUpperCase())),
        h('div', { class: 'meta' }, h('div', { class: 'tags' }, h('span', { class: 'tag league' }, a.league), h('span', { class: 'tag' }, a.positionGroup === 'TWP' ? 'Two-way' : a.position), a.custom ? h('span', { class: 'tag' }, 'Custom') : null), h('h2', { style: { fontFamily: 'var(--display)', fontSize: '1.7rem', textTransform: 'uppercase' } }, a.name), h('span', { class: 'muted' }, a.team)),
      ),
      h('div', { class: 'row', style: { gap: '14px' } }, keys.map((g) => h('div', { class: 'stack', style: { gap: '0' } }, h('span', { class: 'eyebrow' }, g.label), h('span', { style: { fontFamily: 'var(--display)', fontSize: '1.6rem', fontWeight: '800' } }, g.value, ' ', qualityChip(g.quality))))),
      mixBar(o.mix),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `#a.${a.id}.overview` }, 'Open profile'), h('a', { class: 'btn ghost', href: `#a.${a.id}.gear` }, 'Gear'), h('a', { class: 'btn ghost', href: `#a.${a.id}.lab` }, 'Biomech lab')),
    )
  })

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h('div', { class: 'stack', style: { gap: '8px' } }, h('span', { class: 'eyebrow' }, 'Demo roster · 3 athletes · NFL, MLB, NBA'), h('h1', null, 'Three leagues, one lab'), h('p', { class: 'muted' }, 'Grade each athlete on a 0 to 99 scale, try gear on and off, then put any two in a race, a lift-off or a pitch duel. Every number carries a label saying where it came from.')),
    h(
      'div',
      { class: 'tags' },
      qualityChip('VERIFIED'),
      h('span', { class: 'src' }, 'checked against a cited source'),
      qualityChip('ESTIMATED'),
      h('span', { class: 'src' }, 'derived by a stated formula'),
      qualityChip('SIMULATED'),
      h('span', { class: 'src' }, 'demo value, no public source'),
    ),
    ...cards,
    h('div', { class: 'row' }, h('a', { class: 'btn', href: '#versus' }, 'Start a head-to-head'), h('a', { class: 'btn ghost', href: '#decathlon' }, 'Run a decathlon'), h('a', { class: 'btn ghost', href: '#leaders' }, 'Fastest, strongest, highest')),
  )
  return { el }
}
