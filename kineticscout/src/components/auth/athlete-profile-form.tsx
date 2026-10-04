'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { createAthleteProfileAction, updateAthleteProfileAction } from '@/lib/athletes/actions'
import { POSITIONS_BY_SPORT, type Sport } from '@/lib/athletes/positions'
import { initialFormState } from '@/lib/forms'

type AthleteProfileFormProps = {
  gradYears: number[]
  /** Edit mode pre-fills the saved profile and updates it in place. */
  initial?: Record<string, string>
}

export function AthleteProfileForm({ gradYears, initial }: AthleteProfileFormProps) {
  const editing = initial !== undefined
  const [state, action] = useActionState(editing ? updateAthleteProfileAction : createAthleteProfileAction, initialFormState)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : (initial ?? {})
  const [sport, setSport] = useState<Sport>((values.sport as Sport) ?? 'BASEBALL')

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      {state.status === 'success' && (
        <Alert tone="success" focusOnMount>
          {state.message}
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="firstName" required error={errors.firstName}>
          {(p) => <TextInput {...p} autoComplete="given-name" defaultValue={values.firstName} />}
        </Field>
        <Field label="Last name" name="lastName" required error={errors.lastName}>
          {(p) => <TextInput {...p} autoComplete="family-name" defaultValue={values.lastName} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Sport" name="sport" required error={errors.sport}>
          {(p) => (
            <Select {...p} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
            </Select>
          )}
        </Field>
        <Field label="Primary position" name="primaryPosition" required error={errors.primaryPosition}>
          {(p) => (
            <Select {...p} key={sport} defaultValue={values.primaryPosition ?? ''}>
              <option value="" disabled>
                Choose a position
              </option>
              {POSITIONS_BY_SPORT[sport].map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="High school graduation year" name="gradYear" required error={errors.gradYear}>
        {(p) => (
          <Select {...p} defaultValue={values.gradYear ?? ''}>
            <option value="" disabled>
              Choose a year
            </option>
            {gradYears.map((y) => (
              <option key={y} value={y}>
                Class of {y}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Height (inches)" name="heightInches" error={errors.heightInches}>
          {(p) => <TextInput {...p} inputMode="numeric" defaultValue={values.heightInches} className="tabular" />}
        </Field>
        <Field label="Weight (lb)" name="weightLbs" error={errors.weightLbs}>
          {(p) => <TextInput {...p} inputMode="numeric" defaultValue={values.weightLbs} className="tabular" />}
        </Field>
        <Field label="GPA" name="gpa" error={errors.gpa}>
          {(p) => <TextInput {...p} inputMode="decimal" defaultValue={values.gpa} className="tabular" />}
        </Field>
      </div>
      {sport === 'BASEBALL' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Bats" name="bats" error={errors.bats}>
            {(p) => (
              <Select {...p} defaultValue={values.bats ?? ''}>
                <option value="">Not set</option>
                <option value="RIGHT">Right</option>
                <option value="LEFT">Left</option>
              </Select>
            )}
          </Field>
          <Field label="Throws" name="throws" error={errors.throws}>
            {(p) => (
              <Select {...p} defaultValue={values.throws ?? ''}>
                <option value="">Not set</option>
                <option value="RIGHT">Right</option>
                <option value="LEFT">Left</option>
              </Select>
            )}
          </Field>
        </div>
      )}
      <Field label="High school" name="highSchool" error={errors.highSchool}>
        {(p) => <TextInput {...p} autoComplete="organization" defaultValue={values.highSchool} />}
      </Field>
      <Field label="X (Twitter) handle" name="twitterHandle" error={errors.twitterHandle} hint="Shown on your public profile if you make it public.">
        {(p) => <TextInput {...p} autoComplete="off" spellCheck={false} defaultValue={values.twitterHandle} />}
      </Field>
      {!editing && <p className="text-sm text-fg-muted">Your profile starts private. You choose if and when to make it public.</p>}
      <SubmitButton pendingLabel="Saving profile">{editing ? 'Save changes' : 'Save profile'}</SubmitButton>
    </form>
  )
}
