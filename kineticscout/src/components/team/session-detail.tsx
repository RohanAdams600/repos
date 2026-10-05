'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { formatMetric } from '@/lib/metrics/definitions'
import { useMessages } from '@/i18n/client'
import { coachMessages } from '@/i18n/messages/coach'
import { domainMessages } from '@/i18n/messages/domain'
import { errorMessage, useTRPC } from '@/trpc/client'

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const session = useQuery(trpc.team.session.queryOptions({ sessionId }))
  const withdraw = useMutation(trpc.team.withdrawEntry.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.team.session.queryKey({ sessionId }) }) }))

  const m = useMessages(coachMessages).testing
  const d = useMessages(domainMessages)
  if (session.isPending) return <Spinner label={m.loadingResults} />
  if (session.isError) return <Alert tone="error">{errorMessage(session.error)}</Alert>
  const s = session.data
  return (
    <div className="flex flex-col gap-6">
      <p className="text-fg-muted">{m.sessionIntro(s.team.name, s.date, s.location)}</p>
      {withdraw.isError && <Alert tone="error">{errorMessage(withdraw.error)}</Alert>}
      <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
        {s.entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <span>
              <span className="font-bold">
                {e.athlete.firstName} {e.athlete.lastName}
              </span>{' '}
              <span className="text-fg-muted">{d.metric[e.metricType]}</span>{' '}
              <span className="tabular font-bold">{formatMetric(e.metricType, e.value)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <span className="text-sm">{m.entryStatus[e.status]}</span>
              {e.status === 'PENDING' && (
                <Button size="sm" variant="ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ entryId: e.id })}>
                  {m.withdraw}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
