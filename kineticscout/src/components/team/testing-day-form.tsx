'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { METRIC_DEFINITIONS, METRIC_TYPES, isPlausibleMetricValue, type MetricType } from '@/lib/metrics/definitions'
import { TEAM_POLICY } from '@/lib/teams/rules'
import { errorMessage, useTRPC } from '@/trpc/client'

/**
 * Testing-day entry. One block per athlete rather than a wide grid, so it works on a phone at the
 * field without sideways scrolling. Empty boxes are skipped; every filled box is checked first.
 */
export function TestingDayForm({ teamId, today }: { teamId: string; today: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const roster = useQuery(trpc.team.roster.queryOptions({ teamId }))
  const record = useMutation(trpc.team.recordSession.mutationOptions({ onSuccess: (r) => router.push(`/dashboard/team/session/${r.sessionId}`) }))
  const [details, setDetails] = useState({ date: today, label: '', location: '' })
  const [metrics, setMetrics] = useState<MetricType[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (roster.isPending) return <Spinner label="Loading roster" />
  if (roster.isError) return <Alert tone="error">{errorMessage(roster.error)}</Alert>
  const sportMetrics = METRIC_TYPES.filter((t) => METRIC_DEFINITIONS[t].sport === roster.data.team.sport)
  const athletes = roster.data.members.filter((m) => m.status === 'ACTIVE')
  const cellKey = (athleteId: string, type: MetricType) => `${athleteId}:${type}`
  const cellName = (athleteId: string, type: MetricType) => `cell-${athleteId}-${type}`

  function submit() {
    const next: Record<string, string> = {}
    if (!details.label.trim() || details.label.trim().length < 3) next.label = 'Name the testing day, for example "Fall testing"'
    if (!details.date) next.date = 'Enter the date of the testing day'
    if (metrics.length === 0) next.metrics = 'Choose at least one measurement'
    const entries: { athleteId: string; metricType: MetricType; value: number }[] = []
    for (const a of athletes) {
      for (const type of metrics) {
        const raw = (values[cellKey(a.athleteId, type)] ?? '').trim()
        if (raw === '') continue
        const value = Number(raw)
        const def = METRIC_DEFINITIONS[type]
        if (!isPlausibleMetricValue(type, value)) next[cellKey(a.athleteId, type)] = `Enter ${def.min} to ${def.max} ${def.unit}`
        else entries.push({ athleteId: a.athleteId, metricType: type, value })
      }
    }
    if (entries.length === 0 && !next.metrics) next.entries = 'Enter at least one result'
    setErrors(next)
    const first = Object.keys(next)[0]
    if (first) {
      const name = first.includes(':') ? cellName(first.split(':')[0]!, first.split(':')[1] as MetricType) : `testing-${first}`
      const field = formRef.current?.elements.namedItem(name)
      if (field instanceof HTMLElement) field.focus()
      return
    }
    record.mutate({ teamId, date: details.date, label: details.label.trim(), location: details.location.trim() || null, entries })
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {record.isError && (
        <Alert tone="error" focusOnMount>
          {errorMessage(record.error)}
        </Alert>
      )}
      {errors.entries && <Alert tone="error">{errors.entries}</Alert>}
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Date" name="testing-date" required error={errors.date}>
          {(p) => <TextInput {...p} type="date" max={today} value={details.date} onChange={(e) => setDetails({ ...details, date: e.target.value })} />}
        </Field>
        <Field label="Name" name="testing-label" required error={errors.label} hint='For example "Fall testing".'>
          {(p) => <TextInput {...p} maxLength={120} value={details.label} onChange={(e) => setDetails({ ...details, label: e.target.value })} />}
        </Field>
        <Field label="Location" name="testing-location">
          {(p) => <TextInput {...p} maxLength={160} value={details.location} onChange={(e) => setDetails({ ...details, location: e.target.value })} />}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.metrics ? 'testing-metrics-error' : undefined}>
        <legend className="mb-2 font-bold">
          Measurements taken <span className="font-normal text-fg-muted">(up to {TEAM_POLICY.maxMetricsPerSession})</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {sportMetrics.map((type) => (
            <Checkbox
              key={type}
              name={type === sportMetrics[0] ? 'testing-metrics' : `testing-metric-${type}`}
              checked={metrics.includes(type)}
              disabled={!metrics.includes(type) && metrics.length >= TEAM_POLICY.maxMetricsPerSession}
              onChange={(e) => setMetrics(e.target.checked ? [...metrics, type] : metrics.filter((m) => m !== type))}
              label={`${METRIC_DEFINITIONS[type].label} (${METRIC_DEFINITIONS[type].unit})`}
            />
          ))}
        </div>
        {errors.metrics && (
          <p id="testing-metrics-error" className="text-sm font-bold text-danger">
            {errors.metrics}
          </p>
        )}
      </fieldset>

      {metrics.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-fg-muted">Leave a box empty if the athlete did not test. Each athlete accepts or declines their results before they count.</p>
          {athletes.map((a) => (
            <fieldset key={a.athleteId} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
              <legend className="px-1 font-bold">
                {a.athlete.firstName} {a.athlete.lastName}
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {metrics.map((type) => {
                  const def = METRIC_DEFINITIONS[type]
                  const key = cellKey(a.athleteId, type)
                  return (
                    <Field key={type} label={`${def.shortLabel} (${def.unit})`} name={cellName(a.athleteId, type)} error={errors[key]}>
                      {(p) => <TextInput {...p} inputMode="decimal" className="tabular" value={values[key] ?? ''} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />}
                    </Field>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <Button type="submit" disabled={record.isPending || athletes.length === 0} className="self-start">
        {record.isPending ? <Spinner label="Saving" /> : null}
        Save and send to athletes
      </Button>
    </form>
  )
}
