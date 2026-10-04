'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { requestPasswordResetAction, updatePasswordAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/forms'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/constants'

export function RequestResetForm() {
  const [state, action] = useActionState(requestPasswordResetAction, initialFormState)
  const t = useMessages(authMessages)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  if (state.status === 'success') {
    return (
      <Alert tone="success" title={t.reset.checkEmail} focusOnMount>
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
      <Field label={t.email} name="email" required error={errors.email}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" inputMode="email" defaultValue={state.status === 'error' ? state.values?.email : undefined} />}
      </Field>
      <SubmitButton pendingLabel={t.reset.sending}>{t.reset.send}</SubmitButton>
    </form>
  )
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, initialFormState)
  const t = useMessages(authMessages)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label={t.reset.newPassword} name="password" required error={errors.password} hint={t.reset.hint(PASSWORD_MIN_LENGTH)}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" />}
      </Field>
      <Field label={t.reset.confirm} name="confirmPassword" required error={errors.confirmPassword}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" />}
      </Field>
      <SubmitButton pendingLabel={t.reset.saving}>{t.reset.save}</SubmitButton>
    </form>
  )
}
