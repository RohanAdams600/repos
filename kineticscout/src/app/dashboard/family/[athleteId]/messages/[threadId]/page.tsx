import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FamilyActionForm, FamilyReportForm } from '@/components/family/family-action-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { isEngaged } from '@/lib/family/service'
import { CLOSED_BY_LABEL } from '@/lib/messaging/rules'
import { guardianAccountThread } from '@/lib/messaging/service'

export const metadata: Metadata = { title: 'Conversation with a college coach' }

const DONE = {
  'close-thread': 'The conversation has ended. Neither of them can send more messages here.',
  report: 'Thank you. Our staff will review the message.',
} as const

const when = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export default async function FamilyThreadPage({ params, searchParams }: PageProps<'/dashboard/family/[athleteId]/messages/[threadId]'>) {
  const user = await requireGuardian()
  const { athleteId, threadId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete || !isEngaged(athlete.consentStatus)) notFound()
  const thread = await guardianAccountThread(user.id, athlete.athleteId, threadId)
  if (!thread) notFound()
  const doneKey = (await searchParams).done
  const done = typeof doneKey === 'string' && doneKey in DONE ? DONE[doneKey as keyof typeof DONE] : null
  const name = athlete.firstName

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Family', href: '/dashboard/family' },
            { label: `${athlete.firstName} ${athlete.lastName}`, href: `/dashboard/family/${athlete.athleteId}` },
            { label: 'Conversation' },
          ]}
        />
        <h1 className="text-3xl font-bold">{name} and a college coach</h1>
        <p className="text-fg-muted">Every message between {name} and {thread.coachLabel} on KineticScout.</p>
      </div>
      {done && (
        <Alert tone="success" focusOnMount>
          {done}
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
                <span className="font-bold">{m.fromCoach ? 'Coach' : name}</span>
                <span className="tabular text-sm text-fg-muted">{when(m.createdAt)} UTC</span>
              </div>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              {m.fromCoach && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold">Report this message</summary>
                  <FamilyReportForm athleteId={athlete.athleteId} threadId={thread.id} messageId={m.id} />
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {thread.status === 'OPEN' && (
        <FamilyActionForm
          athleteId={athlete.athleteId}
          intent="close-thread"
          itemId={thread.id}
          danger
          title="End this conversation"
          description="Stops both sides from sending more messages here. It does not affect anything else on the account."
          submitLabel="End this conversation"
          pendingLabel="Ending"
        />
      )}
    </div>
  )
}
