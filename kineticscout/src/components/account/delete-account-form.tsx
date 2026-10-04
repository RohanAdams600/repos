'use client'

import { useActionState, useRef } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { cancelDeletionAction, deleteAccountAction } from '@/lib/account/actions'
import { initialFormState } from '@/lib/forms'

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, initialFormState)
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
      <Field label="Type DELETE to confirm" name="confirmation" required error={errors?.confirmation}>
        {(props) => <TextInput {...props} autoComplete="off" spellCheck={false} defaultValue={values?.confirmation} />}
      </Field>
      <Field label="Your password" name="password" required error={errors?.password} hint="We ask again so nobody else can delete your account from an unlocked device.">
        {(props) => <PasswordInput {...props} autoComplete="current-password" />}
      </Field>
      <ConfirmDialog
        tone="danger"
        title="Delete your account?"
        description={
          <p>
            Your profile, metrics, videos, analyses and recruiting pipeline will be permanently deleted after 7 days, and any subscription
            will end at that point. You can cancel the request from Settings until then. Consider downloading your data first, and see the
            Refund Policy if you recently paid.
          </p>
        }
        confirmLabel="Delete my account"
        onConfirm={() => formRef.current?.requestSubmit()}
        trigger={
          <Button variant="danger" className="self-start">
            Delete my account
          </Button>
        }
      />
    </form>
  )
}

export function CancelDeletionForm() {
  const [state, action] = useActionState(cancelDeletionAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <SubmitButton pendingLabel="Canceling" className="self-start">
        Keep my account
      </SubmitButton>
    </form>
  )
}
