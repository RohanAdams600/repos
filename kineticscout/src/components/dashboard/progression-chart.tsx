'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricType } from '@/generated/prisma/enums'
import { Alert } from '@/components/ui/alert'
import { Select } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { useMessages } from '@/i18n/client'
import { domainMessages } from '@/i18n/messages/domain'
import { metricsMessages } from '@/i18n/messages/metrics'
import { errorMessage, useTRPC } from '@/trpc/client'

/**
 * Single-series progression chart (Pro). One series, so the title names it and there is no legend.
 * Line and markers use the accent text token (volt on dark, onyx on light) so they clear contrast
 * in both themes; values are always available in the table below the chart.
 */
export function ProgressionChart({ metricTypes }: { metricTypes: MetricType[] }) {
  const trpc = useTRPC()
  const [metricType, setMetricType] = useState<MetricType>(metricTypes[0]!)
  const def = METRIC_DEFINITIONS[metricType]
  const m = useMessages(metricsMessages).chart
  const d = useMessages(domainMessages)
  const label = d.metric[metricType]
  const query = useQuery(trpc.metrics.history.queryOptions({ metricType }))
  const data = query.data ?? []
  const last = data[data.length - 1]

  return (
    <section aria-labelledby="progression-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="progression-title" className="text-xl font-bold">
            {m.title(label)}
          </h2>
          <p className="text-sm text-fg-muted">{def.higherIsBetter ? m.higher : m.lower}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {m.metric}
          <Select value={metricType} onChange={(e) => setMetricType(e.target.value as MetricType)} className="min-w-48">
            {metricTypes.map((t) => (
              <option key={t} value={t}>
                {d.metric[t]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {query.isPending && <Spinner label={m.loading} />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.isSuccess && data.length < 2 && <p className="text-fg-muted">{m.needTwo}</p>}
      {query.isSuccess && data.length >= 2 && (
        <>
          <div className="h-72 w-full" role="img" aria-label={m.aria(label, data[0]!.date, last!.date, `${last!.value} ${def.unit}`)}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 48, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--border-subtle)" strokeWidth={1} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--fg-muted)', fontSize: 12 }} stroke="var(--border-subtle)" tickMargin={8} minTickGap={24} />
                <YAxis
                  domain={['auto', 'auto']}
                  reversed={!def.higherIsBetter}
                  tick={{ fill: 'var(--fg-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  stroke="var(--border-subtle)"
                  width={56}
                  tickFormatter={(v: number) => v.toFixed(def.decimals)}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--fg-muted)', strokeWidth: 1 }}
                  contentStyle={{ background: 'var(--bg)', border: '2px solid var(--border-strong)', borderRadius: 2, color: 'var(--fg)' }}
                  labelStyle={{ color: 'var(--fg-muted)' }}
                  formatter={(v) => [`${Number(v).toFixed(def.decimals)} ${def.unit}`, label]}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent-text)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={{ r: 4, fill: 'var(--accent-text)', stroke: 'var(--bg)', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: 'var(--accent-text)', stroke: 'var(--bg)', strokeWidth: 2 }}
                  isAnimationActive={false}
                  label={(props: { index?: number; x?: number | string; y?: number | string; value?: unknown }) =>
                    props.index === data.length - 1 ? (
                      <text x={Number(props.x) + 8} y={Number(props.y) + 4} fill="var(--fg)" fontSize={12} fontFamily="var(--font-mono)">
                        {Number(props.value).toFixed(def.decimals)}
                      </text>
                    ) : (
                      <g />
                    )
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details>
            <summary className="cursor-pointer font-bold">{m.showTable}</summary>
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">{m.history(label)}</caption>
              <thead>
                <tr className="border-b-2 border-border-subtle">
                  <th scope="col" className="py-2">{m.date}</th>
                  <th scope="col" className="py-2 text-right">{label} ({def.unit})</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle">
                    <td className="py-2">{row.date}</td>
                    <td className="tabular py-2 text-right">{row.value.toFixed(def.decimals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  )
}
