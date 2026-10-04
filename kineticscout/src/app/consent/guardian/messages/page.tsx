import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianCloseThreadAction, guardianReportAction } from '@/lib/messaging/actions'
import { CLOSED_BY_LABEL } from '@/lib/messaging/rules'
import { guardianThread } from '@/lib/messaging/service'

export const metadata: Metadata = { title: 'Conversation with a college coach', robots: { index: false, follow: false } }

const RESULTS = {
  closed: { tone: 'success', text: 'The conversation has ended. Neither of them can send more messages here.' },
  reported: { tone: 'success', text: 'Thank you. Our staff will review the message.' },
  reason: { tone: 'error', text: 'Tell us what is wrong in a sentence or two, then send the report again.' },
  invalid: { tone: 'error', text: 'That did not work. The link may be out of date.' },
  limited: { tone: 'error', text: 'Too many attempts. Try again in an hour.' },
} as const

const when = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export default async function GuardianMessagesPage({ searchParams }: PageProps<'/consent/guardian/messages'>) {
  const params = await searchParams
  const threadId = typeof params.thread === 'string' ? params.thread : ''
  const token = typeof params.token === 'string' ? params.token : ''
  const result = typeof params.result === 'string' && params.result in RESULTS ? RESULTS[params.result as keyof typeof RESULTS] : null
  const thread = threadId && token ? await guardianThread(threadId, token) : null
  if (!thread) {
    return (
      <AuthShell title="Conversation">
        <Alert tone="error">This link is not valid, or the conversation was deleted.</Alert>
      </AuthShell>
    )
  }
  return (
    <AuthShell
      title={`${thread.athleteFirstName} and a college coach`}
      intro={<p>Every message between {thread.athleteFirstName} and {thread.coachLabel} on KineticScout. Only you can see this page; keep the link private.</p>}
    >
      {result && (
        <Alert tone={result.tone} focusOnMount>
          {result.text}
        </Alert>
      )}
      {thread.status === 'CLOSED' && <Alert tone="info">{CLOSED_BY_LABEL[thread.closedBy ?? 'staff'] ?? 'This conversation has ended.'}</Alert>}
      {thread.messages.length === 0 ? (
        <p className="text-fg-muted">No messages yet.</p>
      ) : (
        <ol aria-label="Messages" className="flex flex-col gap-3">
          {thread.messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{m.fromCoach ? 'Coach' : thread.athleteFirstName}</span>
                <span className="tabular text-sm text-fg-muted">{when(m.createdAt)} UTC</span>
              </div>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              {m.fromCoach && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold">Report this message</summary>
                  <form action={guardianReportAction} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="thread" value={thread.id} />
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="messageId" value={m.id} />
                    <label htmlFor={`reason-${m.id}`} className="font-bold">
                      What is wrong? <span className="font-normal text-fg-muted">(required)</span>
                    </label>
                    <textarea id={`reason-${m.id}`} name="reason" rows={3} maxLength={1000} required className="block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg" />
                    <Button type="submit" size="sm" className="self-start">
                      Send report
                    </Button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {thread.status === 'OPEN' && (
        <form action={guardianCloseThreadAction} className="flex flex-col gap-3">
          <input type="hidden" name="thread" value={thread.id} />
          <input type="hidden" name="token" value={token} />
          <p className="text-fg-muted">Ending the conversation stops both sides from sending more messages here. It does not affect anything else on the account.</p>
          <Button type="submit" variant="danger" className="self-start">
            End this conversation
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
