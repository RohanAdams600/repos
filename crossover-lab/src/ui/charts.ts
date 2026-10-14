import type { Quality } from '../data/types'
import { h, s } from './dom'

export interface Series {
  label: string
  color: string
  dashed?: boolean
  points: { x: number; y: number; quality?: Quality; label?: string }[]
}

export interface LineChartOptions {
  width?: number
  height?: number
  yMin?: number
  yMax?: number
  xLabels?: { x: number; label: string }[]
  yUnit?: string
  title: string
  yTicks?: number
}

/**
 * Line chart drawn to scale with one x and one y scale. Point shape encodes data quality:
 * filled circle VERIFIED, hollow circle ESTIMATED, hollow diamond SIMULATED.
 */
export function lineChart(series: Series[], opts: LineChartOptions): HTMLElement {
  const W = opts.width ?? 520
  const H = opts.height ?? 220
  const pad = { l: 40, r: 14, t: 12, b: 28 }
  const xs = series.flatMap((se) => se.points.map((p) => p.x))
  const ys = series.flatMap((se) => se.points.map((p) => p.y))
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = opts.yMin ?? Math.floor(Math.min(...ys) - 2)
  const yMax = opts.yMax ?? Math.ceil(Math.max(...ys) + 2)
  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r)
  const sy = (y: number) => H - pad.b - ((y - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b)
  const ticks = opts.yTicks ?? 4
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title })
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + ((yMax - yMin) * i) / ticks
    const y = sy(v)
    svg.append(s('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }), s('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, Number.isInteger(v) ? v : v.toFixed(1)))
  }
  for (const xl of opts.xLabels ?? []) svg.append(s('text', { x: sx(xl.x), y: H - 8, 'text-anchor': 'middle' }, xl.label))
  for (const se of series) {
    const d = se.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
    svg.append(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2.5, 'stroke-dasharray': se.dashed ? '6 4' : null, 'stroke-linejoin': 'round' }))
    se.points.forEach((p, i) => {
      const x = sx(p.x)
      const y = sy(p.y)
      const last = i === se.points.length - 1
      const r = last ? 5 : 3.5
      const q = p.quality ?? 'VERIFIED'
      const title = s('title', null, `${se.label}${p.label ? ` ${p.label}` : ''}: ${p.y}${opts.yUnit ?? ''} (${q.toLowerCase()})`)
      if (q === 'SIMULATED') svg.append(s('path', { d: `M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z`, fill: 'var(--surface)', stroke: se.color, 'stroke-width': 2 }, title))
      else svg.append(s('circle', { cx: x, cy: y, r, fill: q === 'VERIFIED' ? se.color : 'var(--surface)', stroke: se.color, 'stroke-width': 2 }, title))
      if (last) svg.append(s('text', { x: x - 4, y: y - 9, 'text-anchor': 'end', style: 'font-weight:700' }, String(p.y)))
    })
  }
  const legend = h(
    'div',
    { class: 'series-legend' },
    series.map((se) => h('span', null, h('i', { class: se.dashed ? 'dash' : '', style: { '--c': se.color } }), se.label)),
    h('span', { class: 'muted' }, '● verified  ○ estimated  ◇ simulated'),
  )
  return h('div', { class: 'stack', style: { gap: '6px' } }, svg, legend)
}

export interface Bar {
  label: string
  value: number
  display: string
  color?: string
  quality?: Quality
}

export function barChart(bars: Bar[], max?: number): HTMLElement {
  const top = max ?? Math.max(...bars.map((b) => b.value), 1)
  return h(
    'div',
    { class: 'bars' },
    bars.map((b) =>
      h(
        'div',
        { class: 'bar-row' },
        h('span', null, b.label),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: `${Math.max(0, Math.min(100, (b.value / top) * 100))}%`, background: b.color ?? 'var(--ink)' } })),
        h('span', { class: 'num mono' }, b.display),
      ),
    ),
  )
}
