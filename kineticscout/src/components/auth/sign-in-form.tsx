'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { signInAction } from '@/lib/auth/actions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { initialFormState } from '@/lib/forms'

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initialFormState)
  const t = useMessages(authMessages)
  const m = t.signIn
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : {}

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label={t.email} name="email" required error={errors.email}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" inputMode="email" defaultValue={values.email} />}
      </Field>
      <Field label={t.password} name="password" required error={errors.password}>
        {(p) => <PasswordInput {...p} autoComplete="current-password" />}
      </Field>
      <SubmitButton pendingLabel={m.pending}>{m.submit}</SubmitButton>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/forgot-password">{m.forgot}</Link>
        <Link href="/sign-up">{m.create}</Link>
      </div>
    </form>
  )
}
