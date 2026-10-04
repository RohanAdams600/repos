'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { completeAccountAction } from '@/lib/auth/actions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { initialFormState } from '@/lib/forms'

/** Shown only if sign-up was interrupted after the email was confirmed. */
export function AccountCompletionForm() {
  const [state, action] = useActionState(completeAccountAction, initialFormState)
  const t = useMessages(authMessages)
  const m = t.onboarding
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : {}
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label={m.accountType} name="accountType" required error={errors.accountType}>
        {(p) => (
          <select {...p} defaultValue={values.accountType ?? 'ATHLETE'} className="block min-h-11 w-full rounded-sm border-2 border-border-strong bg-bg px-3">
            <option value="ATHLETE">{m.types.ATHLETE}</option>
            <option value="COACH">{m.types.COACH}</option>
            <option value="TEAM_COACH">{m.types.TEAM_COACH}</option>
            <option value="GUARDIAN">{m.types.GUARDIAN}</option>
          </select>
        )}
      </Field>
      <Field label={t.signUp.dob} name="dateOfBirth" required error={errors.dateOfBirth}>
        {(p) => <TextInput {...p} type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={values.dateOfBirth} />}
      </Field>
      <Field label={t.signUp.guardianEmail} name="guardianEmail" error={errors.guardianEmail} hint={m.guardianHint}>
        {(p) => <TextInput {...p} type="email" inputMode="email" defaultValue={values.guardianEmail} />}
      </Field>
      <Checkbox
        name="acceptTerms"
        required
        error={errors.acceptTerms}
        label={
          <>
            {t.signUp.agree} <Link href="/legal/terms">{t.signUp.terms}</Link> {t.signUp.andRead} <Link href="/legal/privacy">{t.signUp.privacy}</Link>.
          </>
        }
      />
      <Checkbox name="marketingOptIn" label={t.signUp.marketing} />
      <SubmitButton pendingLabel={m.saving}>{m.continue}</SubmitButton>
    </form>
  )
}
