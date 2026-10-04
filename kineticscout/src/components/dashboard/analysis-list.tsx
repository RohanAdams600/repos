'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { analysisMessages } from '@/i18n/messages/analysis'
import { useLocale } from '@/i18n/client'
import { INTL_LOCALE } from '@/i18n/config'
import { domainMessages } from '@/i18n/messages/domain'
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
  const t = useMessages(analysisMessages)
  const m = t.list
  const d = useMessages(domainMessages)
  const locale = useLocale()

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-4">
      <h2 id="history-title" className="text-xl font-bold">
        {m.title}
      </h2>
      {query.isPending && <Spinner label={m.loading} />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.isSuccess && items.length === 0 && <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>}
      {items.length > 0 && (
        <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/dashboard/analysis/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 no-underline hover:bg-surface">
                <span>
                  <span className="font-bold">{d.motion[item.motionType]}</span>
                  <span className="tabular ml-3 text-sm text-fg-muted">{new Date(item.createdAt).toLocaleString(INTL_LOCALE[locale])}</span>
                </span>
                <span className="text-sm">
                  {item.status === 'COMPLETE'
                    ? item.sequenceIsIdeal
                      ? m.inOrder
                      : m.issues(item.findingCount ?? 0)
                    : item.status === 'FAILED'
                      ? (t.failures[item.errorCode ?? '']?.title ?? m.failed)
                      : t.status[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="self-start">
          {query.isFetchingNextPage ? m.loadingMore : m.loadMore}
        </Button>
      )}
    </section>
  )
}
