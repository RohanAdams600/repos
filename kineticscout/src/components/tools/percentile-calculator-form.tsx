'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { calculatePercentileAction, type CalculatorState } from '@/lib/insights/calculator-action'
import { METRIC_DEFINITIONS, METRIC_TYPES, type MetricType } from '@/lib/metrics/definitions'

const SPORTS = [
  { value: 'BASEBALL', label: 'Baseball' },
  { value: 'HOCKEY', label: 'Hockey' },
  { value: 'FOOTBALL', label: 'Football' },
] as const

export function PercentileCalculatorForm({ minimumCohort }: { minimumCohort: number }) {
  const [state, action] = useActionState<CalculatorState, FormData>(calculatePercentileAction, { status: 'idle' })
  const [sport, setSport] = useState<(typeof SPORTS)[number]['value']>('BASEBALL')
  const metrics = METRIC_TYPES.filter((t) => METRIC_DEFINITIONS[t].sport === sport)
  const [metric, setMetric] = useState<MetricType>(metrics[0]!)
  const def = METRIC_DEFINITIONS[metrics.includes(metric) ? metric : metrics[0]!]
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'idle' ? {} : state.values

  return (
    <div className="flex flex-col gap-6">
      <form key={JSON.stringify(values)} action={action} className="flex flex-col gap-5" noValidate>
        {state.status === 'error' && (
          <Alert tone="error" focusOnMount>
            {state.message}
          </Alert>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sport" name="sport" required>
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
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Measurement" name="metricType" required error={errors.metricType}>
            {(p) => (
              <Select {...p} value={def.type} onChange={(e) => setMetric(e.target.value as MetricType)}>
                {metrics.map((t) => (
                  <option key={t} value={t}>
                    {METRIC_DEFINITIONS[t].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={`Your result (${def.unit})`} name="value" required error={errors.value} hint={def.higherIsBetter ? undefined : 'Timed event: lower is better.'}>
          {(p) => <TextInput {...p} inputMode="decimal" className="tabular" defaultValue={values.value} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-4">
          <Field label="Age" name="age" required error={errors.age}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.age} />}
          </Field>
          <Field label="Height (ft)" name="heightFeet" required error={errors.heightFeet}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.heightFeet} />}
          </Field>
          <Field label="Height (in)" name="heightInches" required error={errors.heightInches}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.heightInches} />}
          </Field>
          <Field label="Weight (lb)" name="weightLbs" required error={errors.weightLbs}>
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" defaultValue={values.weightLbs} />}
          </Field>
        </div>
        <SubmitButton pendingLabel="Calculating" className="self-start">
          Calculate
        </SubmitButton>
      </form>

      <div aria-live="polite">
        {state.status === 'result' && (
          <section aria-labelledby="calc-result" className="flex flex-col gap-2 border-2 border-fg p-6">
            <h2 id="calc-result" className="text-xl font-bold">
              About the <span className="tabular">{state.percentile}th</span> percentile
            </h2>
            <p className="text-fg-muted">
              Your {state.metricLabel.toLowerCase()} of <span className="tabular">{state.valueLabel}</span> is better than about{' '}
              <span className="tabular">{state.percentile}%</span> of <span className="tabular">{state.cohortSize}</span> KineticScout athletes with a
              similar build ({state.bandsLabel}). Rounded to the nearest 5.
            </p>
          </section>
        )}
        {state.status === 'insufficient' && (
          <Alert tone="info">
            Fewer than {minimumCohort} KineticScout athletes with a build like yours have logged a {state.metricLabel.toLowerCase()}, so we cannot
            give a fair comparison yet.
          </Alert>
        )}
      </div>
    </div>
  )
}
