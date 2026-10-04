'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

type Program = { id: string; schoolName: string; division: string; state: string | null }

/** Verification details: program, title, school email and the staff directory page that lists the coach. */
export function CoachOnboarding({ initial }: { initial?: { firstName?: string; lastName?: string; title?: string; workEmail?: string | null; staffDirectoryUrl?: string | null; college?: Program | null } }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    title: initial?.title ?? '',
    workEmail: initial?.workEmail ?? '',
    staffDirectoryUrl: initial?.staffDirectoryUrl ?? '',
  })
  const [program, setProgram] = useState<Program | null>(initial?.college ?? null)
  const [q, setQ] = useState('')
  const programs = useQuery({ ...trpc.coach.programSearch.queryOptions({ q }), enabled: q.trim().length >= 2 })
  const submit = useMutation(trpc.coach.submitProfile.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.coach.profile.queryKey() }) }))
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  if (submit.isSuccess) {
    return (
      <Alert tone="success" focusOnMount>
        Check {form.workEmail} for a confirmation link. After you confirm, our staff checks your program staff directory, usually within 2 business
        days.
      </Alert>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (program) submit.mutate({ ...form, collegeId: program.id })
      }}
    >
      {submit.isError && (
        <Alert tone="error" focusOnMount>
          {errorMessage(submit.error)}
        </Alert>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" name="coachFirstName" required>
          {(p) => <TextInput {...p} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />}
        </Field>
        <Field label="Last name" name="coachLastName" required>
          {(p) => <TextInput {...p} autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />}
        </Field>
      </div>
      <Field label="Title" name="coachTitle" required hint="As it appears on your staff directory, for example Assistant Coach / Recruiting Coordinator.">
        {(p) => <TextInput {...p} autoComplete="organization-title" value={form.title} onChange={set('title')} />}
      </Field>
      <div className="flex flex-col gap-2">
        <Field label="Program" name="coachProgramSearch" required hint={program ? `Selected: ${program.schoolName} (${program.division})` : 'Type at least two letters of your school name.'}>
          {(p) => <TextInput {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
        </Field>
        {programs.isFetching && <Spinner label="Searching programs" />}
        {programs.data && programs.data.length === 0 && <p className="text-sm text-fg-muted">No program matches. Contact us to add your program.</p>}
        <ul className="flex flex-wrap gap-2">
          {programs.data?.map((p) => (
            <li key={p.id}>
              <Button size="sm" variant={program?.id === p.id ? 'primary' : 'secondary'} aria-pressed={program?.id === p.id} onClick={() => setProgram(p)}>
                {p.schoolName} ({p.division}
                {p.state ? `, ${p.state}` : ''})
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <Field label="School email" name="coachWorkEmail" required hint="Ends in .edu or your athletic department's domain. We send a confirmation link here.">
        {(p) => <TextInput {...p} type="email" autoComplete="email" value={form.workEmail} onChange={set('workEmail')} />}
      </Field>
      <Field label="Staff directory page" name="coachDirectory" required hint="The https:// link to your program's staff page that lists you.">
        {(p) => <TextInput {...p} type="url" value={form.staffDirectoryUrl} onChange={set('staffDirectoryUrl')} />}
      </Field>
      <Button type="submit" disabled={!program || submit.isPending} className="self-start">
        {submit.isPending ? <Spinner label="Submitting" /> : null}
        Submit for verification
      </Button>
    </form>
  )
}
