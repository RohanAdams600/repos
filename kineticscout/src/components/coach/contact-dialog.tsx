'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { Spinner } from '@/components/ui/spinner'
import { CONTACT_POLICY, contactMessageProblem } from '@/lib/coach/rules'
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
  const problem = submitted ? contactMessageProblem(message) : null
  const attestError = submitted && !attested ? "Confirm that your association's recruiting rules allow contact now." : undefined
  const messageId = `contact-message-${athleteId}`

  return (
    <>
      <Button size="sm" variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        Request contact
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
        title={`Request contact with ${athleteName}`}
        description="Introduce yourself. The athlete decides whether to share their email address; for athletes under 18 a parent or guardian must approve too."
      >
        {send.isSuccess ? (
          <Alert tone="success" focusOnMount>
            Request sent. You will be notified when {athleteName} responds. Requests expire after {CONTACT_POLICY.expiresDays} days.
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
                Message <span className="font-normal text-fg-muted">(required)</span>
              </label>
              <p id={`${messageId}-hint`} className="text-sm text-fg-muted">
                No links or phone numbers in a first message. Up to {CONTACT_POLICY.messageMax} characters.
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
              label={`Contact with this class of ${gradYear} athlete is allowed now under my association's recruiting rules.`}
            />
            <Button type="submit" disabled={send.isPending} className="self-start">
              {send.isPending ? <Spinner label="Sending" /> : null}
              Send request
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
