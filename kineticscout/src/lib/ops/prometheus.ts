/**
 * Prometheus text exposition format (version 0.0.4), gauges only.
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 *
 * Kept free of server imports so it can be unit tested on its own.
 */

export type GaugeSample = { labels?: Record<string, string>; value: number }
export type Gauge = { name: string; help: string; samples: GaugeSample[] }

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8'

const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function escapeHelp(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN'
  if (value === Infinity) return '+Inf'
  if (value === -Infinity) return '-Inf'
  return String(value)
}

export function formatPrometheus(gauges: Gauge[]): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const gauge of gauges) {
    if (!METRIC_NAME.test(gauge.name)) throw new Error(`Invalid metric name: ${gauge.name}`)
    if (seen.has(gauge.name)) throw new Error(`Duplicate metric: ${gauge.name}`)
    seen.add(gauge.name)
    lines.push(`# HELP ${gauge.name} ${escapeHelp(gauge.help)}`, `# TYPE ${gauge.name} gauge`)
    for (const sample of gauge.samples) {
      const labels = Object.entries(sample.labels ?? {})
      for (const [name] of labels) if (!LABEL_NAME.test(name) || name.startsWith('__')) throw new Error(`Invalid label name: ${name}`)
      const labelText = labels.length ? `{${labels.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',')}}` : ''
      lines.push(`${gauge.name}${labelText} ${formatValue(sample.value)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/** Seconds since a timestamp, or 0 when there is nothing waiting (so "oldest age" alerts stay quiet). */
export function ageSeconds(since: Date | null | undefined, now: Date): number {
  return since ? Math.max(0, Math.round((now.getTime() - since.getTime()) / 1000)) : 0
}
