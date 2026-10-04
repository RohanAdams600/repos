'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MetricType } from '@/generated/prisma/enums'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { OUTBOX_EVENT, queueEntry } from '@/lib/pwa/outbox'
import { useMessages } from '@/i18n/client'
import { domainMessages } from '@/i18n/messages/domain'
import { metricsMessages } from '@/i18n/messages/metrics'
import { errorMessage, isNetworkError, useTRPC } from '@/trpc/client'

export function MetricLogForm({ metricTypes, remaining, userId }: { metricTypes: MetricType[]; remaining: number | null; userId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [metricType, setMetricType] = useState<MetricType>(metricTypes[0]!)
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today)
  const [clientError, setClientError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [queued, setQueued] = useState<string | null>(null)
  const def = METRIC_DEFINITIONS[metricType]
  const m = useMessages(metricsMessages).log
  const d = useMessages(domainMessages)
  const label = d.metric[metricType]

  /** No connection: keep it on this device; OutboxSync sends it when the device is back online. */
  function keepOffline(numeric: number, clientRef: string) {
    if (!queueEntry({ clientRef, userId, metricType, value: numeric, date })) {
      setClientError(m.offlineFull)
      return
    }
    mutation.reset()
    setQueued(m.queued(m.entry(label, numeric.toFixed(def.decimals), def.unit)))
    setValue('')
    window.dispatchEvent(new Event(OUTBOX_EVENT))
  }

  const mutation = useMutation(
    trpc.metrics.log.mutationOptions({
      onSuccess: () => {
        setSaved(m.saved(m.entry(label, Number(value).toFixed(def.decimals), def.unit)))
        setValue('')
        router.refresh()
      },
    }),
  )

  const disabled = remaining === 0 || mutation.isPending
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setSaved(null)
        setQueued(null)
        const numeric = Number(value)
        if (!value || !Number.isFinite(numeric) || numeric < def.min || numeric > def.max) {
          setClientError(m.range(label, def.min, def.max, def.unit))
          return
        }
        setClientError(null)
        const clientRef = crypto.randomUUID()
        if (navigator.onLine === false) {
          keepOffline(numeric, clientRef)
          return
        }
        mutation.mutate({ metricType, value: numeric, date, clientRef }, { onError: (error) => (isNetworkError(error) ? keepOffline(numeric, clientRef) : undefined) })
      }}
    >
      {mutation.isError && (
        <Alert tone="error" focusOnMount>
          {errorMessage(mutation.error)}
        </Alert>
      )}
      {saved && <Alert tone="success">{saved}</Alert>}
      {queued && <Alert tone="info">{queued}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={m.metric} name="metricType" required>
          {(p) => (
            <Select {...p} value={metricType} onChange={(e) => setMetricType(e.target.value as MetricType)}>
              {metricTypes.map((t) => (
                <option key={t} value={t}>
                  {d.metric[t]} ({METRIC_DEFINITIONS[t].unit})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={m.value(def.unit)} name="value" required error={clientError ?? undefined}>
          {(p) => (
            <TextInput
              {...p}
              inputMode="decimal"
              className="tabular"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={clientError ? true : undefined}
            />
          )}
        </Field>
        <Field label={m.date} name="date" required>
          {(p) => <TextInput {...p} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending && <Spinner label={m.saving} />}
          {mutation.isPending ? m.saving : m.submit}
        </Button>
        {remaining !== null && (
          <p className="tabular text-sm text-fg-muted">{m.left(remaining)}</p>
        )}
      </div>
    </form>
  )
}
