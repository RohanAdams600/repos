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
import { METRIC_DEFINITIONS, formatMetric } from '@/lib/metrics/definitions'
import { REJECTION_LABELS } from '@/lib/verification/policy'
import { errorMessage, useTRPC } from '@/trpc/client'

export function MeasurementList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)
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

  if (query.isPending) return <Spinner label="Loading measurements" />
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>
  if (items.length === 0) return <EmptyState title="No measurements yet">Log a measurement from your dashboard, then come back to verify it.</EmptyState>

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
        {items.map((item) => {
          const label = METRIC_DEFINITIONS[item.metricType].label
          const status = item.verification?.status
          const canSubmit = !item.verified && status !== 'CHECKING' && status !== 'IN_REVIEW'
          return (
            <li key={item.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{label}</span>
                  <span className="text-sm text-fg-muted">
                    Measured <span className="tabular">{item.date}</span>
                    {item.coachRecorded && item.recordedBy ? <> · Recorded by {item.recordedBy.replace(/ on \d{4}-\d{2}-\d{2}$/, '')}</> : null}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular text-xl font-bold">{formatMetric(item.metricType, item.value)}</span>
                  {item.verified && <VerifiedBadge />}
                  {item.coachRecorded && <CoachRecordedBadge />}
                  {item.verified ? null : status === 'CHECKING' ? (
                    <span className="text-sm">Checking video</span>
                  ) : status === 'IN_REVIEW' ? (
                    <span className="text-sm">Waiting for review</span>
                  ) : null}
                  {canSubmit && (
                    <Button size="sm" variant="secondary" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
                      {open === item.id ? 'Close' : status === 'REJECTED' ? 'Send a new video' : 'Verify with video'}
                    </Button>
                  )}
                </div>
              </div>
              {status === 'REJECTED' && item.verification?.rejectionReason && (
                <p className="text-sm text-fg-muted">
                  Not verified: {REJECTION_LABELS[item.verification.rejectionReason]}
                  {item.verification.reviewerNote ? ` Reviewer note: ${item.verification.reviewerNote}` : ''}
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
          {query.isFetchingNextPage ? 'Loading' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
