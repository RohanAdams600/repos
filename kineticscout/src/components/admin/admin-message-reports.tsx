'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'
import { errorMessage, useTRPC } from '@/trpc/client'

const REPORTER = { ATHLETE: 'the athlete', COACH: 'the coach', GUARDIAN: 'a parent or guardian' } as const

function Resolve({ reportId, onDone }: { reportId: string; onDone: () => void }) {
  const trpc = useTRPC()
  const resolve = useMutation(trpc.admin.resolveMessageReport.mutationOptions({ onSuccess: onDone }))
  const [resolution, setResolution] = useState('')
  const [close, setClose] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      {resolve.isError && <Alert tone="error">{errorMessage(resolve.error)}</Alert>}
      <Field label="What you did" name={`resolution-${reportId}`} required hint="Kept on record. Suspend a coach from Coach verification above.">
        {(p) => <TextInput {...p} maxLength={500} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
      </Field>
      <Checkbox name={`close-${reportId}`} checked={close} onChange={(e) => setClose(e.target.checked)} label="End this conversation" />
      <Button size="sm" className="self-start" disabled={resolve.isPending} onClick={() => resolve.mutate({ reportId, resolution, closeThread: close })}>
        Resolve report
      </Button>
    </div>
  )
}

export function MessageReportsAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [show, setShow] = useState(false)
  const reports = useQuery({ ...trpc.admin.messageReports.queryOptions(), enabled: show })
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.messageReports.queryKey() })

  return (
    <section aria-labelledby="message-reports-title" className="flex flex-col gap-4">
      <h2 id="message-reports-title" className="text-2xl font-bold">
        Message reports
      </h2>
      <p className="text-fg-muted">
        Reported messages are shown with up to five messages either side. Opening this list is recorded in the audit log, because these are private
        conversations, often with minors.
      </p>
      {!show ? (
        <Button variant="secondary" className="self-start" onClick={() => setShow(true)}>
          Show open reports
        </Button>
      ) : (
        <>
          {reports.isPending && <Spinner label="Loading reports" />}
          {reports.isError && <Alert tone="error">{errorMessage(reports.error)}</Alert>}
          {reports.data?.length === 0 && <EmptyState title="No open reports">Reports from athletes, coaches and parents appear here.</EmptyState>}
          <ul className="flex flex-col gap-6">
            {reports.data?.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
                <p className="font-bold">
                  {r.thread.coach} and {r.thread.athlete}
                  {r.thread.guardianCopy ? ' (athlete under 18 at contact)' : ''}
                </p>
                <p className="text-sm text-fg-muted">
                  Reported by {REPORTER[r.reporterKind]} on <span className="tabular">{r.createdAt.slice(0, 10)}</span>: {r.reason}
                </p>
                <ol aria-label="Messages around the report" className="flex flex-col gap-2">
                  {r.context.map((m) => (
                    <li key={m.id} className={cn('border-2 p-3', m.id === r.reportedMessageId ? 'border-danger' : 'border-border-subtle')}>
                      <p className="text-sm font-bold">
                        {m.fromCoach ? 'Coach' : 'Athlete'} <span className="tabular font-normal text-fg-muted">{m.createdAt.slice(0, 16).replace('T', ' ')}</span>
                        {m.id === r.reportedMessageId ? ' (reported)' : ''}
                      </p>
                      <p className="break-words whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ol>
                <Resolve reportId={r.id} onDone={() => void refresh()} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
