import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianCloseThreadAction, guardianReportAction } from '@/lib/messaging/actions'
import { CLOSED_BY_LABEL } from '@/lib/messaging/rules'
import { pick } from '@/i18n/define'
import { consentMessages } from '@/i18n/messages/consent'
import { getLocale, messages } from '@/i18n/server'
import { INTL_LOCALE, type Locale } from '@/i18n/config'
import { UiText } from '@/components/ui/ui-text'
import { guardianThread } from '@/lib/messaging/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).messages.metaTitle, robots: { index: false, follow: false } }
}

const RESULTS = { closed: 'success', reported: 'success', reason: 'error', invalid: 'error', limited: 'error' } as const

const when = (d: Date, locale: Locale) => d.toLocaleString(INTL_LOCALE[locale], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export default async function GuardianMessagesPage({ searchParams }: PageProps<'/consent/guardian/messages'>) {
  const params = await searchParams
  const threadId = typeof params.thread === 'string' ? params.thread : ''
  const token = typeof params.token === 'string' ? params.token : ''
  const locale = await getLocale()
  const t = pick(consentMessages, locale)
  const m = t.messages
  const text = { closed: m.closed, reported: m.reported, reason: m.reason, invalid: m.failed, limited: t.decide.limited }
  const result = typeof params.result === 'string' && params.result in RESULTS ? (params.result as keyof typeof RESULTS) : null
  const thread = threadId && token ? await guardianThread(threadId, token) : null
  if (!thread) {
    return (
      <AuthShell title={m.title}>
        <Alert tone="error">{m.notFound}</Alert>
      </AuthShell>
    )
  }
  return (
    <AuthShell
      title={m.heading(thread.athleteFirstName)}
      intro={<p>{m.intro(thread.athleteFirstName, thread.coachLabel)}</p>}
    >
      {result && (
        <Alert tone={RESULTS[result]} focusOnMount>
          {text[result]}
        </Alert>
      )}
      {thread.status === 'CLOSED' && <Alert tone="info">{CLOSED_BY_LABEL[thread.closedBy ?? 'staff'] ?? m.ended}</Alert>}
      {thread.messages.length === 0 ? (
        <p className="text-fg-muted">{m.none}</p>
      ) : (
        <ol aria-label={m.list} className="flex flex-col gap-3">
          {thread.messages.map((msg) => (
            <li key={msg.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{msg.fromCoach ? m.coach : thread.athleteFirstName}</span>
                <span className="tabular text-sm text-fg-muted">{when(msg.createdAt, locale)} UTC</span>
              </div>
              <p className="break-words whitespace-pre-wrap">{msg.body}</p>
              {msg.fromCoach && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold">{m.report}</summary>
                  <form action={guardianReportAction} className="mt-3 flex flex-col gap-3">
                    <input type="hidden" name="thread" value={thread.id} />
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="messageId" value={msg.id} />
                    <label htmlFor={`reason-${msg.id}`} className="font-bold">
                      {m.whatWrong} <span className="font-normal text-fg-muted"><UiText k="required" /></span>
                    </label>
                    <textarea id={`reason-${msg.id}`} name="reason" rows={3} maxLength={1000} required className="block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg" />
                    <Button type="submit" size="sm" className="self-start">
                      {m.sendReport}
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
          <p className="text-fg-muted">{m.endExplain}</p>
          <Button type="submit" variant="danger" className="self-start">
            {m.end}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
