'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { createAthleteProfileAction, updateAthleteProfileAction } from '@/lib/athletes/actions'
import { POSITIONS_BY_SPORT, type Sport } from '@/lib/athletes/positions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { domainMessages } from '@/i18n/messages/domain'
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
  const m = useMessages(authMessages).profileForm
  const d = useMessages(domainMessages)

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
        <Field label={m.firstName} name="firstName" required error={errors.firstName}>
          {(p) => <TextInput {...p} autoComplete="given-name" defaultValue={values.firstName} />}
        </Field>
        <Field label={m.lastName} name="lastName" required error={errors.lastName}>
          {(p) => <TextInput {...p} autoComplete="family-name" defaultValue={values.lastName} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.sport} name="sport" required error={errors.sport}>
          {(p) => (
            <Select {...p} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              <option value="BASEBALL">{d.sport.BASEBALL}</option>
              <option value="HOCKEY">{d.sport.HOCKEY}</option>
              <option value="FOOTBALL">{d.sport.FOOTBALL}</option>
            </Select>
          )}
        </Field>
        <Field label={m.position} name="primaryPosition" required error={errors.primaryPosition}>
          {(p) => (
            <Select {...p} key={sport} defaultValue={values.primaryPosition ?? ''}>
              <option value="" disabled>
                {m.choosePosition}
              </option>
              {POSITIONS_BY_SPORT[sport].map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {d.position[pos.value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={m.gradYear} name="gradYear" required error={errors.gradYear}>
        {(p) => (
          <Select {...p} defaultValue={values.gradYear ?? ''}>
            <option value="" disabled>
              {m.chooseYear}
            </option>
            {gradYears.map((y) => (
              <option key={y} value={y}>
                {m.classOf(y)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={m.height} name="heightInches" error={errors.heightInches}>
          {(p) => <TextInput {...p} inputMode="numeric" defaultValue={values.heightInches} className="tabular" />}
        </Field>
        <Field label={m.weight} name="weightLbs" error={errors.weightLbs}>
          {(p) => <TextInput {...p} inputMode="numeric" defaultValue={values.weightLbs} className="tabular" />}
        </Field>
        <Field label={m.gpa} name="gpa" error={errors.gpa}>
          {(p) => <TextInput {...p} inputMode="decimal" defaultValue={values.gpa} className="tabular" />}
        </Field>
      </div>
      {sport === 'BASEBALL' && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={m.bats} name="bats" error={errors.bats}>
            {(p) => (
              <Select {...p} defaultValue={values.bats ?? ''}>
                <option value="">{m.notSet}</option>
                <option value="RIGHT">{m.right}</option>
                <option value="LEFT">{m.left}</option>
              </Select>
            )}
          </Field>
          <Field label={m.throws} name="throws" error={errors.throws}>
            {(p) => (
              <Select {...p} defaultValue={values.throws ?? ''}>
                <option value="">{m.notSet}</option>
                <option value="RIGHT">{m.right}</option>
                <option value="LEFT">{m.left}</option>
              </Select>
            )}
          </Field>
        </div>
      )}
      <Field label={m.highSchool} name="highSchool" error={errors.highSchool}>
        {(p) => <TextInput {...p} autoComplete="organization" defaultValue={values.highSchool} />}
      </Field>
      <Field label={m.twitter} name="twitterHandle" error={errors.twitterHandle} hint={m.twitterHint}>
        {(p) => <TextInput {...p} autoComplete="off" spellCheck={false} defaultValue={values.twitterHandle} />}
      </Field>
      {!editing && <p className="text-sm text-fg-muted">{m.startsPrivate}</p>}
      <SubmitButton pendingLabel={m.saving}>{editing ? m.saveChanges : m.save}</SubmitButton>
    </form>
  )
}
