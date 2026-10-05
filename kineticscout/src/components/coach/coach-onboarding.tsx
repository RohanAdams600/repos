'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { coachMessages } from '@/i18n/messages/coach'
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

  const m = useMessages(coachMessages).onboarding
  if (submit.isSuccess) {
    return (
      <Alert tone="success" focusOnMount>
        {m.checkEmail(form.workEmail)}
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
        <Field label={m.firstName} name="coachFirstName" required>
          {(p) => <TextInput {...p} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />}
        </Field>
        <Field label={m.lastName} name="coachLastName" required>
          {(p) => <TextInput {...p} autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />}
        </Field>
      </div>
      <Field label={m.title} name="coachTitle" required hint={m.titleHint}>
        {(p) => <TextInput {...p} autoComplete="organization-title" value={form.title} onChange={set('title')} />}
      </Field>
      <div className="flex flex-col gap-2">
        <Field label={m.program} name="coachProgramSearch" required hint={program ? m.selected(program.schoolName, program.division) : m.typeTwo}>
          {(p) => <TextInput {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
        </Field>
        {programs.isFetching && <Spinner label={m.searching} />}
        {programs.data && programs.data.length === 0 && <p className="text-sm text-fg-muted">{m.noMatch}</p>}
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
      <Field label={m.email} name="coachWorkEmail" required hint={m.emailHint}>
        {(p) => <TextInput {...p} type="email" autoComplete="email" value={form.workEmail} onChange={set('workEmail')} />}
      </Field>
      <Field label={m.directory} name="coachDirectory" required hint={m.directoryHint}>
        {(p) => <TextInput {...p} type="url" value={form.staffDirectoryUrl} onChange={set('staffDirectoryUrl')} />}
      </Field>
      <Button type="submit" disabled={!program || submit.isPending} className="self-start">
        {submit.isPending ? <Spinner label={m.submitting} /> : null}
        {m.submit}
      </Button>
    </form>
  )
}
