'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { SubmitButton } from '@/components/ui/submit-button'
import { signUpAction } from '@/lib/auth/actions'
import { initialFormState } from '@/lib/forms'
import { useLocale, useMessages } from '@/i18n/client'
import { SPANISH_ENABLED } from '@/i18n/config'
import { authMessages } from '@/i18n/messages/auth'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/constants'

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initialFormState)
  const t = useMessages(authMessages)
  const m = t.signUp
  const locale = useLocale()
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
          {m.iAmA} <span className="font-normal text-fg-muted">{m.required}</span>
        </legend>
        {m.types.map(([value, label, description]) => (
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

      <Field label={t.email} name="email" required error={errors.email}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" inputMode="email" defaultValue={values.email} />}
      </Field>
      <Field label={t.password} name="password" required error={errors.password} hint={m.passwordHint(PASSWORD_MIN_LENGTH)}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} />}
      </Field>
      <Field label={m.dob} name="dateOfBirth" required error={errors.dateOfBirth}>
        {(p) => <TextInput {...p} type="date" max={today} autoComplete="bday" defaultValue={values.dateOfBirth} />}
      </Field>
      <Field
        label={m.guardianEmail}
        name="guardianEmail"
        error={errors.guardianEmail}
        hint={m.guardianHint}
      >
        {(p) => <TextInput {...p} type="email" autoComplete="off" inputMode="email" defaultValue={values.guardianEmail} />}
      </Field>
      {SPANISH_ENABLED && (
        <Field label={m.guardianLanguage} name="guardianLocale">
          {(p) => (
            <Select {...p} defaultValue={values.guardianLocale ?? locale}>
              <option value="en" lang="en">English</option>
              <option value="es" lang="es">Español</option>
            </Select>
          )}
        </Field>
      )}

      <Checkbox
        name="acceptTerms"
        required
        error={errors.acceptTerms}
        label={
          <>
            {m.agree} <Link href="/legal/terms">{m.terms}</Link> {m.andRead} <Link href="/legal/privacy">{m.privacy}</Link>.
          </>
        }
      />
      <Checkbox name="marketingOptIn" label={m.marketing} />

      <SubmitButton pendingLabel={m.pending}>{m.submit}</SubmitButton>
      <p className="text-sm">
        {m.already} <Link href="/sign-in">{t.signIn.submit}</Link>
      </p>
    </form>
  )
}
