'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { completeAccountAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/forms'

/** Shown only if sign-up was interrupted after the email was confirmed. */
export function AccountCompletionForm() {
  const [state, action] = useActionState(completeAccountAction, initialFormState)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : {}
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <Field label="Account type" name="accountType" required error={errors.accountType}>
        {(p) => (
          <select {...p} defaultValue={values.accountType ?? 'ATHLETE'} className="block min-h-11 w-full rounded-sm border-2 border-border-strong bg-bg px-3">
            <option value="ATHLETE">Athlete</option>
            <option value="COACH">Coach (adults only)</option>
          </select>
        )}
      </Field>
      <Field label="Date of birth" name="dateOfBirth" required error={errors.dateOfBirth}>
        {(p) => <TextInput {...p} type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={values.dateOfBirth} />}
      </Field>
      <Field label="Parent or guardian email" name="guardianEmail" error={errors.guardianEmail} hint="Only if you are under 18.">
        {(p) => <TextInput {...p} type="email" inputMode="email" defaultValue={values.guardianEmail} />}
      </Field>
      <Checkbox
        name="acceptTerms"
        required
        error={errors.acceptTerms}
        label={
          <>
            I agree to the <Link href="/legal/terms">Terms of Service</Link> and have read the <Link href="/legal/privacy">Privacy Policy</Link>.
          </>
        }
      />
      <Checkbox name="marketingOptIn" label="Email me product news and training content. You can unsubscribe at any time." />
      <SubmitButton pendingLabel="Saving">Continue</SubmitButton>
    </form>
  )
}
