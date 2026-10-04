'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { initialFormState } from '@/lib/forms'
import { useMessages } from '@/i18n/client'
import { trainingMessages } from '@/i18n/messages/training'
import { useServerText } from '@/i18n/server-text-client'
import { archivePlanAction, createPlanAction, togglePracticeAction } from '@/lib/training/actions'

export function CreatePlanForm({ analysisId, metrics }: { analysisId: string; metrics: { value: string; label: string }[] }) {
  const [state, action] = useActionState(createPlanAction, initialFormState)
  const m = useMessages(trainingMessages).form
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="analysisId" value={analysisId} />
      {metrics.length > 1 ? (
        <Field label={m.metric} name="metricType" required>
          {(p) => (
            <Select {...p} defaultValue={metrics[0]!.value}>
              {metrics.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <input type="hidden" name="metricType" value={metrics[0]?.value ?? ''} />
      )}
      <SubmitButton pendingLabel={m.building} className="self-start">
        {m.build}
      </SubmitButton>
    </form>
  )
}

export function PracticeToggle({ planId, itemId, practicedToday, title }: { planId: string; itemId: string; practicedToday: boolean; title: string }) {
  const [state, action] = useActionState(togglePracticeAction, initialFormState)
  const m = useMessages(trainingMessages).form
  const serverText = useServerText()
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton pendingLabel={m.saving} variant={practicedToday ? 'secondary' : 'primary'} className="self-start">
        {practicedToday ? m.clear(title) : m.practiced(title)}
      </SubmitButton>
      {state.status !== 'idle' && (
        <p role="status" className={state.status === 'error' ? 'text-sm font-bold text-danger' : 'text-sm'}>
          {serverText(state.message)}
        </p>
      )}
    </form>
  )
}

export function ArchivePlanForm({ planId }: { planId: string }) {
  const [state, action] = useActionState(archivePlanAction, initialFormState)
  const m = useMessages(trainingMessages).form
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}
      <input type="hidden" name="planId" value={planId} />
      <SubmitButton pendingLabel={m.finishing} variant="secondary" className="self-start">
        {m.finish}
      </SubmitButton>
    </form>
  )
}
