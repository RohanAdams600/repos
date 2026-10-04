'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { ANALYSIS_FAILURES, STATUS_LABELS } from '@/components/dashboard/analysis-messages'
import { errorMessage, useTRPC } from '@/trpc/client'

export function AnalysisList() {
  const trpc = useTRPC()
  const query = useInfiniteQuery(
    trpc.analysis.list.infiniteQueryOptions(
      { limit: 10 },
      {
        getNextPageParam: (last) => last.nextCursor,
        // Keep polling while anything is still being analysed.
        refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some((i) => i.status === 'QUEUED' || i.status === 'PROCESSING')) ? 5_000 : false),
      },
    ),
  )
  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <h2 id="history-title" className="text-xl font-bold">
        Your analyses
      </h2>
      {query.isPending && <Spinner label="Loading analyses" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.isSuccess && items.length === 0 && <EmptyState title="No analyses yet">Upload your first swing or pitch above.</EmptyState>}
      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/dashboard/analysis/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 no-underline hover:bg-surface">
                <span>
                  <span className="font-bold">{item.motionType === 'SWING' ? 'Swing' : 'Pitch'}</span>
                  <span className="tabular ml-3 text-sm text-fg-muted">{new Date(item.createdAt).toLocaleString()}</span>
                </span>
                <span className="text-sm">
                  {item.status === 'COMPLETE'
                    ? item.sequenceIsIdeal
                      ? 'Sequence in order'
                      : `${item.findingCount ?? 0} issue${item.findingCount === 1 ? '' : 's'} found`
                    : item.status === 'FAILED'
                      ? (ANALYSIS_FAILURES[item.errorCode ?? '']?.title ?? 'Failed')
                      : STATUS_LABELS[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="self-start">
          {query.isFetchingNextPage ? 'Loading' : 'Load more'}
        </Button>
      )}
    </section>
  )
}
