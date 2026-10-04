'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { signUpAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/forms'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/constants'

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : {}
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.accountType ? 'account-type-error' : undefined}>
        <legend className="mb-2 font-bold">
          I am a <span className="font-normal text-fg-muted">(required)</span>
        </legend>
        {(
          [
            ['ATHLETE', 'Athlete', 'Track your numbers and find programs that fit.'],
            ['COACH', 'College coach', 'Adults only. We verify your school email and staff listing before you can search or contact athletes.'],
            ['TEAM_COACH', 'High school or travel coach', 'Adults only. We check your school or club staff page before players can join your team.'],
          ] as const
        ).map(([value, label, description]) => (
          <label key={value} className="flex cursor-pointer items-start gap-3 border-2 border-border-strong p-3 has-[:checked]:border-fg">
            <input type="radio" name="accountType" value={value} defaultChecked={(values.accountType ?? 'ATHLETE') === value} className="mt-1 size-5 accent-[var(--accent)]" />
            <span>
              <span className="block font-bold">{label}</span>
              <span className="block text-sm text-fg-muted">{description}</span>
            </span>
          </label>
        ))}
        {errors.accountType && (
          <p id="account-type-error" className="text-sm font-bold text-danger">
            {errors.accountType}
          </p>
        )}
      </fieldset>

      <Field label="Email" name="email" required error={errors.email}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" inputMode="email" defaultValue={values.email} />}
      </Field>
      <Field label="Password" name="password" required error={errors.password} hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence works well.`}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />}
      </Field>
      <Field label="Date of birth" name="dateOfBirth" required error={errors.dateOfBirth}>
        {(p) => <TextInput {...p} type="date" max={today} autoComplete="bday" defaultValue={values.dateOfBirth} />}
      </Field>
      <Field
        label="Parent or guardian email"
        name="guardianEmail"
        error={errors.guardianEmail}
        hint="Only if you are under 18. We ask them to approve before your profile can be public or a purchase can be made."
      >
        {(p) => <TextInput {...p} type="email" autoComplete="off" inputMode="email" defaultValue={values.guardianEmail} />}
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

      <SubmitButton pendingLabel="Creating account">Create account</SubmitButton>
      <p className="text-sm">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </form>
  )
}
