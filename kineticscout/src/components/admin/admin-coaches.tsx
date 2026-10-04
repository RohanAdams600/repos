'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

function Decision({ coachId, allowVerify, onDone }: { coachId: string; allowVerify: boolean; onDone: () => void }) {
  const trpc = useTRPC()
  const decide = useMutation(trpc.admin.decideCoach.mutationOptions({ onSuccess: onDone }))
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-col gap-3">
      {decide.isError && <Alert tone="error">{errorMessage(decide.error)}</Alert>}
      <Field label="Note to the coach" name={`coach-note-${coachId}`} hint="Required to reject or suspend.">
        {(p) => <TextInput {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-3">
        {allowVerify && (
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ coachId, decision: 'VERIFIED', note: note || null })}>
            Verify coach
          </Button>
        )}
        {allowVerify ? (
          <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ coachId, decision: 'REJECTED', note: note || null })}>
            Reject
          </Button>
        ) : null}
        <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ coachId, decision: 'SUSPENDED', note: note || null })}>
          Suspend
        </Button>
      </div>
    </div>
  )
}

export function CoachAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const queue = useQuery(trpc.admin.coachQueue.queryOptions())
  const reports = useQuery(trpc.admin.coachReports.queryOptions())
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.admin.coachQueue.queryKey() })
    void queryClient.invalidateQueries({ queryKey: trpc.admin.coachReports.queryKey() })
  }
  const resolve = useMutation(trpc.admin.resolveCoachReport.mutationOptions({ onSuccess: refresh }))
  const [resolutions, setResolutions] = useState<Record<string, string>>({})

  return (
    <section aria-labelledby="coach-admin-title" className="flex flex-col gap-4">
      <h2 id="coach-admin-title" className="text-2xl font-bold">
        Coach verification
      </h2>
      <p className="text-fg-muted">
        Verify only when the program&apos;s official staff directory lists this person with the same name and title, and the school email was
        confirmed. Coaches can search and contact minors once verified.
      </p>
      {queue.isPending && <Spinner label="Loading coaches" />}
      {queue.isError && <Alert tone="error">{errorMessage(queue.error)}</Alert>}
      {queue.data?.waiting.length === 0 && <EmptyState title="No coaches waiting">Coaches appear here after confirming their school email.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {queue.data?.waiting.map((c) => (
          <li key={c.userId} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
            <p className="font-bold">
              {c.firstName} {c.lastName}, {c.title}
            </p>
            <p className="text-sm text-fg-muted">
              {c.college?.schoolName} ({c.college?.division}). School email {c.workEmail}, confirmed {c.workEmailVerifiedAt?.toISOString().slice(0, 10)}.
            </p>
            {c.staffDirectoryUrl && (
              <a href={c.staffDirectoryUrl} target="_blank" rel="noopener noreferrer nofollow" className="self-start font-bold">
                Open staff directory
              </a>
            )}
            <Decision coachId={c.userId} allowVerify onDone={refresh} />
          </li>
        ))}
      </ul>

      <h3 className="text-lg font-bold">Open reports</h3>
      {reports.data?.length === 0 && <p className="text-fg-muted">No open reports.</p>}
      <ul className="flex flex-col gap-4">
        {reports.data?.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 border-2 border-danger p-4">
            <p className="font-bold">
              {r.coach.firstName} {r.coach.lastName}, {r.coach.title} at {r.coach.college?.schoolName ?? 'unknown program'} ({r.coach.status.toLowerCase()})
            </p>
            <p className="text-sm text-fg-muted">
              Reported by {r.reporter.athleteProfile?.firstName ?? 'an athlete'}
              {r.reporter.athleteProfile ? `, class of ${r.reporter.athleteProfile.gradYear}` : ''} on {r.createdAt.toISOString().slice(0, 10)}.
            </p>
            <p className="whitespace-pre-wrap">{r.reason}</p>
            {r.coach.status !== 'SUSPENDED' && <Decision coachId={r.coach.userId} allowVerify={false} onDone={refresh} />}
            <Field label="Resolution" name={`resolution-${r.id}`} required>
              {(p) => <TextInput {...p} value={resolutions[r.id] ?? ''} onChange={(e) => setResolutions({ ...resolutions, [r.id]: e.target.value })} />}
            </Field>
            <Button size="sm" variant="secondary" className="self-start" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, resolution: resolutions[r.id] ?? '' })}>
              Mark resolved
            </Button>
          </li>
        ))}
      </ul>

      <h3 className="text-lg font-bold">Recently verified or suspended</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {queue.data?.recent.map((c) => (
          <li key={c.userId}>
            {c.firstName} {c.lastName}, {c.college?.schoolName ?? 'no program'}: {c.status.toLowerCase()}
            {c._count.reports ? `, ${c._count.reports} open report${c._count.reports === 1 ? '' : 's'}` : ''}
          </li>
        ))}
      </ul>
    </section>
  )
}
