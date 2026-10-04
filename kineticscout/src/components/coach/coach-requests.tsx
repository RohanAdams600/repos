'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { OpenThreadButton } from '@/components/messages/open-thread-button'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

const STATUS: Record<string, string> = {
  PENDING: 'Waiting for the athlete',
  ATHLETE_ACCEPTED: 'Accepted by the athlete, waiting for a parent or guardian',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired without an answer',
}

export function CoachRequests() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const requests = useQuery(trpc.coach.requests.queryOptions())
  const withdraw = useMutation(trpc.coach.withdraw.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.coach.requests.queryKey() }) }))
  if (requests.isPending) return <Spinner label="Loading requests" />
  if (requests.isError) return <Alert tone="error">{errorMessage(requests.error)}</Alert>
  if (requests.data.length === 0) return <EmptyState title="No requests yet">Send a contact request from prospect search or your saved prospects.</EmptyState>
  return (
    <ul className="flex flex-col gap-4">
      {withdraw.isError && <Alert tone="error">{errorMessage(withdraw.error)}</Alert>}
      {requests.data.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold">
              {r.athlete.firstName} {r.athlete.lastName}, class of <span className="tabular">{r.athlete.gradYear}</span>
            </p>
            <p className="text-sm text-fg-muted">
              Sent <span className="tabular">{r.createdAt.slice(0, 10)}</span>
            </p>
          </div>
          <p className="text-sm font-bold">{STATUS[r.status]}</p>
          {r.status === 'ACCEPTED' && r.sharedEmails.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-fg-muted">{r.guardianRequired ? 'Athlete and parent or guardian. Include both in every message.' : 'Athlete email:'}</p>
              <ul className="flex flex-col gap-1">
                {r.sharedEmails.map((e) => (
                  <li key={e}>
                    <a href={`mailto:${e}`}>{e}</a>
                  </li>
                ))}
              </ul>
              <OpenThreadButton contactRequestId={r.id} label={`Message ${r.athlete.firstName} on KineticScout`} />
            </div>
          )}
          {r.status === 'ACCEPTED' && r.sharedEmails.length === 0 && <p className="text-sm text-fg-muted">Contact details are no longer shared. The athlete or their parent or guardian withdrew them.</p>}
          {r.athlete.publicSlug && (
            <Link href={`/p/${r.athlete.publicSlug}`} target="_blank" className="self-start text-sm font-bold">
              Profile
            </Link>
          )}
          {(r.status === 'PENDING' || r.status === 'ATHLETE_ACCEPTED') && (
            <Button size="sm" variant="ghost" className="self-start" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ id: r.id })}>
              Withdraw request
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
