'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Select, TextInput, inputClass } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { POSITIONS_BY_SPORT, type Position } from '@/lib/athletes/positions'
import { errorMessage, useTRPC } from '@/trpc/client'

type Program = {
  id: string
  schoolName: string
  sport: 'BASEBALL' | 'HOCKEY' | 'FOOTBALL'
  division: string
  headCoachName: string | null
  headCoachEmail: string | null
  headCoachSince: Date | string | null
  headCoachBackground: string | null
  recentSeasonSummary: string | null
  dataSourceUrl: string | null
}

function StaffForm({ program, onSaved }: { program: Program; onSaved: () => void }) {
  const trpc = useTRPC()
  const save = useMutation(trpc.admin.updateProgramStaff.mutationOptions({ onSuccess: onSaved }))
  const [form, setForm] = useState({
    headCoachName: program.headCoachName ?? '',
    headCoachEmail: program.headCoachEmail ?? '',
    headCoachSince: program.headCoachSince ? new Date(program.headCoachSince).toISOString().slice(0, 10) : '',
    headCoachBackground: program.headCoachBackground ?? '',
    recentSeasonSummary: program.recentSeasonSummary ?? '',
    sourceUrl: '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value })
  return (
    <form
      className="flex flex-col gap-4 border-2 border-border-subtle p-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({
          programId: program.id,
          headCoachName: form.headCoachName || null,
          headCoachEmail: form.headCoachEmail || null,
          headCoachSince: form.headCoachSince || null,
          headCoachBackground: form.headCoachBackground || null,
          recentSeasonSummary: form.recentSeasonSummary || null,
          sourceUrl: form.sourceUrl,
        })
      }}
    >
      <h3 className="text-lg font-bold">Coaching staff and results</h3>
      <p className="text-sm text-fg-muted">
        Enter only facts published by the school or another reliable source, and link it. A new head coach name alerts every Pro athlete
        watching this program, and outreach drafts may quote the background and results text.
      </p>
      {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {save.data && <Alert tone="success">{save.data.changeId ? 'Saved. Head coach change recorded; watching athletes are being alerted.' : 'Saved.'}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Head coach" name="headCoachName">
          {(p) => <TextInput {...p} value={form.headCoachName} onChange={set('headCoachName')} />}
        </Field>
        <Field label="Head coach email" name="headCoachEmail">
          {(p) => <TextInput {...p} type="email" value={form.headCoachEmail} onChange={set('headCoachEmail')} />}
        </Field>
      </div>
      <Field label="Head coach since (YYYY-MM-DD)" name="headCoachSince">
        {(p) => <TextInput {...p} value={form.headCoachSince} onChange={set('headCoachSince')} className="tabular" />}
      </Field>
      <Field label="Coach background" name="headCoachBackground" hint="Previous positions, playing career, stated approach. Facts only, up to 1,500 characters.">
        {(p) => <textarea {...p} rows={4} maxLength={1500} value={form.headCoachBackground} onChange={set('headCoachBackground')} className={`${inputClass} py-2`} />}
      </Field>
      <Field label="Recent results" name="recentSeasonSummary" hint="For example: 2026: 38-21, won the conference tournament.">
        {(p) => <TextInput {...p} maxLength={600} value={form.recentSeasonSummary} onChange={set('recentSeasonSummary')} />}
      </Field>
      <Field label="Source link (https)" name="sourceUrl" required>
        {(p) => <TextInput {...p} type="url" value={form.sourceUrl} onChange={set('sourceUrl')} />}
      </Field>
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? <Spinner label="Saving" /> : null}
        Save program data
      </Button>
    </form>
  )
}

function RosterNeedForm({ program }: { program: Program }) {
  const trpc = useTRPC()
  const post = useMutation(trpc.admin.postRosterNeed.mutationOptions())
  const [form, setForm] = useState({ position: '', gradYear: '', note: '', sourceUrl: '', postedAt: new Date().toISOString().slice(0, 10), expiresAt: '' })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })
  return (
    <form
      className="flex flex-col gap-4 border-2 border-border-subtle p-4"
      onSubmit={(e) => {
        e.preventDefault()
        post.mutate({
          programId: program.id,
          position: (form.position || null) as Position | null,
          gradYear: form.gradYear ? Number(form.gradYear) : null,
          note: form.note,
          sourceUrl: form.sourceUrl,
          postedAt: form.postedAt,
          expiresAt: form.expiresAt || null,
        })
      }}
    >
      <h3 className="text-lg font-bold">Post a roster need</h3>
      {post.isError && <Alert tone="error">{errorMessage(post.error)}</Alert>}
      {post.isSuccess && <Alert tone="success">Roster need posted. Matching athletes are being alerted.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Position" name="needPosition">
          {(p) => (
            <Select {...p} value={form.position} onChange={set('position')}>
              <option value="">Any position</option>
              {POSITIONS_BY_SPORT[program.sport].map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Class (graduation year)" name="needGradYear">
          {(p) => <TextInput {...p} inputMode="numeric" value={form.gradYear} onChange={set('gradYear')} className="tabular" />}
        </Field>
      </div>
      <Field label="What the program posted" name="needNote" required>
        {(p) => <TextInput {...p} maxLength={300} value={form.note} onChange={set('note')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Source link (https)" name="needSource" required className="sm:col-span-3">
          {(p) => <TextInput {...p} type="url" value={form.sourceUrl} onChange={set('sourceUrl')} />}
        </Field>
        <Field label="Posted on" name="needPosted" required>
          {(p) => <TextInput {...p} value={form.postedAt} onChange={set('postedAt')} className="tabular" />}
        </Field>
        <Field label="Expires on" name="needExpires">
          {(p) => <TextInput {...p} value={form.expiresAt} onChange={set('expiresAt')} className="tabular" />}
        </Field>
      </div>
      <Button type="submit" disabled={post.isPending} className="self-start">
        Post roster need
      </Button>
    </form>
  )
}

export function ProgramDataAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Program | null>(null)
  const search = useQuery({ ...trpc.admin.programSearch.queryOptions({ q }), enabled: q.trim().length >= 2 })
  const changes = useQuery(trpc.admin.recentProgramChanges.queryOptions())
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.admin.programSearch.queryKey() })
    void queryClient.invalidateQueries({ queryKey: trpc.admin.recentProgramChanges.queryKey() })
  }
  return (
    <section aria-labelledby="programs-admin-title" className="flex flex-col gap-4">
      <h2 id="programs-admin-title" className="text-2xl font-bold">
        Program data (recruiting assistant)
      </h2>
      <Field label="Find a program" name="programSearch">
        {(p) => <TextInput {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}
      </Field>
      {search.isFetching && <Spinner label="Searching" />}
      {search.data && search.data.length === 0 && <p className="text-fg-muted">No programs match.</p>}
      {search.data && search.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {search.data.map((p) => (
            <li key={p.id}>
              <Button variant={selected?.id === p.id ? 'primary' : 'secondary'} size="sm" onClick={() => setSelected(p)}>
                {p.schoolName} ({p.division})
              </Button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div key={selected.id} className="flex flex-col gap-4">
          <StaffForm program={selected} onSaved={refresh} />
          <RosterNeedForm program={selected} />
        </div>
      )}
      <h3 className="text-lg font-bold">Recent changes</h3>
      {changes.data?.length === 0 && <EmptyState title="No changes yet">Coaching changes and roster needs appear here once recorded.</EmptyState>}
      <ul className="flex flex-col gap-1 text-sm">
        {changes.data?.map((c) => (
          <li key={c.id}>
            <span className="tabular">{c.detectedAt.slice(0, 10)}</span> {c.college.schoolName}: {c.kind === 'HEAD_COACH_CHANGED' ? 'new head coach' : 'roster need'}.{' '}
            {c.processedAt ? `Processed, ${c._count.drafts} drafts.` : 'Waiting for the worker.'}
          </li>
        ))}
      </ul>
    </section>
  )
}
