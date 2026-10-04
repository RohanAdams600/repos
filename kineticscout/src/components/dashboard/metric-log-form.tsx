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

  /** No connection: keep it on this device; OutboxSync sends it when the device is back online. */
  function keepOffline(numeric: number, clientRef: string) {
    if (!queueEntry({ clientRef, userId, metricType, value: numeric, date })) {
      setClientError('You are offline and this device cannot store the entry. Try again when you are back online.')
      return
    }
    mutation.reset()
    setQueued(`No connection. ${def.label} of ${numeric.toFixed(def.decimals)} ${def.unit} is saved on this device and will be sent when you are back online.`)
    setValue('')
    window.dispatchEvent(new Event(OUTBOX_EVENT))
  }

  const mutation = useMutation(
    trpc.metrics.log.mutationOptions({
      onSuccess: () => {
        setSaved(`${def.label} of ${Number(value).toFixed(def.decimals)} ${def.unit} saved.`)
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
          setClientError(`Enter a ${def.label.toLowerCase()} between ${def.min} and ${def.max} ${def.unit}.`)
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
        <Field label="Metric" name="metricType" required>
          {(p) => (
            <Select {...p} value={metricType} onChange={(e) => setMetricType(e.target.value as MetricType)}>
              {metricTypes.map((t) => (
                <option key={t} value={t}>
                  {METRIC_DEFINITIONS[t].label} ({METRIC_DEFINITIONS[t].unit})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={`Value (${def.unit})`} name="value" required error={clientError ?? undefined}>
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
        <Field label="Date measured" name="date" required>
          {(p) => <TextInput {...p} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={disabled}>
          {mutation.isPending && <Spinner label="Saving" />}
          {mutation.isPending ? 'Saving' : 'Log metric'}
        </Button>
        {remaining !== null && (
          <p className="text-sm text-fg-muted">
            <span className="tabular">{remaining}</span> of 3 free entries left this month.
          </p>
        )}
      </div>
    </form>
  )
}
