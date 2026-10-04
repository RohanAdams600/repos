'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

export function NotificationList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useInfiniteQuery(trpc.notifications.list.infiniteQueryOptions({ limit: 20 }, { getNextPageParam: (last) => last.nextCursor }))
  const markAll = useMutation(trpc.notifications.markAllRead.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.notifications.unreadCount.queryKey() }) }))
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const hasUnread = items.some((n) => n.readAt === null)
  const { mutate } = markAll

  // Opening the page counts as reading what is on it; unread items stay highlighted until the next visit.
  useEffect(() => {
    if (hasUnread) mutate()
  }, [hasUnread, mutate])

  if (query.isPending) return <Spinner label="Loading notifications" />
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>
  if (items.length === 0) {
    return (
      <EmptyState title="No notifications yet">
        Verification results and recruiting alerts for programs you follow appear here.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
        {items.map((n) => (
          <li key={n.id} className={n.readAt === null ? 'flex flex-col gap-1 border-l-4 border-l-accent-text p-4' : 'flex flex-col gap-1 p-4'}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">
                {n.readAt === null && <span className="sr-only">New: </span>}
                {n.title}
              </p>
              <time dateTime={n.createdAt} className="tabular text-sm text-fg-muted">
                {n.createdAt.slice(0, 10)}
              </time>
            </div>
            <p className="text-fg-muted">{n.body}</p>
            {n.href && (
              <Link href={n.href} className="self-start font-bold">
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="self-start">
          {query.isFetchingNextPage ? 'Loading' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
