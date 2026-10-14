import type { Athlete, GearItem, Hotspot, MetricKey, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { GEAR_INFO } from '../../data/gear-catalog'
import { formatMetric, METRICS } from '../../data/metrics'
import { resolveMetric, seasonByYear } from '../../data/resolve'
import { getAthlete } from '../../data/roster'
import { gradeHistory, gradesFor, overall, pitchGrades, type Overall } from '../../grades/grades'
import { outliers } from '../../standouts/engine'
import { MOTIONS, motionsFor, signatureMotion, type MotionId } from '../../stage/motion-library'
import { ShowcaseStage } from '../../stage/showcase'
import { heatGradientCss } from '../../three/palette'
import { lineChart } from '../charts'
import { gradeTile, metricRow, mixBar, qualityChip, selectField, sourceCite, tierOf } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h, toast } from '../dom'
import { keySixStrip } from '../key6'
import { STATUS_LABEL } from '../rail'
import { athleteColor, onSettings, settings } from '../settings'
import { bodyTab, injuriesTab } from './athlete-body'
import { compareTab } from './athlete-compare'
import { labTab, replayTab } from './athlete-lab'
import { mediaTab, thenNowTab } from './athlete-media'
import { showroomTab } from './athlete-showroom'

export type AthleteTab = 'overview' | 'showroom' | 'movement' | 'metrics' | 'maps' | 'career' | 'gear' | 'injuries' | 'compare' | 'media'

/** Tabs in the order the brief sets: summary first, then the 3D showroom, then the detail. */
export const TABS: { id: AthleteTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'showroom', label: 'Showroom' },
  { id: 'movement', label: 'Movement' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'maps', label: 'Maps' },
  { id: 'career', label: 'Career' },
  { id: 'gear', label: 'Gear' },
  { id: 'injuries', label: 'Injuries' },
  { id: 'compare', label: 'Compare' },
  { id: 'media', label: 'Media' },
]

/** Old tab ids from shared links, mapped to where that content lives now. */
export const LEGACY_TABS: Record<string, AthleteTab> = { thennow: 'career', body: 'maps', lab: 'movement', replay: 'movement', grades: 'metrics' }

export function tabFor(id: string | undefined): AthleteTab {
  if (!id) return 'overview'
  if (TABS.some((t) => t.id === id)) return id as AthleteTab
  return LEGACY_TABS[id] ?? 'overview'
}

/** Shared state handed to each tab. */
export interface AthleteScope {
  athlete: Athlete
  ctx: AppContext
  stage: ShowcaseStage
  /**
   * Rebuild the stage: a motion, optionally a ghost on the same spot (the biomech overlay), a
   * camera heading, and optionally a partner on their own spot for a matched split screen.
   */
  setStage(motion: MotionId, ghost?: { athlete: Athlete; color: number }, viewYaw?: number, partner?: Athlete): ShowcaseStage
  motion: MotionId
  /** Cleanup registered by the active tab. */
  onLeave(fn: () => void): void
  /**
   * Rebuild the figure from the athlete with `override` applied (e.g. an appearance edit), keeping
   * the current motion. `scope.athlete` stays the stored profile; the override is cosmetic.
   */
  rebuild(override?: Partial<Athlete>): void
}

export function athleteView(ctx: AppContext, id: string, tab: AthleteTab, arg?: string): View {
  const athlete = getAthlete(id)
  if (!athlete) {
    return { el: h('div', { class: 'section' }, h('h1', null, 'Athlete not found'), h('p', null, 'This athlete is not on the roster. Custom and imported athletes live in the browser that made them.'), h('a', { href: '#roster' }, 'Back to the athletes')) }
  }
  const leave: (() => void)[] = []
  let motion: MotionId = signatureMotion(athlete)
  let shown: Athlete = athlete
  let lastGhost: { athlete: Athlete; color: number } | undefined
  let lastYaw: number | undefined
  let lastPartner: Athlete | undefined
  const scope: AthleteScope = {
    athlete,
    ctx,
    stage: null as unknown as ShowcaseStage,
    motion,
    setStage(m, ghost, viewYaw, partner) {
      motion = m
      scope.motion = m
      lastGhost = ghost
      lastYaw = viewYaw
      lastPartner = partner
      const stage = new ShowcaseStage(ctx.viewer.scene, shown, m, ghost, viewYaw, partner)
      ctx.viewer.setEnvironment(['bench', 'squat', 'deadlift', 'clean'].includes(m) ? 'gym' : 'studio')
      ctx.viewer.setController(stage)
      scope.stage = stage
      ctx.hud.bind(stage, {
        transport: true,
        record: true,
        ar: () => void import('../../three/ar').then((m2) => m2.openAR(ctx.viewer, athlete, scope.stage.rig.gearSnapshot())),
        extra: [motionSelect()],
      })
      addNameLabel(partner)
      return stage
    },
    onLeave(fn) {
      leave.push(fn)
    },
    rebuild(override) {
      shown = override ? { ...athlete, ...override } : athlete
      scope.setStage(motion, lastGhost, lastYaw, lastPartner)
    },
  }

  const motionSelect = () =>
    h(
      'select',
      {
        id: 'motion-select',
        'aria-label': 'Motion',
        style: { background: 'var(--surface)' },
        onchange: (e: Event) => {
          const m = (e.target as HTMLSelectElement).value as MotionId
          scope.motion = m
          motion = m
          scope.stage.setMotion(m)
          ctx.viewer.setEnvironment(['bench', 'squat', 'deadlift', 'clean'].includes(m) ? 'gym' : 'studio')
          ctx.hud.bind(scope.stage, { transport: true, record: true, ar: () => void import('../../three/ar').then((m2) => m2.openAR(ctx.viewer, athlete, scope.stage.rig.gearSnapshot())), extra: [motionSelect()] })
        },
      },
      motionsFor(athlete).map((m) => h('option', { value: m, selected: m === motion }, MOTIONS[m].label)),
    )

  const addNameLabel = (partner?: Athlete) => {
    const label = (a: Athlete) => `${a.name}${a.kit.number ? ` #${a.kit.number}` : ''}`
    ctx.viewer.addLabel(
      'name',
      h('div', { style: { '--swatch': athleteColor(0) } }, label(athlete)),
      (out) => {
        scope.stage.rig.jointWorld('head', out)
        out.y += 0.38
        return out
      },
      partner ? 0 : undefined,
    )
    if (partner) {
      ctx.viewer.addLabel(
        'partner',
        h('div', { style: { '--swatch': athleteColor(1) } }, label(partner)),
        (out) => {
          const p = scope.stage.partner
          if (!p) return null
          p.jointWorld('head', out)
          out.y += 0.38
          return out
        },
        1,
      )
    }
  }

  if (tab !== 'showroom' && tab !== 'movement') scope.setStage(motion)

  const o = overall(athlete)
  const header = athleteHeader(athlete, o)
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Athlete sections' })
  const body = h('div', { class: 'section', role: 'tabpanel', id: 'athlete-tabpanel', tabindex: '-1' })

  const renderTabs = (active: AthleteTab) => {
    tabsEl.replaceChildren(
      ...TABS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `tab-${t.id}`,
            'aria-selected': String(t.id === active),
            'aria-controls': 'athlete-tabpanel',
            tabindex: t.id === active ? '0' : '-1',
            onclick: () => ctx.navigate(`#a.${athlete.id}.${t.id}`),
            onkeydown: (e: KeyboardEvent) => {
              const i = TABS.findIndex((x) => x.id === active)
              let next: (typeof TABS)[number] | undefined
              if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length]
              else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length]
              else if (e.key === 'Home') next = TABS[0]
              else if (e.key === 'End') next = TABS[TABS.length - 1]
              if (!next) return
              e.preventDefault()
              const target = next
              ctx.navigate(`#a.${athlete.id}.${target.id}`)
              requestAnimationFrame(() => document.getElementById(`tab-${target.id}`)?.focus())
            },
          },
          t.label,
        ),
      ),
    )
    body.setAttribute('aria-labelledby', `tab-${active}`)
  }

  renderTabs(tab)
  const content = (() => {
    switch (tab) {
      case 'showroom':
        return showroomTab(scope, arg)
      case 'movement':
        return movementTab(scope)
      case 'metrics':
        return metricsTab(scope)
      case 'maps':
        return bodyTab(scope)
      case 'career':
        return careerTab(scope)
      case 'gear':
        return gearTab(scope)
      case 'injuries':
        return injuriesTab(scope)
      case 'compare':
        return compareTab(scope, arg)
      case 'media':
        return mediaTab(scope)
      default:
        return overviewTab(scope, o)
    }
  })()
  body.append(content)

  const el = h('div', { class: 'stack athlete-view', style: { gap: '14px' } }, header, keySixStrip(athlete), tabsEl, body)
  return {
    el,
    dispose() {
      leave.forEach((fn) => fn())
    },
  }
}

function athleteHeader(a: Athlete, o: Overall): HTMLElement {
  const tier = tierOf(o.value)
  const badge = o.enough
    ? h('div', { class: `ovr ${tier.cls}`, role: 'img', 'aria-label': `Overall ${o.value}, ${tier.label}` }, h('small', null, 'OVR'), h('b', null, o.value), h('small', null, tier.label.toUpperCase()))
    : h(
        'div',
        { class: 'ovr ovr-none', role: 'img', 'aria-label': 'No overall: not enough measured data', title: `Only ${Math.round(o.coverage * 100)}% of the overall's weight rests on measured grades; it needs ${Math.round(40)}% before a number is shown.` },
        h('small', null, 'OVR'),
        h('b', null, '—'),
        h('small', null, 'NOT ENOUGH DATA'),
      )
  const number = a.kit.number ? ` · #${a.kit.number}` : ''
  return h(
    'header',
    { class: 'athlete-head' },
    badge,
    h(
      'div',
      { class: 'meta' },
      h(
        'div',
        { class: 'tags' },
        h('span', { class: 'tag league' }, a.league),
        h('span', { class: 'tag' }, a.positionGroup === 'TWP' ? 'Two-way' : a.position),
        h('span', { class: 'tag' }, STATUS_LABEL[a.status] ?? a.status),
        a.era ? h('span', { class: 'tag' }, a.era) : null,
        h('span', { class: `tag p-${a.profile}`, title: a.profile === 'standout' ? 'Built from sourced standout figures only; default kit and motion.' : a.profile === 'roster' ? 'Imported roster row.' : 'Researched profile.' }, a.profile === 'full' ? 'Full profile' : a.profile === 'standout' ? 'Standout profile' : 'Roster row'),
        a.custom ? h('span', { class: 'tag' }, 'Custom build') : null,
        o.enough ? qualityChip(o.quality, 'The overall label follows the share of weight on each kind of input.') : null,
      ),
      h('h1', null, a.name),
      h('p', null, `${a.team}${number}`, ' · ', h('span', { class: 'swatch', style: { background: a.kit.primary }, title: 'Kit primary' }), ' ', h('span', { class: 'swatch', style: { background: a.kit.secondary }, title: 'Kit secondary' })),
      h('p', { class: 'muted summary' }, a.summary),
    ),
  )
}

/** Summary first: why this athlete stands out, the grade profile, and what the overall rests on. */
function overviewTab(scope: AthleteScope, o: Overall): HTMLElement {
  const a = scope.athlete
  const why = outliers(a)
  const ranked = (Object.entries(a.metrics) as [MetricKey, NonNullable<Athlete['metrics'][MetricKey]>][]).filter(([, m]) => m.rank && m.quality !== 'SIMULATED')
  const seen = new Set(why.map((w) => w.metric))
  const sourced = (Object.values(a.metrics) as NonNullable<Athlete['metrics'][MetricKey]>[]).filter((m) => m.sourceId)
  const count = (q: Quality) => sourced.filter((m) => m.quality === q).length

  const whyCard = (title: string, value: string, quality: Quality, lines: (HTMLElement | string | null)[]) =>
    h('article', { class: 'why-card' }, h('div', { class: 'why-top' }, h('span', { class: 'why-label' }, title), qualityChip(quality)), h('div', { class: 'why-value' }, value), ...lines.filter(Boolean).map((l) => (typeof l === 'string' ? h('p', null, l) : l!)))

  const cards = [
    ...why.map((w) =>
      whyCard(w.label, w.display, w.quality, [
        w.why,
        `${w.percentile}th percentile of ${a.positionGroup} norms `,
        h('span', { class: 'src' }, 'Percentile ', qualityChip(w.percentileQuality, 'Position norms are approximate.')),
        w.sourceRank ? h('p', { class: 'quote' }, `“${w.sourceRank}”`) : null,
        sourceCite(a, w.sourceId, w.asOf),
      ]),
    ),
    ...ranked
      .filter(([k]) => !seen.has(k))
      .map(([k, m]) => whyCard(METRICS[k].label, formatMetric(k, m.value), m.quality, [h('p', { class: 'quote' }, `“${m.rank}”`), sourceCite(a, m.sourceId, m.asOf)])),
  ]

  const rows = [...o.weights].sort((x, y) => y.weight - x.weight)
  const chart = h(
    'div',
    { class: 'gbar-list', role: 'list', 'aria-label': 'Grade profile, ordered by weight in the overall' },
    rows.map((r) =>
      h(
        'div',
        { class: `gbar${r.measured ? '' : ' gbar-none'}`, role: 'listitem', 'aria-label': `${r.label}: ${r.measured ? r.value : 'no data'}, weight ${Math.round(r.weight * 100)} percent` },
        h('span', { class: 'gbar-label' }, r.label),
        h('span', { class: 'gbar-track' }, h('span', { class: 'gbar-fill', style: { width: `${r.measured ? r.value : 0}%` } })),
        h('span', { class: 'gbar-num' }, r.measured ? String(r.value) : '—'),
        r.measured ? qualityChip(r.quality) : h('span', { class: 'src' }, 'no data'),
      ),
    ),
  )

  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Why they stand out'), h('span', { class: 'src' }, `${count('VERIFIED')} verified · ${count('ESTIMATED')} estimated figures on file`)),
      cards.length ? h('div', { class: 'why-grid' }, cards) : h('p', { class: 'muted' }, 'Nothing on file reaches the 95th percentile of the position norms, and no source ranks a figure. That can change as figures are added.'),
    ),
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Grade profile'), h('span', { class: 'src' }, 'Ordered by weight in the overall. Hatched: no data, so no grade.')),
      chart,
    ),
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'What the overall rests on'), h('span', { class: 'src' }, `Profile reviewed ${fmtDate(a.reviewed)}`)),
      mixBar(o.mix),
      h('p', { class: 'src' }, `${Math.round(o.coverage * 100)}% of the weight rests on grades with measured inputs.${o.enough ? '' : ' That is below the 40% needed to show an overall, so none is shown.'}`),
      h('p', { class: 'src mono' }, o.formula),
    ),
    h(
      'div',
      { class: 'row' },
      h('a', { class: 'btn primary', href: `#a.${a.id}.showroom` }, 'Open the showroom'),
      h('a', { class: 'btn ghost', href: `#a.${a.id}.compare` }, 'Compare'),
      h('a', { class: 'btn ghost', href: `#events.${a.league}` }, `${a.league} versus events`),
      h('a', { class: 'btn ghost', href: '#standouts' }, 'Standouts'),
    ),
  )
}

/** Every grade with its inputs, the pitch arsenal, and the measured figures with their sources. */
function metricsTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const grades = gradesFor(a)
  const shared = grades.filter((g) => g.group === 'Shared')
  const sport = grades.filter((g) => g.group !== 'Shared')
  const pg = pitchGrades(a)
  const keyMetrics = (Object.entries(a.metrics) as [MetricKey, NonNullable<Athlete['metrics'][MetricKey]>][]).filter(([, m]) => m.quality !== 'SIMULATED')
  const simulated = (Object.entries(a.metrics) as [MetricKey, NonNullable<Athlete['metrics'][MetricKey]>][]).filter(([, m]) => m.quality === 'SIMULATED')
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h('section', { class: 'section' }, h('h2', null, 'Athletic grades'), h('p', { class: 'src' }, 'Hover or focus a grade for its formula, inputs, sources and percentile.'), h('div', { class: 'grades', style: { position: 'relative' } }, shared.map((g) => gradeTile(g, a)))),
    h('section', { class: 'section' }, h('h2', null, `${a.league} grades`), h('div', { class: 'grades', style: { position: 'relative' } }, sport.map((g) => gradeTile(g, a)))),
    pg.length
      ? h(
          'section',
          { class: 'section' },
          h('h2', null, 'Pitch grades'),
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('thead', null, h('tr', null, h('th', null, 'Pitch'), h('th', { class: 'n' }, 'Grade'), h('th', { class: 'n' }, 'Velo'), h('th', { class: 'n' }, 'Usage'), h('th', null, 'Data'))),
              h(
                'tbody',
                null,
                pg.map((p, i) => {
                  const pitch = a.pitches![i]!
                  return h('tr', { title: p.formula }, h('td', null, p.type), h('td', { class: 'n' }, h('span', { class: 'rank' }, p.value)), h('td', { class: 'n' }, `${pitch.velocityMph.value.toFixed(1)} mph`), h('td', { class: 'n' }, `${pitch.usagePct.value}%`), h('td', null, qualityChip(p.quality)))
                }),
              ),
            ),
          ),
          h('p', { class: 'src' }, 'Grade = 72 + 9 × (half velocity z + half movement z) against MLB norms for each pitch type.'),
        )
      : null,
    h('section', { class: 'section' }, h('h2', null, 'Measured and sourced'), keyMetrics.length ? h('div', { class: 'list' }, keyMetrics.map(([k, m]) => metricRow(a, k, m))) : h('p', { class: 'muted' }, 'No sourced figures on file yet.')),
    simulated.length ? h('section', { class: 'section' }, h('h2', null, 'Simulated placeholders'), h('p', { class: 'src' }, 'Demo values with no public source. They feed simulations only and are labelled everywhere they appear.'), h('div', { class: 'list' }, simulated.map(([k, m]) => metricRow(a, k, m)))) : null,
  )
}

/** Then versus now, the grade history and the season lines. */
function careerTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const grades = gradesFor(a)
  const history = gradeHistory(a)
  const historyIds = (a.league === 'NFL' ? ['speed', 'elusiveness', 'durability'] : a.league === 'MLB' ? ['power', 'contact', 'durability'] : ['threePoint', 'midRange', 'durability']).filter((id) => grades.some((g) => g.id === id))
  const xLabels = history.map((p) => ({ x: p.year, label: p.season }))
  const chart =
    history.length > 1
      ? lineChart(
          [
            { label: 'Overall', color: 'var(--ink)', points: history.map((p) => ({ x: p.year, y: p.overall, quality: p.quality, label: p.season })) },
            ...historyIds.map((id, i) => ({
              label: grades.find((g) => g.id === id)!.label,
              color: athleteColor(i),
              dashed: i % 2 === 1,
              points: history.map((p) => ({ x: p.year, y: p.grades[id] ?? 0, label: p.season, quality: (gradesFor(a, p.year).find((g) => g.id === id)?.quality ?? 'SIMULATED') as Quality })),
            })),
          ],
          { title: `${a.name} grade history by season`, xLabels, yMin: 40, yMax: 100 },
        )
      : h('p', { class: 'muted' }, history.length === 1 ? 'One season on file; history appears once there are two.' : 'No season lines on file.')
  const seasons = [...a.seasons].sort((x, y) => y.year - x.year)
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h('section', { class: 'section' }, h('h2', null, 'Grade history'), chart),
    seasons.length
      ? h(
          'section',
          { class: 'section' },
          h('h2', null, 'Season lines'),
          h(
            'div',
            { class: 'list' },
            seasons.map((s) =>
              h(
                'div',
                null,
                h(
                  'div',
                  { class: 'grow stack', style: { gap: '2px' } },
                  h('strong', null, `${s.season} · ${s.team}`),
                  h('span', { class: 'src' }, (Object.entries(s.metrics) as [MetricKey, NonNullable<Athlete['metrics'][MetricKey]>][]).map(([k, m]) => `${METRICS[k].label} ${formatMetric(k, m.value)} (${m.quality.toLowerCase()})`).join(' · ') || 'No figures'),
                ),
              ),
            ),
          ),
        )
      : null,
    a.seasons.length > 1 ? thenNowTab(scope) : null,
  )
}

/** Motion: the signature movement profile, the biomechanics lab and the replay tools. */
function movementTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const sig = a.movement
  const row = (label: string, value: string) => h('div', null, h('span', { class: 'grow' }, label), h('span', { class: 'num' }, value))
  const profile = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Signature motion profile'), qualityChip(sig.quality, sig.basis)),
    h('p', { class: 'src' }, sig.basis),
    h(
      'div',
      { class: 'list' },
      row('Stride length', `${sig.run.strideLengthM.toFixed(2)} m`),
      row('Cadence', `${sig.run.cadenceSpm} steps/min`),
      row('Lean at top speed', `${sig.run.leanDeg}°`),
      row('Arm swing', `${sig.run.armSwingDeg}°`),
      row('Knee drive', `${sig.run.kneeDriveDeg}°`),
      row('Throwing arm slot', `${sig.throw.armSlotDeg}°`),
      row('Hip-shoulder separation', `${sig.throw.hipShoulderSeparationDeg}°`),
      row('Jump takeoff', sig.jump.takeoff),
    ),
    h('p', { class: 'src' }, `Run: ${sig.run.style} Throw: ${sig.throw.style}`),
  )
  const lab = labTab(scope)
  return h('div', { class: 'stack', style: { gap: '22px' } }, profile, lab, h('section', { class: 'section' }, h('h2', null, 'Replay tools'), replayTab(scope)))
}

function gearTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const rig = () => scope.stage.rig
  let heatTarget: 'off' | 'all' | string = 'off'
  const legend = h('div', { class: 'legend' })
  const hotspotList = h('div', { class: 'list' })

  const drawLegend = () => {
    const stops = heatGradientCss(settings().heatPalette)
    legend.replaceChildren(h('span', null, 'Low'), h('span', { class: 'ramp', 'aria-hidden': 'true' }, stops.map((c) => h('span', { style: { background: c } }))), h('span', null, 'High use or stress'))
  }

  const applyHeat = () => {
    const items = heatTarget === 'all' ? a.gear.filter((g) => rig().isWorn(g.id)) : a.gear.filter((g) => g.id === heatTarget)
    if (heatTarget === 'off') {
      rig().setHeatmap(null)
      hotspotList.replaceChildren(h('div', { class: 'muted' }, 'Pick an item, or all worn gear, to paint where it gets used and stressed.'))
      return
    }
    const hotspots: Hotspot[] = items.flatMap((g) => g.use.hotspots)
    rig().setHeatmap(hotspots, settings().heatPalette, new Set(items.map((g) => g.id)))
    hotspotList.replaceChildren(
      ...items.flatMap((g) => [
        h('div', null, h('div', { class: 'grow stack', style: { gap: '2px' } }, h('strong', null, `${g.name} · used ${g.use.usagePct}% of the time`), h('span', { class: 'src' }, g.use.note)), qualityChip(g.use.quality)),
        ...g.use.hotspots.map((hs) => h('div', null, h('span', { class: 'grow' }, hs.label), h('span', { class: 'num mono' }, `${Math.round(hs.intensity * 100)}`))),
      ]),
    )
    if (!hotspots.length) hotspotList.append(h('div', { class: 'muted' }, 'No wear points recorded for this item.'))
  }

  const off = onSettings(() => {
    drawLegend()
    applyHeat()
  })
  scope.onLeave(() => {
    off()
    rig().setHeatmap(null)
  })

  const heatSelect = selectField(
    'heat-target',
    'Gear use map',
    [{ value: 'off', label: 'Off' }, { value: 'all', label: 'All worn gear' }, ...a.gear.map((g) => ({ value: g.id, label: g.name }))],
    'off',
    (v) => {
      heatTarget = v
      applyHeat()
    },
  )

  const itemRow = (g: GearItem) => {
    const info = GEAR_INFO[g.slot]
    const worn = h('input', {
      type: 'checkbox',
      id: `wear-${g.id}`,
      checked: rig().isWorn(g.id),
      onchange: (e: Event) => {
        rig().setGear(g.id, { worn: (e.target as HTMLInputElement).checked })
        applyHeat()
        toast((e.target as HTMLInputElement).checked ? `${g.name} on` : `${g.name} off`)
      },
    })
    const variant = g.variants
      ? h(
          'select',
          {
            id: `variant-${g.id}`,
            'aria-label': `${g.name} style`,
            onchange: (e: Event) => {
              rig().setGear(g.id, { variant: (e.target as HTMLSelectElement).value, worn: true })
              ;(worn as HTMLInputElement).checked = true
              applyHeat()
            },
          },
          g.variants.map((v) => h('option', { value: v.id, selected: v.id === rig().variantOf(g.id) }, v.label)),
        )
      : null
    return h(
      'div',
      { class: 'gear-item' },
      h('span', { class: 'swatch', style: { background: g.color, width: '18px', height: '18px' }, 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'stack', style: { gap: '4px' } },
        h('div', { class: 'tags' }, h('strong', null, g.name), h('span', { class: 'tag' }, info.category), qualityChip(g.quality)),
        h('span', { class: 'src' }, g.description),
        h('span', { class: 'why' }, h('strong', null, 'Why it matters: '), info.why),
        h('span', { class: 'src' }, `Basis: ${g.basis}`),
        variant,
      ),
      h('label', { class: 'toggle', for: `wear-${g.id}` }, worn, 'Worn'),
    )
  }

  drawLegend()
  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'p',
      { class: 'note' },
      h('strong', null, 'Generic kit. '),
      'Team colors only; no logos or wordmarks are drawn. The model is a neutral mannequin sized from height, weight, wingspan and body fat, not a likeness.',
    ),
    h('section', { class: 'section' }, h('h2', null, 'Gear profile'), h('div', { class: 'list' }, a.gear.map((g) => h('div', null, itemRow(g))))),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Gear use map'), legend), h('div', { class: 'row' }, heatSelect), hotspotList, h('p', { class: 'src' }, 'Intensities are relative (0 to 100) and simulated from how the position uses each item, unless marked otherwise. Palette in Settings.')),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Gear history'),
      h(
        'ol',
        { class: 'timeline' },
        a.gearHistory.map((gh) => h('li', null, h('div', { class: 'tags' }, h('strong', null, gh.season), qualityChip(gh.quality)), gh.changes.map((c) => h('span', null, c)))),
      ),
    ),
  )
  applyHeat()
  return el
}

/** Copy of an athlete with a past season's body figures, for the then-vs-now ghost. */
export function athleteAtSeason(a: Athlete, year: number): Athlete {
  const season = seasonByYear(a, year)
  if (!season) return a
  return { ...a, id: `${a.id}@${year}`, metrics: { ...a.metrics, ...season.metrics } }
}

/** Every metric that differs between two seasons, with the weaker of the two labels. */
export function seasonDiffs(a: Athlete, from: number, to: number): { key: MetricKey; then: number; now: number; quality: Quality }[] {
  const keys = new Set<MetricKey>([...Object.keys(seasonByYear(a, from)?.metrics ?? {}), ...Object.keys(seasonByYear(a, to)?.metrics ?? {})] as MetricKey[])
  const out: { key: MetricKey; then: number; now: number; quality: Quality }[] = []
  for (const key of keys) {
    const t = resolveMetric(a, key, from)
    const n = resolveMetric(a, key, to)
    if (!t || !n || t.value === n.value) continue
    out.push({ key, then: t.value, now: n.value, quality: weakest(t.quality, n.quality) })
  }
  return out.sort((x, y) => METRICS[x.key].group.localeCompare(METRICS[y.key].group))
}

export function fmt(key: MetricKey, v: number): string {
  return formatMetric(key, v)
}

