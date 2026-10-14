import { allAthletes, BUILT_IN, importedAthletes } from '../../data/roster'
import type { League } from '../../data/types'
import { teamsByLeague } from '../../data/teams'
import { LEAGUES, STATUS_LABEL } from '../rail'
import { gradesFor, overall } from '../../grades/grades'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { mixBar, qualityChip, tierOf } from '../components'
import type { AppContext, View } from '../context'
import { h } from '../dom'
import { athleteColor } from '../settings'

const KEY_GRADES: Record<string, string[]> = { NFL: ['speed', 'elusiveness', 'tackleBreaking'], MLB: ['power', 'velocity', 'armStrength'], NBA: ['vertical', 'speed', 'threePoint'] }

export function rosterView(ctx: AppContext): View {
  // Only the full profiles stand on the stage: every athlete on file would be dozens of figures.
  const athletes = [...BUILT_IN]
  const everyone = allAthletes()
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
        h('div', { class: 'ovr', style: { width: '72px', height: '82px' } }, h('small', null, 'OVR'), h('b', { style: { fontSize: '2.6rem' } }, o.enough ? o.value : '—'), h('small', null, o.enough ? tierOf(o.value).label.toUpperCase() : 'NO DATA')),
        h('div', { class: 'meta' }, h('div', { class: 'tags' }, h('span', { class: 'tag league' }, a.league), h('span', { class: 'tag' }, a.positionGroup === 'TWP' ? 'Two-way' : a.position), a.custom ? h('span', { class: 'tag' }, 'Custom') : null), h('h2', { style: { fontFamily: 'var(--display)', fontSize: '1.7rem', textTransform: 'uppercase' } }, a.name), h('span', { class: 'muted' }, a.team)),
      ),
      h('div', { class: 'row', style: { gap: '14px' } }, keys.map((g) => h('div', { class: 'stack', style: { gap: '0' } }, h('span', { class: 'eyebrow' }, g.label), h('span', { style: { fontFamily: 'var(--display)', fontSize: '1.6rem', fontWeight: '800' } }, g.value, ' ', qualityChip(g.quality))))),
      mixBar(o.mix),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `#a.${a.id}.overview` }, 'Open profile'), h('a', { class: 'btn ghost', href: `#a.${a.id}.showroom` }, 'Showroom'), h('a', { class: 'btn ghost', href: `#a.${a.id}.gear` }, 'Gear')),
    )
  })

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      h('span', { class: 'eyebrow' }, `${everyone.length} athletes on file · NFL, MLB, NBA`),
      h('h1', null, 'Three leagues, one lab'),
      h('p', { class: 'muted' }, 'Browse every club from the rail, open an athlete for the 360 showroom, grades, gear and movement, and put two in a same-league versus event. Every number carries a label saying where it came from.'),
    ),
    onFile(everyone),
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
    h('h2', null, 'Full profiles'),
    ...cards,
    h('div', { class: 'row' }, h('a', { class: 'btn', href: '#versus' }, 'Start a head-to-head'), h('a', { class: 'btn ghost', href: '#decathlon' }, 'Run a decathlon'), h('a', { class: 'btn ghost', href: '#leaders' }, 'Fastest, strongest, highest')),
  )
  return { el }
}

/** What is on file per league: profile types and roster statuses, with no invented rosters. */
function onFile(list: ReturnType<typeof allAthletes>): HTMLElement {
  const imported = importedAthletes().length
  const row = (league: League) => {
    const mine = list.filter((a) => a.league === league)
    const statuses = [...new Set(mine.map((a) => a.status))]
    return h(
      'tr',
      null,
      h('th', { scope: 'row' }, league),
      h('td', { class: 'n' }, mine.length),
      h('td', { class: 'n' }, mine.filter((a) => a.profile === 'full').length),
      h('td', { class: 'n' }, mine.filter((a) => a.profile === 'standout').length),
      h('td', { class: 'n' }, mine.filter((a) => a.profile === 'roster').length),
      h('td', null, statuses.map((st) => `${STATUS_LABEL[st]} ${mine.filter((a) => a.status === st).length}`).join(' · ')),
      h('td', { class: 'n' }, teamsByLeague(league).length),
    )
  }
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'On file'), h('a', { href: '#standouts' }, 'See the standouts')),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'League'), h('th', { class: 'n' }, 'Athletes'), h('th', { class: 'n' }, 'Full'), h('th', { class: 'n' }, 'Standout'), h('th', { class: 'n' }, 'Imported'), h('th', null, 'Statuses'), h('th', { class: 'n' }, 'Clubs'))),
        h('tbody', null, LEAGUES.map(row)),
      ),
    ),
    h(
      'p',
      { class: 'src' },
      'Full rosters, practice squads, two-way and 10-day contracts load from a licensed roster file or feed through ',
      h('a', { href: '#import' }, 'Import'),
      `. Nothing is scraped, and clubs with nobody on file say so in the rail.${imported ? ` ${imported} imported rows are kept in this browser.` : ''}`,
    ),
  )
}
