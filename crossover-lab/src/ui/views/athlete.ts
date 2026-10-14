import type { Athlete, GearItem, Hotspot, MetricKey, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { GEAR_INFO } from '../../data/gear-catalog'
import { formatMetric, METRICS } from '../../data/metrics'
import { resolveMetric, seasonByYear } from '../../data/resolve'
import { getAthlete } from '../../data/roster'
import { gradeHistory, gradesFor, overall, pitchGrades } from '../../grades/grades'
import { MOTIONS, motionsFor, signatureMotion, type MotionId } from '../../stage/motion-library'
import { ShowcaseStage } from '../../stage/showcase'
import { heatGradientCss } from '../../three/palette'
import { lineChart } from '../charts'
import { gradeTile, metricRow, mixBar, qualityChip, selectField, tierOf } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h, toast } from '../dom'
import { athleteColor, onSettings, settings } from '../settings'
import { bodyTab, injuriesTab } from './athlete-body'
import { labTab, replayTab } from './athlete-lab'
import { mediaTab, thenNowTab } from './athlete-media'

export type AthleteTab = 'overview' | 'gear' | 'media' | 'thennow' | 'body' | 'injuries' | 'lab' | 'replay'

export const TABS: { id: AthleteTab; label: string }[] = [
  { id: 'overview', label: 'Grades' },
  { id: 'gear', label: 'Gear' },
  { id: 'media', label: 'Media' },
  { id: 'thennow', label: 'Then vs now' },
  { id: 'body', label: 'Body' },
  { id: 'injuries', label: 'Injuries' },
  { id: 'lab', label: 'Biomech lab' },
  { id: 'replay', label: 'Replay' },
]

/** Shared state handed to each tab. */
export interface AthleteScope {
  athlete: Athlete
  ctx: AppContext
  stage: ShowcaseStage
  /** Rebuild the stage (for tabs that need a ghost or a different motion). */
  setStage(motion: MotionId, ghost?: { athlete: Athlete; color: number }, viewYaw?: number): ShowcaseStage
  motion: MotionId
  /** Cleanup registered by the active tab. */
  onLeave(fn: () => void): void
  /**
   * Rebuild the figure from the athlete with `override` applied (e.g. an appearance edit), keeping
   * the current motion. `scope.athlete` stays the stored profile; the override is cosmetic.
   */
  rebuild(override?: Partial<Athlete>): void
}

export function athleteView(ctx: AppContext, id: string, tab: AthleteTab): View {
  const athlete = getAthlete(id)
  if (!athlete) {
    return { el: h('div', { class: 'section' }, h('h1', null, 'Athlete not found'), h('p', null, 'This athlete is not on the roster. Custom athletes live in the browser that made them.'), h('a', { href: '#roster' }, 'Back to the roster')) }
  }
  const leave: (() => void)[] = []
  let motion: MotionId = signatureMotion(athlete)
  let shown: Athlete = athlete
  const scope: AthleteScope = {
    athlete,
    ctx,
    stage: null as unknown as ShowcaseStage,
    motion,
    setStage(m, ghost, viewYaw) {
      motion = m
      scope.motion = m
      const stage = new ShowcaseStage(ctx.viewer.scene, shown, m, ghost, viewYaw)
      ctx.viewer.setEnvironment(['bench', 'squat', 'deadlift', 'clean'].includes(m) ? 'gym' : 'studio')
      ctx.viewer.setController(stage)
      scope.stage = stage
      ctx.hud.bind(stage, {
        transport: true,
        record: true,
        ar: () => void import('../../three/ar').then((m2) => m2.openAR(ctx.viewer, athlete, scope.stage.rig.gearSnapshot())),
        extra: [motionSelect()],
      })
      addNameLabel()
      return stage
    },
    onLeave(fn) {
      leave.push(fn)
    },
    rebuild(override) {
      shown = override ? { ...athlete, ...override } : athlete
      scope.setStage(motion)
    },
  }

  const motionSelect = () => {
    const select = h(
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
    return select
  }

  const addNameLabel = () => {
    ctx.viewer.addLabel('name', h('div', { style: { '--swatch': athleteColor(0) } }, `${athlete.name} #${athlete.kit.number}`), (out) => {
      scope.stage.rig.jointWorld('head', out)
      out.y += 0.38
      return out
    })
  }

  scope.setStage(motion)

  const o = overall(athlete)
  const tier = tierOf(o.value)
  const header = h(
    'header',
    { class: 'athlete-head' },
    h('div', { class: 'ovr', role: 'img', 'aria-label': `Overall ${o.value}, ${tier.label}` }, h('small', null, 'OVR'), h('b', null, o.value), h('small', null, tier.label.toUpperCase())),
    h(
      'div',
      { class: 'meta' },
      h('div', { class: 'tags' }, h('span', { class: 'tag league' }, athlete.league), h('span', { class: 'tag' }, athlete.position), athlete.custom ? h('span', { class: 'tag' }, 'Custom build') : null, qualityChip(o.quality, 'Overall label follows the share of weight on each kind of input.')),
      h('h1', null, athlete.name),
      h('p', null, `${athlete.team} · #${athlete.kit.number}`, ' · ', h('span', { class: 'swatch', style: { background: athlete.kit.primary }, title: 'Kit primary' }), ' ', h('span', { class: 'swatch', style: { background: athlete.kit.secondary }, title: 'Kit secondary' })),
    ),
  )

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
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
                ctx.navigate(`#a.${athlete.id}.${next.id}`)
                requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus())
              }
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
      case 'gear':
        return gearTab(scope)
      case 'media':
        return mediaTab(scope)
      case 'thennow':
        return thenNowTab(scope)
      case 'body':
        return bodyTab(scope)
      case 'injuries':
        return injuriesTab(scope)
      case 'lab':
        return labTab(scope)
      case 'replay':
        return replayTab(scope)
      default:
        return overviewTab(scope)
    }
  })()
  body.append(content)

  const el = h('div', { class: 'stack', style: { gap: '18px' } }, header, h('p', { class: 'muted' }, athlete.summary), tabsEl, body)
  return {
    el,
    dispose() {
      leave.forEach((fn) => fn())
    },
  }
}

function overviewTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const grades = gradesFor(a)
  const o = overall(a, grades)
  const shared = grades.filter((g) => g.group === 'Shared')
  const sport = grades.filter((g) => g.group !== 'Shared')
  const history = gradeHistory(a)
  const pg = pitchGrades(a)

  const historyIds = (a.league === 'NFL' ? ['elusiveness', 'awareness', 'durability'] : a.league === 'MLB' ? ['power', 'contact', 'durability'] : ['threePoint', 'midRange', 'durability']).filter((id) => grades.some((g) => g.id === id))
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
      : h('p', { class: 'muted' }, 'One season on file; history appears once there are two.')

  const keyMetrics = (Object.entries(a.metrics) as [MetricKey, NonNullable<Athlete['metrics'][MetricKey]>][]).filter(([, m]) => m.quality !== 'SIMULATED')
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h(
      'section',
      { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'What the overall rests on'), h('span', { class: 'src' }, `Profile reviewed ${fmtDate(a.reviewed)}`)),
      mixBar(o.mix),
      h('p', { class: 'src mono' }, o.formula),
    ),
    h('section', { class: 'section' }, h('h2', null, 'Athletic grades'), h('div', { class: 'grades', style: { position: 'relative' } }, shared.map((g) => gradeTile(g, a)))),
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
    h('section', { class: 'section' }, h('h2', null, 'Grade history'), chart),
    h('section', { class: 'section' }, h('h2', null, 'Measured and sourced'), h('div', { class: 'list' }, keyMetrics.map(([k, m]) => metricRow(a, k, m)))),
  )
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

