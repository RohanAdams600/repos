import { allAthletes, BUILT_IN, importedAthletes, STANDOUTS } from '../../data/roster'
import { RESEARCH, RESEARCH_RETRIEVED } from '../../data/standouts/research'
import type { Athlete, League, Measured, Quality } from '../../data/types'
import { GRADE_BASE, GRADE_SPREAD, gradeFromZ, gradesFor, overall, OVERALL_MIN_COVERAGE, OVERALL_STRETCH } from '../../grades/grades'
import { GROUP_LABEL, normFor } from '../../grades/norms'
import { DEFAULT_MIN_SAMPLE, HIDDEN_GEM_MIN_ATHLETICISM, OUTLIER_Z, SECTION_CAP, SECTION_IDS, sectionLabel, weekOf } from '../../standouts/engine'
import { LineupStage } from '../../stage/lineup'
import { qualityChip } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h, type Child } from '../dom'
import { reducedMotion } from '../settings'

/**
 * Methodology: one page on where every number comes from and how it is labelled. Counts are
 * computed from the roster at runtime and the constants are read from the modules that use
 * them, so the page cannot drift from the code it describes.
 */

const LEAGUES: League[] = ['NFL', 'MLB', 'NBA']
const QUALITIES: Quality[] = ['VERIFIED', 'ESTIMATED', 'SIMULATED']

const DEFINITION: Record<Quality, string> = {
  VERIFIED: 'Measured, and cited to the official source or to two independent publishers that state the same figure for the same event or season. The publisher, link and date are shown with it.',
  ESTIMATED: 'Derived by a stated formula, approximate, or from a single source (or from sources that disagree; the note says how).',
  SIMULATED: 'Model output, or a default that stands in where nothing is on file.',
}

const TOC: { id: string; title: string }[] = [
  { id: 'labels', title: 'Three labels' },
  { id: 'grades', title: 'How grades work' },
  { id: 'percentiles', title: 'Percentiles and ranks' },
  { id: 'standouts', title: 'The standouts engine' },
  { id: 'sources', title: 'Data sources and licensing' },
  { id: 'figure', title: 'The 3D figure' },
  { id: 'sims', title: 'Simulations and controlled randomness' },
  { id: 'legal', title: 'Legal' },
]

const pct = (x: number) => `${Math.round(x * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Every measured figure on a profile, current and by season. */
function figures(a: Athlete): Measured[] {
  const out: Measured[] = [...Object.values(a.metrics)]
  for (const s of a.seasons) {
    out.push(...Object.values(s.metrics))
    if (s.games) out.push(s.games)
  }
  return out
}

/** League of a norm group, read from its label ("NFL running backs"). */
function groupLeague(group: string): League | undefined {
  const first = GROUP_LABEL[group]?.split(' ')[0]
  return LEAGUES.find((l) => l === first)
}

/**
 * Overall weights per position group, read through overall() itself: a built-in athlete of the
 * group's league has every grade, so the rows are the group's full weight table.
 */
function weightTable(): { group: string; label: string; rows: { label: string; share: number }[] }[] {
  const out: { group: string; label: string; rows: { label: string; share: number }[] }[] = []
  for (const [group, label] of Object.entries(GROUP_LABEL)) {
    const league = groupLeague(group)
    const template = BUILT_IN.find((a) => a.league === league)
    if (!template) continue
    const weights = overall({ ...template, positionGroup: group }).weights
    const total = weights.reduce((s, w) => s + w.weight, 0) || 1
    out.push({ group, label, rows: [...weights].sort((x, y) => y.weight - x.weight).map((w) => ({ label: w.label, share: w.weight / total })) })
  }
  return out
}

export function methodologyView(ctx: AppContext): View {
  const stage = new LineupStage(ctx.viewer.scene, [...BUILT_IN], () => 'tpose', 1.9)
  ctx.viewer.setEnvironment('studio')
  ctx.viewer.setController(stage)
  ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'] })

  // What is on file, counted now.
  const athletes = allAthletes()
  const byLeague = LEAGUES.map((l) => `${athletes.filter((a) => a.league === l).length} ${l}`).join(', ')
  const custom = athletes.filter((a) => a.custom).length
  const imported = importedAthletes().length
  const counts: Record<Quality, number> = { VERIFIED: 0, ESTIMATED: 0, SIMULATED: 0 }
  const publishers = new Map<string, number>()
  const urls = new Set<string>()
  for (const a of athletes) {
    for (const m of figures(a)) {
      counts[m.quality]++
      const pub = m.sourceId ? a.sources[m.sourceId]?.publisher : undefined
      if (pub) publishers.set(pub, (publishers.get(pub) ?? 0) + 1)
    }
    for (const s of Object.values(a.sources)) if (s.url) urls.add(s.url)
  }
  const topPublishers = [...publishers].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 10)
  const enough = athletes.filter((a) => overall(a, gradesFor(a)).enough).length
  const scans = athletes.filter((a) => a.appearance?.scan).length
  const facts = RESEARCH.flatMap((r) => r.facts)
  const factCounts: Record<Quality, number> = { VERIFIED: 0, ESTIMATED: 0, SIMULATED: 0 }
  for (const f of facts) factCounts[f.quality]++
  const week = weekOf(new Date())

  // Worked example: a hypothetical receiver one spread better than the 40 norm.
  const wrForty = normFor('WR', 'NFL', 'fortyS')

  const jump = (id: string) => {
    const target = document.getElementById(`method-${id}`)
    if (!target) return
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
  }

  const section = (id: string, title: string, ...children: Child[]) => h('section', { class: 'section', 'aria-labelledby': `method-${id}` }, h('h2', { id: `method-${id}`, tabindex: '-1' }, title), ...children)
  const item = (...children: Child[]) => h('li', null, h('span', { class: 'grow' }, ...children))

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'div',
      { class: 'stack', style: { gap: '8px' } },
      h('span', { class: 'eyebrow' }, 'Methodology'),
      h('h1', null, 'How Crossover Lab works'),
      h('p', { class: 'muted' }, 'Where every number comes from, how it is labelled, how grades, percentiles and standouts are worked out, and what the 3D figure and the simulations can and cannot tell you.'),
    ),
    h(
      'nav',
      { class: 'card', 'aria-labelledby': 'method-toc' },
      h('h2', { id: 'method-toc', class: 'eyebrow' }, 'On this page'),
      h(
        'ol',
        { class: 'stack', style: { gap: '6px', margin: '0', 'padding-left': '1.4em' } },
        TOC.map((s) =>
          h(
            'li',
            null,
            h(
              'a',
              {
                href: `#method-${s.id}`,
                // The app routes on the hash, so in-page links scroll instead of navigating.
                onclick: (e: Event) => {
                  e.preventDefault()
                  jump(s.id)
                },
              },
              s.title,
            ),
          ),
        ),
      ),
    ),

    section(
      'labels',
      'Three labels',
      h('p', null, 'Every number in the app carries one of three labels. Each has its own glyph and border style as well as its colour, so the label never depends on colour alone.'),
      h(
        'ul',
        { class: 'list' },
        QUALITIES.map((q) => h('li', null, qualityChip(q), h('span', { class: 'grow' }, DEFINITION[q]), h('span', { class: 'num mono', style: { 'white-space': 'nowrap' } }, plural(counts[q], 'figure')))),
      ),
      h('p', null, 'A result is only as good as its weakest input, so it takes the weakest label among them. Estimated or simulated values are never shown as verified: a formula on verified inputs is ESTIMATED at best, and anything decided by random draws is SIMULATED.'),
      h('p', { class: 'src' }, `Counts cover every figure on the ${plural(athletes.length, 'profile')} on file in this browser, current and by season.`),
    ),

    section(
      'grades',
      'How grades work',
      h(
        'p',
        null,
        `Each grade, from 1 to 99, is a weighted average of z-scores. A z-score says how many spreads a figure sits from the norm for the athlete’s position group: z = (value − norm mean) ÷ norm spread, flipped where lower is better, such as sprint times. The grade is ${GRADE_BASE} + ${GRADE_SPREAD} × z, rounded and kept between 1 and 99, so a typical pro sits in the low 70s and three spreads above the norm reaches 99.`,
      ),
      wrForty
        ? h(
            'p',
            { class: 'note' },
            h('strong', null, 'Worked example. '),
            `The wide receiver norm for the 40 is ${wrForty.mean.toFixed(2)} s with a spread of ${wrForty.sd.toFixed(2)} s `,
            qualityChip('ESTIMATED', 'Norms are approximate.'),
            `. A hypothetical receiver who runs ${(wrForty.mean - wrForty.sd).toFixed(2)} s is one spread better than the norm, so z = 1.0 and the speed grade is ${GRADE_BASE} + ${GRADE_SPREAD} × 1.0 = ${gradeFromZ(1)}.`,
          )
        : null,
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Labels: '), 'a grade takes the weakest label among its inputs. When a grade has no input on file, the position baseline stands in and the grade is SIMULATED.'),
        item(h('strong', null, 'Position adjustments: '), 'a few grades add a fixed offset for a position, for example running backs sit well below the norm for pass rush and coverage.'),
        item(h('strong', null, 'Norm groups: '), `${Object.values(GROUP_LABEL).join(', ')}. Athletes in a group with no table of its own are compared with NFL running backs, MLB regulars or NBA guards.`),
        item(h('strong', null, 'Norms are approximate: '), 'they are pro-level means and spreads written for this app, labelled ', qualityChip('ESTIMATED'), ' wherever they surface, and are to be replaced with licensed norm tables before any grade is published as fact.'),
      ),
      h('h3', null, 'The overall grade'),
      h(
        'p',
        null,
        `The overall is a weighted average of the athlete’s grades, with weights set per position group. Averaging pulls everyone toward the middle, so the result is stretched back out the way game ratings are: overall = ${GRADE_BASE} + ${OVERALL_STRETCH} × (weighted average − ${GRADE_BASE}), kept between 1 and 99.`,
      ),
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Label: '), 'VERIFIED only when more than 80% of the weight rests on verified grades, SIMULATED as soon as 20% rests on simulated ones, and ESTIMATED otherwise. The bar under each overall shows the split.'),
        item(h('strong', null, 'Coverage: '), `the share of the weight resting on grades with real inputs rather than position baselines. Below ${pct(OVERALL_MIN_COVERAGE)} the app shows “not enough data” instead of an overall. Right now ${enough} of ${athletes.length} athletes on file clear that bar.`),
      ),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data' },
          h('caption', { class: 'src', style: { 'text-align': 'left', padding: '8px 10px' } }, 'Overall weights by position group: the app’s own judgement of what matters at each position, not a league formula. The four biggest shown.'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Position group'), h('th', { scope: 'col' }, 'Biggest weights'))),
          h(
            'tbody',
            null,
            weightTable().map((g) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row', style: { 'text-transform': 'none', 'letter-spacing': '0', 'font-size': 'inherit', color: 'var(--ink)', background: 'transparent' } }, g.label),
                h('td', null, g.rows.slice(0, 4).map((r) => `${r.label} ${pct(r.share)}`).join(', '), g.rows.length > 4 ? `, and ${g.rows.length - 4} more` : ''),
              ),
            ),
          ),
        ),
      ),
    ),

    section(
      'percentiles',
      'Percentiles and ranks',
      h('p', null, 'A percentile reads a z-score through the standard normal curve: the share of the position group expected to sit below the figure. Grade tiles round it. The standouts engine rounds it down and keeps it between 1 and 99, so the app never claims a 0th or 100th percentile and 95 or more always means an outlier.'),
      h('p', null, 'Because the norms are approximate, a percentile is ', qualityChip('ESTIMATED'), ' at best, even when the figure behind it is ', qualityChip('VERIFIED'), '. A percentile from a simulated grade is ', qualityChip('SIMULATED'), '.'),
      h('p', null, 'Ranks are different: they compare only the athletes on file and always say how many were compared, for example “2nd of 20 NFL athletes on file”. They are never presented as league-wide ranks.'),
    ),

    section(
      'standouts',
      'The standouts engine',
      h('p', null, `A weekly page per league built only from figures already on file. Nothing is drawn at random and nothing is invented: SIMULATED figures never compete. Sections: ${SECTION_IDS.map((id) => (id === 'arms' ? `${sectionLabel(id, 'NFL')} (${sectionLabel(id, 'NBA')} in the NBA)` : sectionLabel(id, 'NFL'))).join(', ')}. Each lists up to ${SECTION_CAP} athletes, each athlete once, on his best figure.`),
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Top-percentile outliers: '), `a figure at or above the 95th percentile of the athlete’s position norm (z ≥ ${OUTLIER_Z}) is flagged as an outlier; an athlete’s outliers are listed together, strongest first. Athletes are only rated against their own position group, never a league fallback.`),
        item(h('strong', null, 'Rare combinations: '), 'the athlete’s best speed figure and best size figure (weight, height or wingspan) both at or above the 95th percentile for the position, ranked by the weaker of the two. Rarest builds also ranks Speed Score in the NFL, wingspan minus height and standing reach in the NBA, and momentum at sprint speed in MLB.'),
        item(h('strong', null, 'Hidden gems: '), `an athleticism grade of ${HIDDEN_GEM_MIN_ATHLETICISM} or more together with low recognition: undrafted, a fourth-round or later pick, a practice-squad, two-way or ten-day contract, or no Pro Bowl or All-Star selections. Known Pro Bowlers and All-Stars, and Legends, are never hidden gems.`),
        item(h('strong', null, 'Rising and Most improved: '), 'the latest season against the one before, only when the latest ended last year or later.'),
        item(h('strong', null, 'Published rank wording: '), 'a source’s own wording, such as “NFL Scouting Combine record”, is quoted verbatim and only with its source and date. The app never writes its own record claims.'),
        item(h('strong', null, 'Small samples: '), `when fewer than ${DEFAULT_MIN_SAMPLE} athletes are compared, a note says the ranks are among a small sample.`),
      ),
      h('p', null, `Lists refresh weekly and show the week they were generated, named by the Monday that starts it. This week’s lists are for the week of ${fmtDate(week)}.`),
    ),

    section(
      'sources',
      'Data sources and licensing',
      h('p', null, 'Figures come from official and published sources: league combines such as the NFL Scouting Combine and NBA Draft Combine, league tracking data such as NFL Next Gen Stats, MLB Statcast and NBA tracking, and team and league sites. Each figure is cited on its own, with the publisher, a link and the date it was published or checked.'),
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'On file in this browser: '), `${plural(athletes.length, 'athlete')} (${byLeague}): ${plural(BUILT_IN.length, 'full researched profile')}, ${plural(STANDOUTS.length, 'standout profile')}, ${plural(imported, 'imported roster row')} and ${plural(custom, 'custom athlete')}. They cite ${plural(urls.size, 'distinct source link')}.`),
        item(
          h('strong', null, 'Standout research: '),
          `${plural(facts.length, 'figure')} for ${plural(RESEARCH.length, 'athlete')}, gathered by web research on ${fmtDate(RESEARCH_RETRIEVED)} and cross-checked by an independent second search: ${factCounts.VERIFIED} `,
          qualityChip('VERIFIED'),
          ` where two independent publishers agree, ${factCounts.ESTIMATED} `,
          qualityChip('ESTIMATED'),
          ' from one publisher or where publishers disagree. Figures a check found wrong are left out, as are minor-league, spring-training and college figures, which are not comparable with league numbers.',
        ),
        topPublishers.length ? item(h('strong', null, 'Most-cited publishers: '), topPublishers.map(([p, n]) => `${p} (${plural(n, 'figure')})`).join(', '), '.') : null,
      ),
      h('h3', null, 'Licensing'),
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Licensed media and data only. '), 'Official pages are linked, never copied. The app does not scrape or rehost copyrighted content; licensed feeds and media providers switch on only with the provider’s own key.'),
        item(h('strong', null, 'Roster imports are labelled by provider and licence. '), 'A row’s figures are VERIFIED only when the provider is licensed for this use and the row cites a source URL; otherwise they are ESTIMATED, with the provider named in the note. Imports stay in the browser that added them.'),
        item(h('strong', null, 'Branding. '), 'Kits use generic team colours and numbers. No logos, wordmarks or helmet decals are drawn.'),
      ),
    ),

    section(
      'figure',
      'The 3D figure',
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Sized from measurements: '), 'height, weight (for build), wingspan and body fat when they are on file, with neutral defaults where they are not.'),
        item(h('strong', null, 'Position morphs are artistic defaults: '), 'backs carry weight in the legs, linemen in the trunk, guards are long and lean. They change shape only, never the measured height, weight or wingspan.'),
        item(h('strong', null, 'Generic sculpted head: '), 'every figure shares a neutral sculpted face. It is not a scan or a likeness of anyone, and the app never generates photoreal faces of real people.'),
        item(h('strong', null, 'Licensed scans only: '), `a real likeness appears only through a rights-cleared scan supplied by the user, recorded with the licensor and licence reference, and shown with a “Licensed scan” badge. ${scans === 0 ? 'No licensed scans are on file.' : `${plural(scans, 'licensed scan')} on file.`}`),
        item(h('strong', null, 'Appearance: '), 'hair, skin tone and kit details follow reference photos when they have been supplied; without them the figure keeps a neutral studio finish, labelled ', qualityChip('SIMULATED'), '.'),
      ),
    ),

    section(
      'sims',
      'Simulations and controlled randomness',
      h(
        'ul',
        { class: 'list' },
        item(h('strong', null, 'Physics on measured inputs is ESTIMATED at best. '), 'A sprint curve solved from a measured 40, a dunk check from standing reach and vertical, or a throw from release speed all carry the model’s assumptions.'),
        item(h('strong', null, 'Outcomes decided by random draws are SIMULATED. '), 'Heats, at-bats, shootouts, possessions, brackets and ladder challenges.'),
        item(h('strong', null, 'Controlled randomness. '), 'Every simulation draws from a seeded generator, so the same seed replays the same result and a shared link shows everyone the same outcome. Change the seed to see another plausible result.'),
        item(h('strong', null, 'Model settings. '), 'Spreads, rates, thresholds and cross-sport penalties in the models are settings chosen for the app, not league statistics.'),
        item(h('strong', null, 'Size adjustments. '), 'Cross-sport comparisons can show a size-adjusted figure beside the raw one, such as strength scaled to a 200 lb athlete; every adjusted figure is ESTIMATED at best.'),
      ),
    ),

    section('legal', 'Legal', h('p', { class: 'note' }, h('strong', null, "Unofficial fan/analytics tool, not affiliated with the NFL, MLB, NBA, teams, or players' associations."))),
  )
  return { el }
}
