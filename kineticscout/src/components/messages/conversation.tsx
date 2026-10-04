'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { inputClass } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'
import { CLOSED_BY_LABEL, MESSAGE_POLICY } from '@/lib/messaging/rules'
import { errorMessage, useTRPC } from '@/trpc/client'

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function ReportMessage({ messageId }: { messageId: string }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const report = useMutation(trpc.messages.report.mutationOptions())
  const id = `report-${messageId}`
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Report
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) report.reset()
        }}
        title="Report this message"
        description="Our staff read the message with the messages around it and can end the conversation or suspend a coach."
      >
        {report.isSuccess ? (
          <Alert tone="success" focusOnMount>
            Thank you. Our staff will review it.
          </Alert>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              report.mutate({ messageId, reason })
            }}
          >
            {report.isError && <Alert tone="error">{errorMessage(report.error)}</Alert>}
            <label htmlFor={id} className="font-bold">
              What is wrong? <span className="font-normal text-fg-muted">(required)</span>
            </label>
            <textarea id={id} rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, 'py-2')} />
            <Button type="submit" disabled={report.isPending} className="self-start">
              Send report
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}

export function Conversation({ threadId }: { threadId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const thread = useQuery({ ...trpc.messages.thread.queryOptions({ threadId }), refetchInterval: 15_000 })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.messages.thread.queryKey({ threadId }) })
    void queryClient.invalidateQueries({ queryKey: trpc.messages.list.queryKey() })
  }
  const send = useMutation(trpc.messages.send.mutationOptions({ onSuccess: () => { setBody(''); refresh() } }))
  const close = useMutation(trpc.messages.close.mutationOptions({ onSuccess: refresh }))
  const [body, setBody] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const seen = useRef<number | null>(null)

  // Announce messages that arrive while the page is open, without reading the whole list again.
  const incoming = thread.data?.messages.filter((m) => !m.mine).length ?? 0
  useEffect(() => {
    if (!thread.data) return
    if (seen.current !== null && incoming > seen.current) setAnnouncement(`New message from ${thread.data.withName}`)
    seen.current = incoming
  }, [incoming, thread.data])

  if (thread.isPending) return <Spinner label="Loading conversation" />
  if (thread.isError) return <Alert tone="error">{errorMessage(thread.error)}</Alert>
  const t = thread.data
  const remaining = MESSAGE_POLICY.maxLength - body.length

  return (
    <div className="flex flex-col gap-6">
      <p className="text-fg-muted">{t.withDetail}</p>
      {t.guardianCopy && (
        <Alert tone="info">
          {t.role === 'athlete'
            ? 'Your parent or guardian gets a copy of every message in this conversation.'
            : `${t.withName} is under 18. Their parent or guardian gets a copy of every message and can end the conversation. Keep to recruiting.`}
        </Alert>
      )}
      {t.status === 'CLOSED' && <Alert tone="info">{CLOSED_BY_LABEL[t.closedBy ?? 'staff'] ?? 'This conversation has ended.'}</Alert>}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {t.messages.length === 0 ? (
        <p className="text-fg-muted">No messages yet.</p>
      ) : (
        <ol aria-label="Messages" className="flex flex-col gap-3">
          {t.messages.map((m) => (
            <li key={m.id} className={cn('flex flex-col gap-2 border-2 p-4', m.mine ? 'border-fg' : 'border-border-subtle')}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{m.mine ? 'You' : t.withName}</span>
                <span className="tabular text-sm text-fg-muted">
                  {when(m.createdAt)}
                  {m.mine && m.read ? ' · Read' : ''}
                </span>
              </div>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              {!m.mine && (
                <div className="self-end">
                  <ReportMessage messageId={m.id} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {t.status === 'OPEN' && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            send.mutate({ threadId, body })
          }}
        >
          {send.isError && (
            <Alert tone="error" focusOnMount>
              {errorMessage(send.error)}
            </Alert>
          )}
          <label htmlFor="message-body" className="font-bold">
            Message <span className="font-normal text-fg-muted">(required)</span>
          </label>
          <textarea
            id="message-body"
            rows={4}
            maxLength={MESSAGE_POLICY.maxLength}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-describedby="message-body-count"
            className={cn(inputClass, 'py-2')}
          />
          <p id="message-body-count" className="tabular text-sm text-fg-muted">
            {remaining} characters left
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" disabled={send.isPending || body.trim().length === 0}>
              {send.isPending ? <Spinner label="Sending" /> : null}
              Send
            </Button>
            <ConfirmDialog
              trigger={<Button variant="ghost">End conversation</Button>}
              title="End this conversation?"
              description="Neither of you can send more messages here. The messages stay visible to both of you."
              confirmLabel="End conversation"
              tone="danger"
              onConfirm={() => close.mutate({ threadId })}
            />
          </div>
        </form>
      )}
    </div>
  )
}
