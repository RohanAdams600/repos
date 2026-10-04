'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { familyAction } from '@/lib/family/actions'
import { initialFormState } from '@/lib/forms'

type Props = {
  athleteId: string
  intent: string
  itemId?: string
  title?: string
  description?: string
  submitLabel: string
  pendingLabel: string
  checkbox?: { name: string; label: string; required: boolean }
  danger?: boolean
  /** Inline button only (approve or decline inside a card); errors still show. */
  bare?: boolean
}

/** One form per guardian action. On success the action redirects and the page reports the outcome. */
export function FamilyActionForm({ athleteId, intent, itemId, title, description, submitLabel, pendingLabel, checkbox, danger, bare }: Props) {
  const [state, action] = useActionState(familyAction, initialFormState)
  const form = (
    <>
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="athleteId" value={athleteId} />
        <input type="hidden" name="intent" value={intent} />
        {itemId && <input type="hidden" name="itemId" value={itemId} />}
        {checkbox && <Checkbox name={checkbox.name} required={checkbox.required} label={checkbox.label} error={state.status === 'error' ? state.fieldErrors?.[checkbox.name] : undefined} />}
        <SubmitButton pendingLabel={pendingLabel} variant={danger ? 'danger' : bare ? 'secondary' : undefined} className="self-start">
          {submitLabel}
        </SubmitButton>
      </form>
    </>
  )
  if (bare) return <div className="flex flex-col gap-2">{form}</div>
  const headingId = `family-${intent}-${itemId ?? athleteId}`
  return (
    <section aria-labelledby={headingId} className={danger ? 'flex flex-col gap-4 border-2 border-danger p-5' : 'flex flex-col gap-4 border-2 border-border-subtle p-5'}>
      <h3 id={headingId} className="text-xl font-bold">
        {title}
      </h3>
      {description && <p className="text-fg-muted">{description}</p>}
      {form}
    </section>
  )
}

export function FamilyReportForm({ athleteId, threadId, messageId }: { athleteId: string; threadId: string; messageId: string }) {
  const [state, action] = useActionState(familyAction, initialFormState)
  const fieldError = state.status === 'error' ? state.fieldErrors?.reason : undefined
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="athleteId" value={athleteId} />
      <input type="hidden" name="intent" value="report" />
      <input type="hidden" name="itemId" value={threadId} />
      <input type="hidden" name="messageId" value={messageId} />
      <label htmlFor={`reason-${messageId}`} className="font-bold">
        What is wrong? <span className="font-normal text-fg-muted">(required)</span>
      </label>
      <textarea
        id={`reason-${messageId}`}
        name="reason"
        rows={3}
        maxLength={1000}
        required
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? `reason-${messageId}-error` : undefined}
        className="block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg"
      />
      {fieldError && (
        <p id={`reason-${messageId}-error`} className="text-sm font-bold text-danger">
          {fieldError}
        </p>
      )}
      <SubmitButton pendingLabel="Sending" size="sm" className="self-start">
        Send report
      </SubmitButton>
    </form>
  )
}
