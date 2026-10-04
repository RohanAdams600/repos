'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OpenThreadButton } from '@/components/messages/open-thread-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { useLocale, useMessages } from '@/i18n/client'
import { connectionsMessages } from '@/i18n/messages/connections'
import { formatDay } from '@/i18n/messages/domain'
import { UiText } from '@/components/ui/ui-text'
import { errorMessage, useTRPC } from '@/trpc/client'

function ReportDialog({ coachId, coachName }: { coachId: string; coachName: string }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const report = useMutation(trpc.contactRequests.report.mutationOptions())
  const m = useMessages(connectionsMessages).requests
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {m.report}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={m.reportTitle(coachName)} description={m.reportIntro}>
        {report.isSuccess ? (
          <Alert tone="success" focusOnMount>
            {m.reportThanks}
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
              {m.whatHappened} <span className="font-normal text-fg-muted"><UiText k="required" /></span>
            </label>
            <textarea id={`report-${coachId}`} rows={5} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-sm border-2 border-border-strong bg-bg p-3" />
            <Button type="submit" variant="danger" className="self-start" disabled={report.isPending}>
              {m.sendReport}
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
  const m = useMessages(connectionsMessages).requests
  const locale = useLocale()
  const day = (iso: string) => formatDay(new Date(iso), locale, 'short')
  if (requests.isPending) return <Spinner label={m.loading} />
  if (requests.isError) return <Alert tone="error">{errorMessage(requests.error)}</Alert>
  if (requests.data.length === 0) {
    return <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>
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
                {m.verified(r.coach.college?.schoolName ?? '', r.coach.college?.division ?? '', r.coach.reviewedAt ? day(r.coach.reviewedAt) : null, day(r.createdAt))}
              </p>
            </div>
            <p className="border-l-4 border-border-strong pl-3 whitespace-pre-wrap">{r.message}</p>
            {r.status === 'PENDING' ? (
              <>
                <p className="text-sm text-fg-muted">
                  {r.guardianRequired ? m.ifGuardian : m.ifAccept}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'accept' })}>
                    {m.accept}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'decline' })}>
                    {m.decline}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, decision: 'decline', block: true })}>
                    {m.declineBlock}
                  </Button>
                  <ReportDialog coachId={r.coach.userId} coachName={coachName} />
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-bold">{m.athleteStatus[r.status]}</p>
                {r.contactShared && !r.coach.blocked && <OpenThreadButton contactRequestId={r.id} label={m.message(coachName)} />}
                {r.coach.blocked ? (
                  <Button size="sm" variant="ghost" onClick={() => unblock.mutate({ coachId: r.coach.userId })}>
                    {m.unblock}
                  </Button>
                ) : (
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" disabled={block.isPending}>
                        {m.block}
                      </Button>
                    }
                    title={m.blockTitle(coachName)}
                    description={m.blockBody}
                    confirmLabel={m.block}
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
