'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MetricType } from '@/generated/prisma/enums'
import { Alert } from '@/components/ui/alert'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { OUTBOX_EVENT, pendingFor, removeFromOutbox } from '@/lib/pwa/outbox'
import { errorMessage, isNetworkError, useTRPC } from '@/trpc/client'

/**
 * Sends measurements that were logged offline, oldest first, whenever the dashboard opens or the
 * device comes back online. Each carries its device id, so a resend after a dropped response is
 * recognised by the server instead of logged twice.
 */
export function OutboxSync({ userId }: { userId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const log = useMutation(trpc.metrics.log.mutationOptions())
  const [pending, setPending] = useState(0)
  const [result, setResult] = useState<{ sent: number; problems: string[] } | null>(null)
  const busy = useRef(false)

  const flush = useCallback(async () => {
    const entries = pendingFor(userId)
    setPending(entries.length)
    if (entries.length === 0 || busy.current || navigator.onLine === false) return
    busy.current = true
    let sent = 0
    const problems: string[] = []
    for (const e of entries) {
      const def = METRIC_DEFINITIONS[e.metricType as MetricType]
      if (!def) {
        removeFromOutbox(e.clientRef)
        continue
      }
      try {
        await log.mutateAsync({ metricType: e.metricType as MetricType, value: e.value, date: e.date, clientRef: e.clientRef })
        removeFromOutbox(e.clientRef)
        sent++
      } catch (error) {
        if (isNetworkError(error)) break
        // The server refused it (for example the monthly limit): say so rather than retry forever.
        removeFromOutbox(e.clientRef)
        problems.push(`${def.label} of ${e.value} ${def.unit}: ${errorMessage(error)}`)
      }
    }
    busy.current = false
    setPending(pendingFor(userId).length)
    if (sent || problems.length) {
      setResult({ sent, problems })
      void queryClient.invalidateQueries({ queryKey: trpc.metrics.entries.queryKey() })
      router.refresh()
    }
  }, [log, queryClient, router, trpc, userId])

  useEffect(() => {
    const run = () => void flush()
    const start = setTimeout(run, 0)
    window.addEventListener('online', run)
    window.addEventListener(OUTBOX_EVENT, run)
    return () => {
      clearTimeout(start)
      window.removeEventListener('online', run)
      window.removeEventListener(OUTBOX_EVENT, run)
    }
  }, [flush])

  if (pending === 0 && !result) return null
  return (
    <div className="flex flex-col gap-2">
      {pending > 0 && (
        <p role="status" className="border-2 border-border-strong p-3">
          <span className="tabular font-bold">{pending}</span> measurement{pending === 1 ? '' : 's'} saved on this device, waiting for a connection.
        </p>
      )}
      {result && result.sent > 0 && (
        <Alert tone="success">
          Sent <span className="tabular">{result.sent}</span> measurement{result.sent === 1 ? '' : 's'} you logged offline.
        </Alert>
      )}
      {result && result.problems.length > 0 && (
        <Alert tone="error" title="Some offline entries were not saved">
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {result.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  )
}
