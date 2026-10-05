'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { CONTACT_POLICY, contactMessageProblem } from '@/lib/coach/rules'
import { useMessages } from '@/i18n/client'
import { coachMessages } from '@/i18n/messages/coach'
import { useServerText } from '@/i18n/server-text-client'
import { UiText } from '@/components/ui/ui-text'
import { errorMessage, useTRPC } from '@/trpc/client'

export function ContactDialog({ athleteId, athleteName, gradYear, disabled }: { athleteId: string; athleteName: string; gradYear: number; disabled?: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [attested, setAttested] = useState(false)
  // Errors appear after the first submit, then update live. Validating on blur moved the checkbox
  // down between mousedown and mouseup, so the first click on it was lost.
  const [submitted, setSubmitted] = useState(false)
  const send = useMutation(
    trpc.coach.sendRequest.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.coach.search.queryKey() })
        void queryClient.invalidateQueries({ queryKey: trpc.coach.requests.queryKey() })
      },
    }),
  )
  const m = useMessages(coachMessages).contact
  const serverText = useServerText()
  const rawProblem = submitted ? contactMessageProblem(message) : null
  const problem = rawProblem ? serverText(rawProblem) : null
  const attestError = submitted && !attested ? m.attest : undefined
  const messageId = `contact-message-${athleteId}`

  return (
    <>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        {m.open}
      </Button>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            send.reset()
            setSubmitted(false)
          }
        }}
        title={m.title(athleteName)}
        description={m.intro}
      >
        {send.isSuccess ? (
          <Alert tone="success" focusOnMount>
            {m.sent(athleteName, CONTACT_POLICY.expiresDays)}
          </Alert>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(true)
              const messageOk = !contactMessageProblem(message)
              if (messageOk && attested) {
                send.mutate({ athleteId, message, rulesAttested: attested })
                return
              }
              // Move focus to the first field that needs attention so the error is read out.
              const field = e.currentTarget.elements.namedItem(messageOk ? 'rulesAttested' : 'message')
              if (field instanceof HTMLElement) field.focus()
            }}
          >
            {send.isError && (
              <Alert tone="error" focusOnMount>
                {errorMessage(send.error)}
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={messageId} className="font-bold">
                {m.message} <span className="font-normal text-fg-muted"><UiText k="required" /></span>
              </label>
              <p id={`${messageId}-hint`} className="text-sm text-fg-muted">
                {m.hint(CONTACT_POLICY.messageMax)}
              </p>
              <textarea
                id={messageId}
                name="message"
                rows={6}
                maxLength={CONTACT_POLICY.messageMax}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby={`${messageId}-hint${problem ? ` ${messageId}-error` : ''}`}
                aria-invalid={problem ? true : undefined}
                className="rounded-sm border-2 border-border-strong bg-bg p-3"
              />
              {problem && (
                <p id={`${messageId}-error`} className="text-sm font-bold text-danger">
                  {problem}
                </p>
              )}
            </div>
            <Checkbox
              name="rulesAttested"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              required
              error={attestError}
              label={m.rules(gradYear)}
            />
            <Button type="submit" disabled={send.isPending} className="self-start">
              {send.isPending ? <Spinner label={m.sending} /> : null}
              {m.send}
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
