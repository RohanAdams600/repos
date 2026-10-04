'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { calculatePercentileAction, type CalculatorState } from '@/lib/insights/calculator-action'
import { METRIC_DEFINITIONS, METRIC_TYPES, type MetricType } from '@/lib/metrics/definitions'
import { useLocale, useMessages } from '@/i18n/client'
import { INTL_LOCALE } from '@/i18n/config'
import { calculatorMessages } from '@/i18n/messages/calculator'
import { domainMessages } from '@/i18n/messages/domain'

const SPORTS = [{ value: 'BASEBALL' }, { value: 'HOCKEY' }, { value: 'FOOTBALL' }] as const

export function PercentileCalculatorForm({ minimumCohort }: { minimumCohort: number }) {
  const [state, action] = useActionState<CalculatorState, FormData>(calculatePercentileAction, { status: 'idle' })
  const [sport, setSport] = useState<(typeof SPORTS)[number]['value']>('BASEBALL')
  const metrics = METRIC_TYPES.filter((t) => METRIC_DEFINITIONS[t].sport === sport)
  const [metric, setMetric] = useState<MetricType>(metrics[0]!)
  const def = METRIC_DEFINITIONS[metrics.includes(metric) ? metric : metrics[0]!]
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'idle' ? {} : state.values
  const m = useMessages(calculatorMessages).form
  const d = useMessages(domainMessages)
  const locale = useLocale()
  const shownMetric = values.metricType && values.metricType in METRIC_DEFINITIONS ? d.metric[values.metricType as MetricType] : d.metric[def.type]

  return (
    <div className="flex flex-col gap-6">
      <form key={JSON.stringify(values)} action={action} className="flex flex-col gap-5" noValidate>
        {state.status === 'error' && (
          <Alert tone="error" focusOnMount>
            {state.message}
          </Alert>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={m.sport} name="sport" required>
            {(p) => (
              <Select
                {...p}
                value={sport}
                onChange={(e) => {
                  const next = e.target.value as typeof sport
                  setSport(next)
                  setMetric(METRIC_TYPES.find((t) => METRIC_DEFINITIONS[t].sport === next)!)
                }}
              >
                {SPORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {d.sport[s.value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={m.measurement} name="metricType" required error={errors.metricType}>
            {(p) => (
              <Select {...p} value={def.type} onChange={(e) => setMetric(e.target.value as MetricType)}>
                {metrics.map((t) => (
                  <option key={t} value={t}>
                    {d.metric[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={m.result(def.unit)} name="value" required error={errors.value} hint={def.higherIsBetter ? undefined : m.timed}>
          {(p) => <TextInput {...p} inputMode="decimal" className="tabular" defaultValue={values.value} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-4">
          <Field label={m.age} name="age" required error={errors.age}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.age} />}
          </Field>
          <Field label={m.heightFt} name="heightFeet" required error={errors.heightFeet}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.heightFeet} />}
          </Field>
          <Field label={m.heightIn} name="heightInches" required error={errors.heightInches}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.heightInches} />}
          </Field>
          <Field label={m.weight} name="weightLbs" required error={errors.weightLbs}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.weightLbs} />}
          </Field>
        </div>
        <SubmitButton pendingLabel={m.calculating} className="self-start">
          {m.calculate}
        </SubmitButton>
      </form>

      <div aria-live="polite">
        {state.status === 'result' && (
          <section aria-labelledby="calc-result" className="flex flex-col gap-3 border-2 border-fg p-6">
            <h2 id="calc-result" className="text-xl font-bold">
              {m.headline((state.national ?? state.cohort)!.percentile, Boolean(state.national))}
            </h2>
            {state.national && (
              <p className="text-fg-muted">
                {m.nationalLine(shownMetric, state.valueLabel, state.national.percentile, state.national.publisher, state.national.bandLabel, state.national.sampleSize.toLocaleString(INTL_LOCALE[locale]), state.national.name, state.national.edition)}{' '}
                <a href={state.national.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {m.source}
                </a>
              </p>
            )}
            {state.cohort ? (
              <p className="text-fg-muted">
                {m.cohortLine(state.national ? m.onKs : m.yours(shownMetric, state.valueLabel), state.cohort.percentile, state.cohort.cohortSize, state.cohort.bandsLabel)}
              </p>
            ) : (
              <p className="text-fg-muted">{m.tooFewShort(minimumCohort)}</p>
            )}
            <p className="text-sm text-fg-muted">{m.rounded}</p>
          </section>
        )}
        {state.status === 'insufficient' && (
          <Alert tone="info">{m.tooFew(minimumCohort, shownMetric)}</Alert>
        )}
      </div>
    </div>
  )
}
