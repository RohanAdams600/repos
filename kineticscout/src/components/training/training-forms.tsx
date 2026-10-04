'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { initialFormState } from '@/lib/forms'
import { archivePlanAction, createPlanAction, togglePracticeAction } from '@/lib/training/actions'

export function CreatePlanForm({ analysisId, metrics }: { analysisId: string; metrics: { value: string; label: string }[] }) {
  const [state, action] = useActionState(createPlanAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="analysisId" value={analysisId} />
      {metrics.length > 1 ? (
        <Field label="Measurement to follow" name="metricType" required>
          {(p) => (
            <Select {...p} defaultValue={metrics[0]!.value}>
              {metrics.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <input type="hidden" name="metricType" value={metrics[0]?.value ?? ''} />
      )}
      <SubmitButton pendingLabel="Building your plan" className="self-start">
        Build a four-week plan
      </SubmitButton>
    </form>
  )
}

export function PracticeToggle({ planId, itemId, practicedToday, title }: { planId: string; itemId: string; practicedToday: boolean; title: string }) {
  const [state, action] = useActionState(togglePracticeAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton pendingLabel="Saving" variant={practicedToday ? 'secondary' : 'primary'} className="self-start">
        {practicedToday ? `Clear today for ${title}` : `I practiced ${title} today`}
      </SubmitButton>
      {state.status !== 'idle' && (
        <p role="status" className={state.status === 'error' ? 'text-sm font-bold text-danger' : 'text-sm'}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function ArchivePlanForm({ planId }: { planId: string }) {
  const [state, action] = useActionState(archivePlanAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="planId" value={planId} />
      <SubmitButton pendingLabel="Finishing" variant="secondary" className="self-start">
        Finish this plan
      </SubmitButton>
    </form>
  )
}
