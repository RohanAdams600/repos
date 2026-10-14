import type { Athlete, Measured, MetricKey, Quality } from '../../data/types'
import { weakest } from '../../data/types'
import { formatMetric, METRICS } from '../../data/metrics'
import { resolveMetric } from '../../data/resolve'
import { allAthletes, getAthlete } from '../../data/roster'
import { gradesFor, overall, type Grade } from '../../grades/grades'
import { qualityChip } from '../components'
import { h } from '../dom'
import { keySix } from '../key6'
import { athleteColor } from '../settings'
import type { AthleteScope } from './athlete'

/**
 * Compare: two athletes in one table, the Key 6 of both, the overall and the grades they share,
 * with the difference labelled by the weaker of the two inputs. Same league by default; another
 * league shows only what the two sports have in common.
 */
export interface CompareRow {
  label: string
  a?: { value: number; text: string; quality: Quality }
  b?: { value: number; text: string; quality: Quality }
  /** Positive when A is better. */
  edge?: number
  higherIsBetter: boolean
}

export function metricRows(a: Athlete, b: Athlete): CompareRow[] {
  const keys: MetricKey[] = []
  for (const k of [...keySix(a), ...keySix(b), 'heightIn', 'weightLb'] as MetricKey[]) if (!keys.includes(k)) keys.push(k)
  return keys.map((k) => {
    const ma = resolveMetric(a, k)
    const mb = resolveMetric(b, k)
    const hib = METRICS[k].higherIsBetter
    const cell = (m: Measured | undefined) => (m ? { value: m.value, text: formatMetric(k, m.value).replace(/ \(.*\)$/, ''), quality: m.quality } : undefined)
    return { label: METRICS[k].label, a: cell(ma), b: cell(mb), higherIsBetter: hib, ...(ma && mb ? { edge: hib ? ma.value - mb.value : mb.value - ma.value } : {}) }
  })
}

export function gradeRows(a: Athlete, b: Athlete): CompareRow[] {
  const ga = gradesFor(a)
  const gb = gradesFor(b)
  const out: CompareRow[] = []
  for (const g of ga) {
    const other = gb.find((x) => x.id === g.id)
    if (!other) continue
    const cell = (x: Grade) => (x.measured ? { value: x.value, text: String(x.value), quality: x.quality } : undefined)
    const ca = cell(g)
    const cb = cell(other)
    out.push({ label: `${g.label} grade`, a: ca, b: cb, higherIsBetter: true, ...(ca && cb ? { edge: ca.value - cb.value } : {}) })
  }
  return out
}

export function compareTab(scope: AthleteScope, otherId?: string): HTMLElement {
  const a = scope.athlete
  let anyLeague = false
  const pool = () =>
    allAthletes()
      .filter((x) => x.id !== a.id && (anyLeague || x.league === a.league))
      .sort((x, y) => x.name.localeCompare(y.name))
  let b: Athlete | undefined = (otherId ? getAthlete(otherId) : undefined) ?? pool()[0]
  const out = h('div', { class: 'stack', style: { gap: '18px' } })

  const draw = () => {
    if (!b) {
      out.replaceChildren(h('p', { class: 'muted' }, 'Nobody else on file to compare with.'))
      return
    }
    const other = b
    const oa = overall(a)
    const ob = overall(other)
    const rows: CompareRow[] = [
      {
        label: 'Overall',
        ...(oa.enough ? { a: { value: oa.value, text: String(oa.value), quality: oa.quality } } : {}),
        ...(ob.enough ? { b: { value: ob.value, text: String(ob.value), quality: ob.quality } } : {}),
        higherIsBetter: true,
        ...(oa.enough && ob.enough ? { edge: oa.value - ob.value } : {}),
      },
      ...metricRows(a, other),
      ...(a.league === other.league ? gradeRows(a, other) : gradeRows(a, other).filter((r) => !/three-point|power|throw/i.test(r.label))),
    ]
    const cell = (c: CompareRow['a']) => (c ? h('td', { class: 'n' }, c.text, ' ', qualityChip(c.quality)) : h('td', { class: 'n muted' }, '—'))
    const edgeCell = (r: CompareRow) => {
      if (r.edge === undefined || !r.a || !r.b) return h('td', { class: 'muted' }, 'n/a')
      const q = weakest(r.a.quality, r.b.quality)
      const who = Math.abs(r.edge) < 1e-9 ? 'Even' : r.edge > 0 ? a.name.split(' ').slice(-1)[0] : other.name.split(' ').slice(-1)[0]
      return h('td', null, who, ' ', qualityChip(q, 'The edge is only as solid as the weaker of the two figures.'))
    }
    const parts: (HTMLElement | null)[] = [
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data compare' },
          h('caption', { class: 'sr-only' }, `${a.name} compared with ${other.name}`),
          h('thead', null, h('tr', null, h('th', null, 'Measure'), h('th', { class: 'n', style: { borderTop: `3px solid ${athleteColor(0)}` } }, a.name), h('th', { class: 'n', style: { borderTop: `3px solid ${athleteColor(1)}` } }, other.name), h('th', null, 'Edge'))),
          h('tbody', null, rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.label), cell(r.a), cell(r.b), edgeCell(r)))),
        ),
      ),
      a.league !== other.league ? h('p', { class: 'note' }, h('strong', null, 'Different sports. '), 'Only measures both leagues take are compared; sport skills are left out because they are graded against different norms.') : null,
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn primary', href: `#a.${a.id}.showroom.${other.id}` }, 'Side by side in the showroom'),
        a.league === other.league ? h('a', { class: 'btn ghost', href: `#events.${a.league}..${a.id},${other.id}` }, `${a.league} versus events`) : h('a', { class: 'btn ghost', href: '#versus' }, 'Cross-sport head-to-head'),
        h('a', { class: 'btn ghost', href: `#a.${other.id}.overview` }, `Open ${other.name}`),
      ),
    ]
    out.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null))
  }

  const select = h(
    'select',
    {
      id: 'compare-with',
      onchange: (e: Event) => {
        b = getAthlete((e.target as HTMLSelectElement).value)
        draw()
      },
    },
  )
  const fill = () => select.replaceChildren(...pool().map((x) => h('option', { value: x.id, selected: x.id === b?.id }, `${x.name} (${x.league}, ${x.position})`)))
  const anyToggle = h('input', {
    type: 'checkbox',
    id: 'compare-any',
    onchange: (e: Event) => {
      anyLeague = (e.target as HTMLInputElement).checked
      if (b && !anyLeague && b.league !== a.league) b = pool()[0]
      fill()
      draw()
    },
  })
  fill()
  draw()
  return h(
    'section',
    { class: 'section' },
    h('h2', null, 'Compare'),
    h('div', { class: 'row' }, h('label', { class: 'field', for: 'compare-with' }, h('span', { class: 'label' }, 'Compare with'), select), h('label', { class: 'toggle', for: 'compare-any' }, anyToggle, 'Any league')),
    out,
  )
}
