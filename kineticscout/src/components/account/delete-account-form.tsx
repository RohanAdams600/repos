'use client'

import { useActionState, useRef } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { cancelDeletionAction, deleteAccountAction } from '@/lib/account/actions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { initialFormState } from '@/lib/forms'

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, initialFormState)
  const m = useMessages(authMessages).deleteAccount
  const formRef = useRef<HTMLFormElement>(null)
  const errors = state.status === 'error' ? state.fieldErrors : undefined
  const values = state.status === 'error' ? state.values : undefined

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label={m.typeDelete} name="confirmation" required error={errors?.confirmation}>
        {(props) => <TextInput {...props} autoComplete="off" spellCheck={false} defaultValue={values?.confirmation} />}
      </Field>
      <Field label={m.yourPassword} name="password" required error={errors?.password} hint={m.passwordHint}>
        {(props) => <PasswordInput {...props} autoComplete="current-password" />}
      </Field>
      <ConfirmDialog
        tone="danger"
        title={m.dialogTitle}
        description={
          <p>{m.dialogBody}</p>
        }
        confirmLabel={m.confirm}
        onConfirm={() => formRef.current?.requestSubmit()}
        trigger={
          <Button variant="danger" className="self-start">
            {m.confirm}
          </Button>
        }
      />
    </form>
  )
}

export function CancelDeletionForm() {
  const [state, action] = useActionState(cancelDeletionAction, initialFormState)
  const m = useMessages(authMessages).deleteAccount
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <SubmitButton pendingLabel={m.canceling} className="self-start">
        {m.keep}
      </SubmitButton>
    </form>
  )
}
