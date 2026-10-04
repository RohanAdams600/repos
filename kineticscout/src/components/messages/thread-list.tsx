'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

export function ThreadList({ emptyHint }: { emptyHint: string }) {
  const trpc = useTRPC()
  const threads = useQuery({ ...trpc.messages.list.queryOptions(), refetchInterval: 30_000 })
  if (threads.isPending) return <Spinner label="Loading messages" />
  if (threads.isError) return <Alert tone="error">{errorMessage(threads.error)}</Alert>
  if (threads.data.length === 0) return <EmptyState title="No conversations yet">{emptyHint}</EmptyState>
  return (
    <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
      {threads.data.map((t) => (
        <li key={t.id}>
          <Link href={`/dashboard/messages/${t.id}`} className="flex flex-col gap-1 p-4 no-underline hover:bg-surface">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold underline">{t.withName}</span>
              <span className="text-sm text-fg-muted">
                {t.unread > 0 ? (
                  <span className="tabular font-bold text-fg">
                    {t.unread} unread
                  </span>
                ) : t.status === 'CLOSED' ? (
                  'Ended'
                ) : null}
              </span>
            </span>
            <span className="text-sm text-fg-muted">{t.withDetail}</span>
            {t.preview && <span className="truncate text-fg-muted">{t.preview}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
