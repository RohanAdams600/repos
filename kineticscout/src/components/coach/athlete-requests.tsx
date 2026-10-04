'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

const STATUS: Record<string, string> = {
  ATHLETE_ACCEPTED: 'You accepted. Waiting for your parent or guardian to approve.',
  ACCEPTED: 'Accepted. The coach has your email address.',
  DECLINED: 'Declined. Nothing was shared.',
  WITHDRAWN: 'The coach withdrew this request.',
  EXPIRED: 'Expired without an answer.',
}

function ReportDialog({ coachId, coachName }: { coachId: string; coachName: string }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const report = useMutation(trpc.contactRequests.report.mutationOptions())
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Report
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={`Report ${coachName}`} description="Tell us what happened. Our staff reviews every report and can suspend a coach.">
        {report.isSuccess ? (
          <Alert tone="success" focusOnMount>
            Thank you. We will review this report. If you feel unsafe, also tell a parent, guardian or school staff member.
          </Alert>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              report.mutate({ coachId, reason })
            }}
          >
            {report.isError && <Alert tone="error">{errorMessage(report.error)}</Alert>}
            <label htmlFor={`report-${coachId}`} className="font-bold">
              What happened? <span className="font-normal text-fg-muted">(required)</span>
            </label>
            <textarea id={`report-${coachId}`} rows={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-sm border-2 border-border-strong bg-bg p-3" />
            <Button type="submit" variant="danger" className="self-start" disabled={report.isPending}>
              Send report
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}

export function AthleteRequests() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const requests = useQuery(trpc.contactRequests.list.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.contactRequests.list.queryKey() })
  const respond = useMutation(trpc.contactRequests.respond.mutationOptions({ onSuccess: refresh }))
  const unblock = useMutation(trpc.contactRequests.unblock.mutationOptions({ onSuccess: refresh }))
  const block = useMutation(trpc.contactRequests.block.mutationOptions({ onSuccess: refresh }))
  if (requests.isPending) return <Spinner label="Loading requests" />
  if (requests.isError) return <Alert tone="error">{errorMessage(requests.error)}</Alert>
  if (requests.data.length === 0) {
    return <EmptyState title="No contact requests">When a verified college coach asks to contact you, the request appears here. Coaches can only find you if your profile is public.</EmptyState>
  }
  return (
    <ul className="flex flex-col gap-4">
      {respond.isError && <Alert tone="error">{errorMessage(respond.error)}</Alert>}
      {requests.data.map((r) => {
        const coachName = `${r.coach.firstName} ${r.coach.lastName}`
        return (
          <li key={r.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
            <div className="flex flex-col gap-1">
              <p className="font-bold">
                {coachName}, {r.coach.title}
              </p>
              <p className="text-sm text-fg-muted">
                {r.coach.college?.schoolName} ({r.coach.college?.division}). Verified by KineticScout staff
                {r.coach.reviewedAt ? ` on ${r.coach.reviewedAt.slice(0, 10)}` : ''}. Sent <span className="tabular">{r.createdAt.slice(0, 10)}</span>.
              </p>
            </div>
            <p className="border-l-4 border-border-strong pl-3 whitespace-pre-wrap">{r.message}</p>
            {r.status === 'PENDING' ? (
              <>
                <p className="text-sm text-fg-muted">
                  {r.guardianRequired
                    ? 'If you accept, your parent or guardian is asked to approve before the coach gets your email address and theirs.'
                    : 'If you accept, the coach gets your email address.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'accept' })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'decline' })}>
                    Decline
                  </Button>
                  <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'decline', block: true })}>
                    Decline and block
                  </Button>
                  <ReportDialog coachId={r.coach.userId} coachName={coachName} />
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-bold">{STATUS[r.status]}</p>
                {r.coach.blocked ? (
                  <Button size="sm" variant="ghost" onClick={() => unblock.mutate({ coachId: r.coach.userId })}>
                    Unblock coach
                  </Button>
                ) : (
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" disabled={block.isPending}>
                        Block coach
                      </Button>
                    }
                    title={`Block ${coachName}?`}
                    description="They will no longer find you in search or be able to send you requests, and any email address you shared is removed from their KineticScout page. If they already wrote it down, they keep it. You can unblock them later."
                    confirmLabel="Block coach"
                    tone="danger"
                    onConfirm={() => block.mutate({ coachId: r.coach.userId })}
                  />
                )}
                <ReportDialog coachId={r.coach.userId} coachName={coachName} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
