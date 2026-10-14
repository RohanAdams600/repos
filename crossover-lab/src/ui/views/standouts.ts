import type { Athlete, League } from '../../data/types'
import { allAthletes, getAthlete } from '../../data/roster'
import { buildStandouts, type StandoutEntry, type Standouts } from '../../standouts/engine'
import { LineupStage } from '../../stage/lineup'
import { signatureMotion } from '../../stage/motion-library'
import { qualityChip, sourceCite } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h } from '../dom'
import { LEAGUES } from '../rail'
import { shortName } from '../../stage/event-stages'
import { athleteColor } from '../settings'

/**
 * Standouts: outliers per league, discovered from the figures on file. Every entry names the
 * exact figure, its label, how many athletes it was ranked against, the source's own rank wording
 * when there is one, the percentile against position norms (ESTIMATED), and the source and date.
 * The lists are rebuilt for the current week every time the page opens.
 */
export function standoutsView(ctx: AppContext, league: League = 'NFL', today = new Date()): View {
  const page: Standouts = buildStandouts(allAthletes(), { league, today })

  // On stage: the leader of each section that has one, at most six figures.
  const leaders: Athlete[] = []
  for (const s of page.sections) {
    const first = s.entries[0]
    const a = first ? getAthlete(first.athleteId) : undefined
    if (a && !leaders.some((x) => x.id === a.id) && leaders.length < 6) leaders.push(a)
  }
  const venue = league === 'NFL' ? 'stadium' : league === 'MLB' ? 'ballpark' : 'arena'
  let stage: LineupStage | null = null
  if (leaders.length) {
    stage = new LineupStage(ctx.viewer.scene, leaders, (a) => (a.league === 'NFL' ? 'idle' : signatureMotion(a)), 1.8)
    ctx.viewer.setEnvironment(venue)
    ctx.viewer.setController(stage)
    ctx.hud.bind(stage, { presets: ['broadcast', 'sideline', 'behind', 'overhead'], record: true })
    leaders.forEach((a, i) =>
      ctx.viewer.addLabel(`lead${i}`, h('div', { style: { '--swatch': athleteColor(i) }, title: a.name }, shortName(a)), (o) => {
        stage!.rigs[i]!.jointWorld('head', o)
        o.y += i % 2 ? 0.62 : 0.36
        return o
      }),
    )
  } else {
    ctx.viewer.setEnvironment('studio')
    ctx.viewer.setController(null)
    ctx.hud.bind(null)
  }

  const leagueTabs = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'League' },
    LEAGUES.map((l) => h('a', { href: `#standouts.${l}`, 'aria-current': l === league ? 'page' : null }, l)),
  )

  const entryCard = (e: StandoutEntry, rank: number) => {
    const a = getAthlete(e.athleteId)
    return h(
      'li',
      { class: 'standout' },
      h(
        'details',
        null,
        h(
          'summary',
          null,
          h('span', { class: 'standout-rank', 'aria-label': `Number ${rank}` }, rank),
          h('span', { class: 'standout-who' }, h('strong', null, e.athleteName), h('span', { class: 'src' }, ` ${e.positionGroup}${a ? ` · ${a.team}` : ''}`)),
          h('span', { class: 'standout-value' }, e.display, ' ', qualityChip(e.quality)),
          e.outlier ? h('span', { class: 'tag outlier', title: 'At or above the 95th percentile of the position norm' }, 'Outlier') : null,
        ),
        h(
          'div',
          { class: 'why-card' },
          h('div', { class: 'why-top' }, h('span', { class: 'why-label' }, 'Why they stand out'), qualityChip(e.quality)),
          h('p', null, e.why),
          h('p', null, h('strong', null, e.label), `: ${e.display}`),
          h('p', null, h('strong', null, 'Rank: '), e.rankText),
          e.sourceRank ? h('p', { class: 'quote' }, `“${e.sourceRank}”`) : null,
          e.percentile !== undefined ? h('p', null, h('strong', null, 'Percentile: '), `${e.percentile}th against ${e.positionGroup} norms `, e.percentileQuality ? qualityChip(e.percentileQuality, 'Position norms are approximate.') : null) : null,
          a ? sourceCite(a, e.sourceId, e.asOf) : e.asOf ? h('span', { class: 'src' }, `As of ${fmtDate(e.asOf)}`) : null,
          h('a', { href: `#a.${e.athleteId}.overview` }, `Open ${e.athleteName}`),
        ),
      ),
    )
  }

  const sections = page.sections.map((s) =>
    h(
      'section',
      { class: 'section', id: `standouts-${s.id}` },
      h('div', { class: 'section-head' }, h('h2', null, s.label), h('span', { class: 'src' }, `${s.entries.length} on the list`)),
      s.entries.length ? h('ol', { class: 'standout-list' }, s.entries.map((e, i) => entryCard(e, i + 1))) : h('p', { class: 'muted' }, 'Nobody on file qualifies yet.'),
    ),
  )

  const el = h(
    'div',
    { class: 'stack', style: { gap: '20px' } },
    h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      h('span', { class: 'eyebrow' }, `Standouts · ${league} · week of ${fmtDate(page.generatedWeek)}`),
      h('h1', null, `${league} standouts`),
      h('p', { class: 'muted' }, 'Outliers found in the figures on file: fastest, most explosive, strongest, best arms, rarest builds, rising, most improved and hidden gems. Simulated values never qualify. Ranks are among the athletes on file and say how many; a source’s own ranking is quoted, never written by the app.'),
      leagueTabs,
    ),
    h('nav', { class: 'toc', 'aria-label': 'Sections' }, page.sections.map((s) => h('a', { href: `#standouts.${league}`, onclick: (ev: Event) => { ev.preventDefault(); document.getElementById(`standouts-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }, s.label))),
    ...sections,
    page.notes.length ? h('section', { class: 'section' }, h('h2', null, 'Notes'), h('ul', { class: 'notes' }, page.notes.map((n) => h('li', null, n)))) : null,
    h('p', { class: 'src' }, `Refreshed weekly: this page is rebuilt for the week of ${fmtDate(page.generatedWeek)} from the figures on file. New research is added through the research log (see Methodology).`),
  )
  return { el, dispose: () => undefined }
}
