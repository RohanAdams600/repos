import type { Athlete, Measured, MetricKey, Quality } from '../data/types'
import { formatMetric, METRICS } from '../data/metrics'
import type { Grade, Overall } from '../grades/grades'
import { fmtDate, h } from './dom'

export const QUALITY_TEXT: Record<Quality, string> = {
  VERIFIED: 'Checked against the cited public source on the date shown.',
  ESTIMATED: 'Derived from verified figures by a stated formula, or sources disagree (see note).',
  SIMULATED: 'No public source. A demo value until a licensed data feed is connected.',
}

export function qualityChip(q: Quality, extra?: string): HTMLElement {
  return h('span', { class: `q q-${q}`, title: extra ? `${QUALITY_TEXT[q]} ${extra}` : QUALITY_TEXT[q] }, q)
}

export function sourceCite(a: Athlete, sourceId: string | undefined, asOf?: string): HTMLElement | null {
  if (!sourceId) return asOf ? h('span', { class: 'src' }, `As of ${fmtDate(asOf)}`) : null
  const src = a.sources[sourceId]
  if (!src) return null
  const date = src.published ? `published ${fmtDate(src.published)}` : `checked ${fmtDate(src.retrieved)}`
  return h(
    'span',
    { class: 'src' },
    src.url ? h('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer' }, src.publisher) : src.publisher,
    `, ${date}`,
    asOf ? ` · value as of ${fmtDate(asOf)}` : '',
  )
}

export function metricRow(a: Athlete, key: MetricKey, m: Measured): HTMLElement {
  return h(
    'div',
    null,
    h('div', { class: 'grow stack', style: { gap: '2px' } }, h('div', null, h('strong', null, METRICS[key].label), ' ', h('span', { class: 'num' }, formatMetric(key, m.value))), m.note ? h('span', { class: 'src' }, m.note) : null, sourceCite(a, m.sourceId, m.asOf)),
    qualityChip(m.quality),
  )
}

export function tierOf(value: number): { label: string; cls: string } {
  if (value >= 90) return { label: 'Elite', cls: 'tier-elite' }
  if (value >= 80) return { label: 'Gold', cls: 'tier-gold' }
  if (value >= 70) return { label: 'Silver', cls: 'tier-silver' }
  return { label: 'Bronze', cls: 'tier-bronze' }
}

let openPop: HTMLElement | null = null

function closePop(): void {
  openPop?.remove()
  openPop = null
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePop()
})
document.addEventListener('click', (e) => {
  if (openPop && !(e.target as Element).closest('.grade, .pop')) closePop()
})

/** Grade tile. Hover, focus or tap shows the formula, inputs, sources and percentile. */
export function gradeTile(g: Grade, a: Athlete): HTMLElement {
  const tier = tierOf(g.value)
  const tile = h(
    'button',
    { class: `grade ${tier.cls}`, type: 'button', 'aria-label': `${g.label} ${g.value}, ${tier.label}, ${g.quality.toLowerCase()} data. Show formula.` },
    h('span', { class: 'val' }, g.value),
    h('span', { class: 'name' }, g.label),
    h('span', { class: 'sub' }, qualityChip(g.quality), h('span', { class: 'num' }, `${g.percentile}th pct`)),
  )
  const show = () => {
    closePop()
    const pop = h(
      'div',
      { class: 'pop', role: 'tooltip' },
      h('div', { class: 'section-head' }, h('strong', null, `${g.label}: ${g.value}`), qualityChip(g.quality)),
      h('div', { class: 'formula' }, g.formula),
      g.terms.length
        ? h(
            'table',
            null,
            h(
              'tbody',
              null,
              g.terms.map((t) =>
                h(
                  'tr',
                  null,
                  h('td', null, t.label),
                  h('td', { class: 'num' }, Number.isInteger(t.value) ? t.value : t.value.toFixed(t.value < 1 ? 3 : 2)),
                  h('td', { class: 'num' }, `z ${t.z >= 0 ? '+' : ''}${t.z.toFixed(2)}`),
                  h('td', null, qualityChip(t.quality)),
                ),
              ),
            ),
          )
        : null,
      ...g.terms.filter((t) => t.sourceId).map((t) => sourceCite(a, t.sourceId)),
      h('div', null, `Position-adjusted percentile: ${g.percentile} among ${g.normGroup} `, qualityChip(g.percentileQuality, 'Norms are approximate.')),
    )
    tile.after(pop)
    const rect = tile.getBoundingClientRect()
    const parent = (tile.offsetParent as HTMLElement | null) ?? document.body
    const pr = parent.getBoundingClientRect()
    pop.style.left = `${Math.max(0, Math.min(rect.left - pr.left, pr.width - pop.offsetWidth))}px`
    pop.style.top = `${rect.bottom - pr.top + 6}px`
    openPop = pop
  }
  tile.addEventListener('mouseenter', show)
  tile.addEventListener('focus', show)
  tile.addEventListener('click', show)
  tile.addEventListener('mouseleave', () => {
    if (document.activeElement !== tile) closePop()
  })
  tile.addEventListener('blur', closePop)
  return tile
}

export function mixBar(mix: Overall['mix']): HTMLElement {
  const pct = (q: Quality) => Math.round(mix[q] * 100)
  return h(
    'div',
    { class: 'stack', style: { gap: '4px' } },
    h('div', { class: 'mix', role: 'img', 'aria-label': `Data behind the overall: ${pct('VERIFIED')}% verified, ${pct('ESTIMATED')}% estimated, ${pct('SIMULATED')}% simulated.` }, (['VERIFIED', 'ESTIMATED', 'SIMULATED'] as Quality[]).map((q) => h('span', { class: `m-${q}`, style: { width: `${mix[q] * 100}%` } }))),
    h('div', { class: 'tags', style: { gap: '10px' } }, (['VERIFIED', 'ESTIMATED', 'SIMULATED'] as Quality[]).map((q) => h('span', { class: 'src' }, qualityChip(q), ` ${pct(q)}%`))),
  )
}

export function seg<T extends string>(options: { value: T; label: string }[], current: T, onChange: (v: T) => void, label: string): HTMLElement {
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label })
  const render = (cur: T) => {
    el.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(o.value === cur),
            onclick: () => {
              render(o.value)
              onChange(o.value)
            },
          },
          o.label,
        ),
      ),
    )
  }
  render(current)
  return el
}

export function selectField<T extends string>(id: string, label: string, options: { value: T; label: string }[], current: T, onChange: (v: T) => void): HTMLElement {
  const select = h('select', { id, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) }, options.map((o) => h('option', { value: o.value, selected: o.value === current }, o.label)))
  return h('div', { class: 'field' }, h('label', { for: id }, label), select)
}
