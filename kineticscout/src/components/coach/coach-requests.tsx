'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { OpenThreadButton } from '@/components/messages/open-thread-button'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useLocale, useMessages } from '@/i18n/client'
import { connectionsMessages } from '@/i18n/messages/connections'
import { formatDay } from '@/i18n/messages/domain'
import { errorMessage, useTRPC } from '@/trpc/client'

export function CoachRequests() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const requests = useQuery(trpc.coach.requests.queryOptions())
  const withdraw = useMutation(trpc.coach.withdraw.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.coach.requests.queryKey() }) }))
  const m = useMessages(connectionsMessages).requests
  const locale = useLocale()
  if (requests.isPending) return <Spinner label={m.loading} />
  if (requests.isError) return <Alert tone="error">{errorMessage(requests.error)}</Alert>
  if (requests.data.length === 0) return <EmptyState title={m.coachEmptyTitle}>{m.coachEmptyBody}</EmptyState>
  return (
    <ul className="flex flex-col gap-4">
      {withdraw.isError && <Alert tone="error">{errorMessage(withdraw.error)}</Alert>}
      {requests.data.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold">{m.athleteLine(`${r.athlete.firstName} ${r.athlete.lastName}`, r.athlete.gradYear)}</p>
            <p className="text-sm text-fg-muted">{m.sent(formatDay(new Date(r.createdAt), locale, 'short'))}</p>
          </div>
          <p className="text-sm font-bold">{m.coachStatus[r.status]}</p>
          {r.status === 'ACCEPTED' && r.sharedEmails.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-fg-muted">{r.guardianRequired ? m.both : m.athleteEmail}</p>
              <ul className="flex flex-col gap-1">
                {r.sharedEmails.map((e) => (
                  <li key={e}>
                    <a href={`mailto:${e}`}>{e}</a>
                  </li>
                ))}
              </ul>
              <OpenThreadButton contactRequestId={r.id} label={m.messageOn(r.athlete.firstName)} />
            </div>
          )}
          {r.status === 'ACCEPTED' && r.sharedEmails.length === 0 && <p className="text-sm text-fg-muted">{m.noLonger}</p>}
          {r.athlete.publicSlug && (
            <Link href={`/p/${r.athlete.publicSlug}`} target="_blank" className="self-start text-sm font-bold">
              {m.profile}
            </Link>
          )}
          {(r.status === 'PENDING' || r.status === 'ATHLETE_ACCEPTED') && (
            <Button size="sm" variant="ghost" className="self-start" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ id: r.id })}>
              {m.withdraw}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
