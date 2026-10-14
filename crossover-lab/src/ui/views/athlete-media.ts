import type { MediaItem } from '../../data/types'
import { PROVIDERS } from '../../data/media'
import { gradesFor, overall } from '../../grades/grades'
import { METRICS } from '../../data/metrics'
import { qualityChip } from '../components'
import { fmtDate, h, toast } from '../dom'
import { athleteColor } from '../settings'
import { athleteAtSeason, fmt, seasonDiffs, type AthleteScope } from './athlete'

/** Reference photos the viewer adds. Kept as object URLs in this tab only; never uploaded. */
interface LocalPhoto {
  url: string
  name: string
  season: string
}

const localPhotos = new Map<string, LocalPhoto[]>()

function photosFor(id: string): LocalPhoto[] {
  let list = localPhotos.get(id)
  if (!list) {
    list = []
    localPhotos.set(id, list)
  }
  return list
}

const KIND_LABEL: Record<MediaItem['kind'], string> = { photo: 'Photo', video: 'Video', page: 'Page', article: 'Article' }

function mediaRow(item: MediaItem): HTMLElement {
  const provider = item.delivery === 'licensed-api' ? PROVIDERS.find((p) => p.id === 'getty') : undefined
  const locked = item.delivery === 'licensed-api' && !provider?.configured
  return h(
    'div',
    null,
    h('span', { class: 'tag', style: { minWidth: '62px', textAlign: 'center' } }, KIND_LABEL[item.kind]),
    h(
      'div',
      { class: 'grow stack', style: { gap: '2px' } },
      h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.title),
      h('span', { class: 'src' }, `${item.source} · ${item.dateKind === 'published' ? 'published' : 'checked'} ${fmtDate(item.date)}${item.season ? ` · season ${item.season}` : ''}`),
      locked ? h('span', { class: 'src' }, 'Licensed source: thumbnails appear here once an API key and licence are configured. The link opens the provider’s own page.') : null,
    ),
  )
}

export function mediaTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const photos = photosFor(a.id)
  const seasons = [...a.seasons.map((s) => s.season), 'Current']
  const gallery = h('div', { class: 'thennow' })
  const drawGallery = () => {
    gallery.replaceChildren(
      ...(photos.length
        ? photos.map((p, i) =>
            h(
              'figure',
              { class: 'stack', style: { margin: '0', gap: '4px' } },
              h('div', { class: 'photo-slot' }, h('img', { src: p.url, alt: `Reference photo ${i + 1}: ${p.name}` })),
              h(
                'select',
                {
                  id: `photo-season-${i}`,
                  'aria-label': `Season for ${p.name}`,
                  onchange: (e: Event) => {
                    p.season = (e.target as HTMLSelectElement).value
                  },
                },
                seasons.map((s) => h('option', { value: s, selected: s === p.season }, s)),
              ),
            ),
          )
        : [h('p', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'No reference photos added in this tab yet.')]),
    )
  }
  const input = h('input', {
    type: 'file',
    id: 'reference-photos',
    accept: 'image/*',
    multiple: true,
    onchange: (e: Event) => {
      const files = [...((e.target as HTMLInputElement).files ?? [])]
      for (const f of files) photos.push({ url: URL.createObjectURL(f), name: f.name, season: 'Current' })
      drawGallery()
      toast(`${files.length} photo${files.length === 1 ? '' : 's'} added to this tab`)
    },
  })
  drawGallery()
  const groups = (['video', 'photo', 'article', 'page'] as const).map((kind) => [kind, a.media.filter((m) => m.kind === kind)] as const).filter(([, list]) => list.length)
  return h(
    'div',
    { class: 'stack', style: { gap: '22px' } },
    h('p', { class: 'note' }, h('strong', null, 'Licensed or linked, never copied. '), 'Each item cites its source and date. Official pages open in a new tab; licensed photo and video providers switch on with an API key.'),
    ...groups.map(([kind, list]) => h('section', { class: 'section' }, h('h2', null, `${KIND_LABEL[kind]}s`), h('div', { class: 'list' }, list.map(mediaRow)))),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Media providers'),
      h(
        'div',
        { class: 'list' },
        PROVIDERS.map((p) => h('div', null, h('div', { class: 'grow stack', style: { gap: '2px' } }, h('strong', null, p.label), h('span', { class: 'src' }, p.note)), h('span', { class: 'tag' }, p.configured ? 'Connected' : 'Not connected'))),
      ),
    ),
    h(
      'section',
      { class: 'section' },
      h('h2', null, 'Your reference photos'),
      h('p', { class: 'muted' }, 'Add photos you have the right to use, tag each with a season, and compare them in Then vs now. They stay in this browser tab and are never uploaded or saved.'),
      h('div', { class: 'field' }, h('label', { for: 'reference-photos' }, 'Add photos'), input),
      gallery,
    ),
  )
}

export function thenNowTab(scope: AthleteScope): HTMLElement {
  const a = scope.athlete
  const seasons = [...a.seasons].sort((x, y) => x.year - y.year)
  if (seasons.length < 2) return h('p', { class: 'muted' }, 'Then vs now needs at least two seasons on file.')
  const nowSeason = seasons[seasons.length - 1]!
  let thenIndex = 0
  const out = h('div', { class: 'stack', style: { gap: '22px' } })
  const slider = h('input', {
    type: 'range',
    id: 'then-season',
    min: '0',
    max: String(seasons.length - 2),
    step: '1',
    value: '0',
    'aria-valuetext': seasons[0]!.season,
    oninput: (e: Event) => {
      thenIndex = Number((e.target as HTMLInputElement).value)
      ;(e.target as HTMLInputElement).setAttribute('aria-valuetext', seasons[thenIndex]!.season)
      draw()
    },
  })
  const body = h('div', { class: 'stack', style: { gap: '22px' } })

  const slot = (season: string, year: number) => {
    const local = photosFor(a.id).find((p) => p.season === season)
    if (local) return h('div', { class: 'photo-slot' }, h('img', { src: local.url, alt: `${a.name}, ${season} (your photo)` }))
    const linked = a.media.find((m) => m.season === season || (m.season && Number(m.season.slice(0, 4)) === year))
    return h(
      'div',
      { class: 'photo-slot' },
      h(
        'div',
        { class: 'stack', style: { gap: '6px', alignItems: 'center' } },
        h('strong', null, season),
        linked ? h('a', { href: linked.url, target: '_blank', rel: 'noopener noreferrer' }, `${linked.title} (${linked.source})`) : h('span', null, 'No licensed photo for this season.'),
        h('span', null, 'Add one tagged ', h('strong', null, season), ' in Media.'),
      ),
    )
  }

  const draw = () => {
    const then = seasons[thenIndex]!
    const diffs = seasonDiffs(a, then.year, nowSeason.year)
    const gThen = gradesFor(a, then.year)
    const gNow = gradesFor(a, nowSeason.year)
    const oThen = overall(a, gThen)
    const oNow = overall(a, gNow)
    const gradeMoves = gNow
      .map((g) => ({ g, before: gThen.find((x) => x.id === g.id) }))
      .filter((x) => x.before && x.before.value !== x.g.value)
      .sort((x, y) => Math.abs(y.g.value - y.before!.value) - Math.abs(x.g.value - x.before!.value))
      .slice(0, 6)
    const ghost = athleteAtSeason(a, then.year)
    scope.setStage(scope.motion, { athlete: ghost, color: 0x8eabff })
    scope.ctx.viewer.addLabel('then', h('div', { style: { '--swatch': athleteColor(1) } }, `Ghost: ${then.season} body`), (o) => {
      scope.stage.ghost?.jointWorld('hips', o)
      o.y += 0.1
      o.x += 0.5
      return o
    })
    body.replaceChildren(
      h('div', { class: 'thennow' }, h('div', { class: 'stack', style: { gap: '4px' } }, h('span', { class: 'eyebrow' }, 'Then'), slot(then.season, then.year)), h('div', { class: 'stack', style: { gap: '4px' } }, h('span', { class: 'eyebrow' }, 'Now'), slot(nowSeason.season, nowSeason.year))),
      h(
        'section',
        { class: 'section' },
        h('h2', null, `What changed, ${then.season} to ${nowSeason.season}`),
        h(
          'div',
          { class: 'diffs' },
          h('div', { class: 'diff' }, h('strong', null, 'Overall grade'), h('span', { class: 'num' }, oThen.value), h('span', { class: `num delta ${oNow.value >= oThen.value ? 'up' : 'down'}` }, `${oNow.value >= oThen.value ? '+' : ''}${oNow.value - oThen.value} → ${oNow.value}`), qualityChip(oNow.quality)),
          ...diffs.map((d) => {
            const better = METRICS[d.key].higherIsBetter ? d.now > d.then : d.now < d.then
            return h('div', { class: 'diff' }, h('span', null, METRICS[d.key].label), h('span', { class: 'num' }, fmt(d.key, d.then)), h('span', { class: `num delta ${better ? 'up' : 'down'}` }, `→ ${fmt(d.key, d.now)}`), qualityChip(d.quality))
          }),
          diffs.length === 0 ? h('p', { class: 'muted' }, 'No season-specific figures differ.') : null,
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Biggest grade moves'),
        h(
          'div',
          { class: 'diffs' },
          gradeMoves.map((m) => h('div', { class: 'diff' }, h('span', null, m.g.label), h('span', { class: 'num' }, m.before!.value), h('span', { class: `num delta ${m.g.value > m.before!.value ? 'up' : 'down'}` }, `→ ${m.g.value}`), qualityChip(m.g.quality))),
        ),
      ),
      h(
        'section',
        { class: 'section' },
        h('h2', null, 'Build, gear and mechanics'),
        h(
          'ul',
          { class: 'list' },
          h('li', null, h('span', { class: 'grow' }, 'The ghost on the stage carries the ', h('strong', null, then.season), ' weight and body fat; the solid model is ', h('strong', null, nowSeason.season), '.'), qualityChip(diffs.some((d) => d.key === 'weightLb' || d.key === 'bodyFatPct') ? 'SIMULATED' : 'ESTIMATED')),
          h('li', null, h('span', { class: 'grow' }, `Gear: ${a.gearHistory.map((g) => `${g.season}: ${g.changes.join(' ')}`).join(' ')}`), qualityChip(a.gearHistory[a.gearHistory.length - 1]?.quality ?? 'SIMULATED')),
          h('li', null, h('span', { class: 'grow' }, `Mechanics: one movement signature on file (${a.movement.run.style.toLowerCase()}). Season-by-season tracking data would show form changes here.`), qualityChip(a.movement.quality)),
        ),
      ),
    )
  }

  out.append(
    h(
      'div',
      { class: 'field' },
      h('label', { for: 'then-season' }, 'Then season'),
      slider,
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, seasons.slice(0, -1).map((s) => h('span', { class: 'src' }, s.season))),
    ),
    body,
  )
  draw()
  return out
}
