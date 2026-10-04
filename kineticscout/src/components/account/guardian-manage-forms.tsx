'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { guardianManageAction, requestGuardianLinksAction } from '@/lib/auth/guardian-actions'
import { initialFormState } from '@/lib/forms'

type Intent = 'revoke' | 'regrant' | 'delete' | 'cancel-deletion'

type ManageFormProps = {
  token: string
  intent: Intent
  title: string
  description: string
  submitLabel: string
  pendingLabel: string
  checkbox?: { name: string; label: string; required: boolean }
  danger?: boolean
}

/** One form per action. Errors show inline; on success the action redirects and the page reports the outcome. */
export function GuardianManageForm({ token, intent, title, description, submitLabel, pendingLabel, checkbox, danger }: ManageFormProps) {
  const [state, action] = useActionState(guardianManageAction, initialFormState)
  const headingId = `guardian-${intent}-title`
  return (
    <section aria-labelledby={headingId} className={danger ? 'flex flex-col gap-4 border-2 border-danger p-5' : 'flex flex-col gap-4 border-2 border-border-subtle p-5'}>
      <h2 id={headingId} className="text-xl font-bold">
        {title}
      </h2>
      <p className="text-fg-muted">{description}</p>
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      {state.status !== 'success' && (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="intent" value={intent} />
          {checkbox && (
            <Checkbox
              name={checkbox.name}
              required={checkbox.required}
              label={checkbox.label}
              error={state.status === 'error' ? state.fieldErrors?.[checkbox.name] : undefined}
            />
          )}
          <SubmitButton pendingLabel={pendingLabel} className="self-start">
            {submitLabel}
          </SubmitButton>
        </form>
      )}
    </section>
  )
}

export function GuardianLinkRequestForm() {
  const [state, action] = useActionState(requestGuardianLinksAction, initialFormState)
  if (state.status === 'success') {
    return (
      <Alert tone="success" focusOnMount>
        {state.message}
      </Alert>
    )
  }
  const values = state.status === 'error' ? state.values : undefined
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label="Your email address" name="email" required error={state.status === 'error' ? state.fieldErrors?.email : undefined} hint="Use the address that received the original consent request.">
        {(props) => <TextInput {...props} type="email" autoComplete="email" defaultValue={values?.email} />}
      </Field>
      <SubmitButton pendingLabel="Sending" className="self-start">
        Email me a management link
      </SubmitButton>
    </form>
  )
}
