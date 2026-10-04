'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MetricType } from '@/generated/prisma/enums'
import { Alert } from '@/components/ui/alert'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { OUTBOX_EVENT, pendingFor, removeFromOutbox } from '@/lib/pwa/outbox'
import { useMessages } from '@/i18n/client'
import { accountMessages } from '@/i18n/messages/account'
import { domainMessages } from '@/i18n/messages/domain'
import { useServerText } from '@/i18n/server-text-client'
import { errorMessage, isNetworkError, useTRPC } from '@/trpc/client'

/**
 * Sends measurements that were logged offline, oldest first, whenever the dashboard opens or the
 * device comes back online. Each carries its device id, so a resend after a dropped response is
 * recognised by the server instead of logged twice.
 */
type Problem = { metricType: MetricType; value: string; error: string }

export function OutboxSync({ userId }: { userId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const log = useMutation(trpc.metrics.log.mutationOptions())
  const [pending, setPending] = useState(0)
  const [result, setResult] = useState<{ sent: number; problems: Problem[] } | null>(null)
  const m = useMessages(accountMessages).outbox
  const d = useMessages(domainMessages)
  const serverText = useServerText()
  const busy = useRef(false)

  const flush = useCallback(async () => {
    const entries = pendingFor(userId)
    setPending(entries.length)
    if (entries.length === 0 || busy.current || navigator.onLine === false) return
    busy.current = true
    let sent = 0
    const problems: Problem[] = []
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
        problems.push({ metricType: e.metricType as MetricType, value: `${e.value} ${def.unit}`, error: errorMessage(error) })
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
          {m.pending(pending)}
        </p>
      )}
      {result && result.sent > 0 && (
        <Alert tone="success">
          {m.sent(result.sent)}
        </Alert>
      )}
      {result && result.problems.length > 0 && (
        <Alert tone="error" title={m.problemsTitle}>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {result.problems.map((p, i) => (
              <li key={i}>{m.problem(d.metric[p.metricType], p.value, serverText(p.error))}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  )
}
