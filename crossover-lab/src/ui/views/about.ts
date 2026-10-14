import { BUILT_IN } from '../../data/roster'
import { PROVIDERS } from '../../data/media'
import { GRADE_BASE, GRADE_SPREAD, OVERALL_STRETCH } from '../../grades/grades'
import { LineupStage } from '../../stage/lineup'
import { qualityChip, QUALITY_TEXT } from '../components'
import type { AppContext, View } from '../context'
import { fmtDate, h } from '../dom'

export function aboutView(ctx: AppContext): View {
  const stage = new LineupStage(ctx.viewer.scene, [...BUILT_IN], () => 'tpose', 1.9)
  ctx.viewer.setEnvironment('studio')
  ctx.viewer.setController(stage)
  ctx.hud.bind(stage, { presets: ['broadcast', 'behind', 'overhead'] })

  const counts = { VERIFIED: 0, ESTIMATED: 0, SIMULATED: 0 }
  for (const a of BUILT_IN) {
    for (const m of Object.values(a.metrics)) counts[m.quality]++
    for (const s of a.seasons) for (const m of Object.values(s.metrics)) counts[m.quality]++
  }

  const el = h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h('div', { class: 'stack', style: { gap: '6px' } }, h('span', { class: 'eyebrow' }, 'Data and licensing'), h('h1', null, 'Where every number comes from')),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Three labels'),
      h(
        'div',
        { class: 'list' },
        (['VERIFIED', 'ESTIMATED', 'SIMULATED'] as const).map((q) => h('div', null, qualityChip(q), h('span', { class: 'grow' }, QUALITY_TEXT[q]), h('span', { class: 'num mono' }, `${counts[q]} figures`))),
      ),
      h('p', { class: 'src' }, 'Counts cover the three demo profiles. A grade or result takes the weakest label among its inputs. Shapes and glyphs (✓ ≈ ◇) carry the label as well as color.'),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'How grades work'),
      h('p', null, `Each grade averages z-scores against position norms and maps them to the 0 to 99 scale with ${GRADE_BASE} + ${GRADE_SPREAD} × z, so a typical pro sits in the low 70s. The overall is a position-weighted average of grades, stretched by ${OVERALL_STRETCH} around ${GRADE_BASE} the way game ratings are. Hover or focus any grade to see its formula, inputs and sources.`),
      h('p', { class: 'src' }, 'Position norms are approximations written for the demo and always shown as ESTIMATED. Replace them with licensed norm tables before publishing grades.'),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Sources'),
      ...BUILT_IN.map((a) =>
        h(
          'details',
          null,
          h('summary', null, h('strong', null, a.name), ` · ${Object.keys(a.sources).length} sources · reviewed ${fmtDate(a.reviewed)}`),
          h(
            'ul',
            { class: 'list', style: { marginTop: '8px' } },
            Object.values(a.sources).map((s) => h('li', null, h('div', { class: 'grow stack', style: { gap: '2px' } }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title) : h('span', null, s.title), h('span', { class: 'src' }, `${s.publisher}${s.published ? ` · published ${fmtDate(s.published)}` : ''} · checked ${fmtDate(s.retrieved)}`)))),
          ),
        ),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Licensing'),
      h(
        'ul',
        { class: 'list' },
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Kits: '), 'generic team colors and numbers only. No logos, wordmarks or helmet decals are drawn.')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Likeness: '), 'every athlete is the same neutral mannequin, sized from public measurements. Commercial use of player names and statistics in a product like this normally needs group licensing from each players association (NFLPA, MLBPA, NBPA).')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Media: '), 'official pages are linked, never copied. Licensed providers switch on with keys: ', PROVIDERS.filter((p) => p.kind === 'licensed-api').map((p) => p.label).join(', '), '.')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Reference photos: '), 'photos supplied with the brief were used to describe the kit and carry style. They are not stored or shown in the app. Photos you add on the Media tab stay in your browser tab.')),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Built for'),
      h(
        'ul',
        { class: 'list' },
        h('li', null, h('span', { class: 'grow' }, h('strong', null, '60 fps: '), 'one shared WebGL renderer, one shadow-casting light, and resolution that drops when frames run long and recovers when they do not. Turn on the frame-rate readout in Settings.')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Keyboard: '), 'every control is reachable with Tab; replays and cameras have shortcuts (press ?).')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Captions: '), 'each phase of a motion and each pitch or shot is captioned on the stage and announced to screen readers.')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Color: '), 'athlete colors and heat maps come from color-blind-safe palettes, with a grayscale option and a high-contrast mode.')),
        h('li', null, h('span', { class: 'grow' }, h('strong', null, 'Adding athletes: '), 'one data file per athlete in src/data/athletes; every page picks it up. See the README for the full roster plan.')),
      ),
    ),
  )
  return { el }
}
