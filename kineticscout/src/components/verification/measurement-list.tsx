'use client'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CoachRecordedBadge } from '@/components/profile/coach-recorded-badge'
import { VerifiedBadge } from '@/components/profile/verified-badge'
import { EvidenceUpload } from '@/components/verification/evidence-upload'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { formatMetric } from '@/lib/metrics/definitions'
import { REJECTION_LABELS } from '@/lib/verification/policy'
import { useMessages } from '@/i18n/client'
import { domainMessages } from '@/i18n/messages/domain'
import { metricsMessages } from '@/i18n/messages/metrics'
import { useServerText } from '@/i18n/server-text-client'
import { errorMessage, useTRPC } from '@/trpc/client'

export function MeasurementList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)
  const m = useMessages(metricsMessages).list
  const d = useMessages(domainMessages)
  const serverText = useServerText()
  const query = useInfiniteQuery(
    trpc.metrics.entries.infiniteQueryOptions(
      { limit: 20 },
      {
        getNextPageParam: (last) => last.nextCursor,
        refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((i) => i.verification?.status === 'CHECKING')) ? 5_000 : false),
      },
    ),
  )
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.metrics.entries.queryKey() })

  if (query.isPending) return <Spinner label={m.loading} />
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>
  if (items.length === 0) return <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
        {items.map((item) => {
          const label = d.metric[item.metricType]
          const status = item.verification?.status
          const canSubmit = !item.verified && status !== 'CHECKING' && status !== 'IN_REVIEW'
          return (
            <li key={item.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{label}</span>
                  <span className="text-sm text-fg-muted">
                    {m.measured} <span className="tabular">{item.date}</span>
                    {item.coachRecorded && item.recordedBy ? m.recordedBy(item.recordedBy.replace(/ on \d{4}-\d{2}-\d{2}$/, '')) : null}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular text-xl font-bold">{formatMetric(item.metricType, item.value)}</span>
                  {item.verified && <VerifiedBadge />}
                  {item.coachRecorded && <CoachRecordedBadge />}
                  {item.verified ? null : status === 'CHECKING' ? (
                    <span className="text-sm">{m.checking}</span>
                  ) : status === 'IN_REVIEW' ? (
                    <span className="text-sm">{m.waiting}</span>
                  ) : null}
                  {canSubmit && (
                    <Button size="sm" variant="secondary" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                      {open === item.id ? m.close : status === 'REJECTED' ? m.resend : m.verify}
                    </Button>
                  )}
                </div>
              </div>
              {status === 'REJECTED' && item.verification?.rejectionReason && (
                <p className="text-sm text-fg-muted">
                  {m.notVerified} {serverText(REJECTION_LABELS[item.verification.rejectionReason])}
                  {item.verification.reviewerNote ? m.reviewerNote(item.verification.reviewerNote) : ''}
                </p>
              )}
              {open === item.id && canSubmit && (
                <EvidenceUpload
                  metricId={item.id}
                  metricLabel={label}
                  onDone={() => {
                    void refresh()
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="self-start">
          {query.isFetchingNextPage ? m.loadingMore : m.loadMore}
        </Button>
      )}
    </div>
  )
}
