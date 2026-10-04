'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { requestPasswordResetAction, updatePasswordAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/forms'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/constants'

export function RequestResetForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Check your email" focusOnMount>
        {state.message}
      </Alert>
    )
  }
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label="Email" name="email" required error={errors.email}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" inputMode="email" defaultValue={state.status === 'error' ? state.values?.email : undefined} />}
      </Field>
      <SubmitButton pendingLabel="Sending link">Send reset link</SubmitButton>
    </form>
  )
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initialFormState)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label="New password" name="password" required error={errors.password} hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" />}
      </Field>
      <Field label="Confirm new password" name="confirmPassword" required error={errors.confirmPassword}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" />}
      </Field>
      <SubmitButton pendingLabel="Saving">Save new password</SubmitButton>
    </form>
  )
}
