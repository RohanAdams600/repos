'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

function TeamDecision({ teamId, pending, onDone }: { teamId: string; pending: boolean; onDone: () => void }) {
  const trpc = useTRPC()
  const decide = useMutation(trpc.admin.decideTeam.mutationOptions({ onSuccess: onDone }))
  const [note, setNote] = useState('')
  const [revoke, setRevoke] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {decide.isError && <Alert tone="error">{errorMessage(decide.error)}</Alert>}
      <Field label="Note to the coach" name={`team-note-${teamId}`} hint="Required to reject or suspend.">
        {(p) => <TextInput {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {!pending && (
        <Checkbox
          name={`team-revoke-${teamId}`}
          checked={revoke}
          onChange={(e) => setRevoke(e.target.checked)}
          label="When suspending, also remove the coach-recorded label from every value this team recorded (athletes keep the numbers as self-reported)."
        />
      )}
      <div className="flex flex-wrap gap-3">
        {pending && (
          <>
            <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ teamId, decision: 'VERIFIED', note: note || null, revokeRecorded: false })}>
              Approve team
            </Button>
            <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ teamId, decision: 'REJECTED', note: note || null, revokeRecorded: false })}>
              Reject
            </Button>
          </>
        )}
        <Button size="sm" variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ teamId, decision: 'SUSPENDED', note: note || null, revokeRecorded: revoke })}>
          Suspend
        </Button>
      </div>
    </div>
  )
}

export function TeamAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const queue = useQuery(trpc.admin.teamQueue.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.teamQueue.queryKey() })

  return (
    <section aria-labelledby="team-admin-title" className="flex flex-col gap-4">
      <h2 id="team-admin-title" className="text-2xl font-bold">
        Team verification
      </h2>
      <p className="text-fg-muted">
        Approve only when the linked school athletics or club page lists this person with the same name and a coaching title for this team.
        Approved coaches can add minors to a roster (with guardian approval) and record values that carry a coach-recorded label.
      </p>
      {queue.isPending && <Spinner label="Loading teams" />}
      {queue.isError && <Alert tone="error">{errorMessage(queue.error)}</Alert>}
      {queue.data?.waiting.length === 0 && <EmptyState title="No teams waiting">Teams appear here when a high school or travel coach submits one.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {queue.data?.waiting.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
            <p className="font-bold">{t.name}</p>
            <p className="text-sm text-fg-muted">
              {t.orgType === 'HIGH_SCHOOL' ? 'High school' : 'Club'}: {t.organization}, {t.state}. Coach {t.coachName}, {t.coachTitle}. Account {t.coach.email}.
            </p>
            <a href={t.directoryUrl} target="_blank" rel="noopener noreferrer nofollow" className="self-start font-bold">
              Open staff page
            </a>
            <TeamDecision teamId={t.id} pending onDone={() => void refresh()} />
          </li>
        ))}
      </ul>
      {queue.data && queue.data.verified.length > 0 && (
        <details className="border-2 border-border-subtle p-4">
          <summary className="cursor-pointer font-bold">Approved teams ({queue.data.verified.length})</summary>
          <ul className="mt-4 flex flex-col gap-4">
            {queue.data.verified.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 border-t-2 border-border-subtle pt-4">
                <p>
                  <span className="font-bold">{t.name}</span>{' '}
                  <span className="text-fg-muted">
                    {t.organization}, coach {t.coachName}. <span className="tabular">{t.activeMembers}</span> players.
                  </span>
                </p>
                <TeamDecision teamId={t.id} pending={false} onDone={() => void refresh()} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
