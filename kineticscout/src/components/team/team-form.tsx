'use client'

import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { fieldErrorsFrom } from '@/lib/forms'
import { teamDetailsSchema, US_STATES, type TeamDetails } from '@/lib/teams/rules'
import { errorMessage, useTRPC } from '@/trpc/client'

const SPORTS = [
  ['BASEBALL', 'Baseball'],
  ['HOCKEY', 'Hockey'],
  ['FOOTBALL', 'Football'],
] as const

type Values = Record<keyof TeamDetails, string>
const EMPTY: Values = { name: '', sport: 'BASEBALL', orgType: 'HIGH_SCHOOL', organization: '', state: '', coachName: '', coachTitle: '', directoryUrl: '' }

/** Create a team, or correct and resubmit one staff did not approve. */
export function TeamForm({ teamId, initial, onDone }: { teamId?: string; initial?: Partial<Values>; onDone: () => void }) {
  const trpc = useTRPC()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<Values>({ ...EMPTY, ...initial })
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const create = useMutation(trpc.team.create.mutationOptions({ onSuccess: onDone }))
  const resubmit = useMutation(trpc.team.resubmit.mutationOptions({ onSuccess: onDone }))
  const mutation = teamId ? resubmit : create
  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value })

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = teamDetailsSchema.safeParse(values)
        if (!parsed.success) {
          const next = fieldErrorsFrom(parsed.error)
          setErrors(next)
          const first = Object.keys(next)[0]
          const field = first ? formRef.current?.elements.namedItem(`team-${first}`) : null
          if (field instanceof HTMLElement) field.focus()
          return
        }
        setErrors({})
        if (teamId) resubmit.mutate({ ...parsed.data, teamId })
        else create.mutate(parsed.data)
      }}
    >
      {mutation.isError && (
        <Alert tone="error" focusOnMount>
          {errorMessage(mutation.error)}
        </Alert>
      )}
      <Field label="Team name" name="team-name" required error={errors.name} hint='For example "Westlake High School Varsity Baseball" or "Lone Star 16U".'>
        {(p) => <TextInput {...p} maxLength={120} value={values.name} onChange={set('name')} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Sport" name="team-sport" required error={errors.sport}>
          {(p) => (
            <Select {...p} value={values.sport} onChange={set('sport')}>
              {SPORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Type" name="team-orgType" required error={errors.orgType}>
          {(p) => (
            <Select {...p} value={values.orgType} onChange={set('orgType')}>
              <option value="HIGH_SCHOOL">High school team</option>
              <option value="CLUB">Travel or club team</option>
            </Select>
          )}
        </Field>
        <Field label="State" name="team-state" required error={errors.state}>
          {(p) => (
            <Select {...p} value={values.state} onChange={set('state')}>
              <option value="">Choose</option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="School or club" name="team-organization" required error={errors.organization}>
        {(p) => <TextInput {...p} autoComplete="organization" maxLength={160} value={values.organization} onChange={set('organization')} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="team-coachName" required error={errors.coachName} hint="As it appears on the staff page.">
          {(p) => <TextInput {...p} autoComplete="name" maxLength={120} value={values.coachName} onChange={set('coachName')} />}
        </Field>
        <Field label="Your title" name="team-coachTitle" required error={errors.coachTitle}>
          {(p) => <TextInput {...p} autoComplete="organization-title" maxLength={80} value={values.coachTitle} onChange={set('coachTitle')} />}
        </Field>
      </div>
      <Field label="Staff page" name="team-directoryUrl" required error={errors.directoryUrl} hint="The https:// link to your school's athletics staff page or your club's coaches page, where your name appears.">
        {(p) => <TextInput {...p} type="url" inputMode="url" maxLength={512} value={values.directoryUrl} onChange={set('directoryUrl')} />}
      </Field>
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {mutation.isPending ? <Spinner label="Submitting" /> : null}
        {teamId ? 'Resubmit for review' : 'Submit for review'}
      </Button>
    </form>
  )
}
