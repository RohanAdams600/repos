import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FamilyActionForm, FamilyReportForm } from '@/components/family/family-action-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { isEngaged } from '@/lib/family/service'
import { CLOSED_BY_LABEL } from '@/lib/messaging/rules'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { familyMessages } from '@/i18n/messages/family'
import { getLocale, messages } from '@/i18n/server'
import { consentMessages } from '@/i18n/messages/consent'
import { INTL_LOCALE, type Locale } from '@/i18n/config'
import { guardianAccountThread } from '@/lib/messaging/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).messages.metaTitle }
}

const when = (d: Date, locale: Locale) => d.toLocaleString(INTL_LOCALE[locale], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

export default async function FamilyThreadPage({ params, searchParams }: PageProps<'/dashboard/family/[athleteId]/messages/[threadId]'>) {
  const user = await requireGuardian()
  const { athleteId, threadId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete || !isEngaged(athlete.consentStatus)) notFound()
  const thread = await guardianAccountThread(user.id, athlete.athleteId, threadId)
  if (!thread) notFound()
  const doneKey = (await searchParams).done
  const locale = await getLocale()
  const m = pick(familyMessages, locale)
  const g = pick(consentMessages, locale).messages
  const dash = pick(accountMessages, locale).dashboard
  const done = typeof doneKey === 'string' && doneKey in m.threadDone ? m.threadDone[doneKey] : null
  const name = athlete.firstName

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: dash, href: '/dashboard' },
            { label: m.title, href: '/dashboard/family' },
            { label: `${athlete.firstName} ${athlete.lastName}`, href: `/dashboard/family/${athlete.athleteId}` },
            { label: m.conversation },
          ]}
        />
        <h1 className="text-3xl font-bold">{g.heading(name)}</h1>
        <p className="text-fg-muted">{m.threadIntro(name, thread.coachLabel)}</p>
      </div>
      {done && (
        <Alert tone="success" focusOnMount>
          {done}
        </Alert>
      )}
      {thread.status === 'CLOSED' && <Alert tone="info">{CLOSED_BY_LABEL[thread.closedBy ?? 'staff'] ?? g.ended}</Alert>}
      {thread.messages.length === 0 ? (
        <p className="text-fg-muted">{g.none}</p>
      ) : (
        <ol aria-label={g.list} className="flex flex-col gap-3">
          {thread.messages.map((msg) => (
            <li key={msg.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{msg.fromCoach ? g.coach : name}</span>
                <span className="tabular text-sm text-fg-muted">{when(msg.createdAt, locale)} UTC</span>
              </div>
              <p className="break-words whitespace-pre-wrap">{msg.body}</p>
              {msg.fromCoach && (
                <details>
                  <summary className="cursor-pointer text-sm font-bold">{g.report}</summary>
                  <FamilyReportForm athleteId={athlete.athleteId} threadId={thread.id} messageId={msg.id} />
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
          title={m.endTitle}
          description={m.endBody}
          submitLabel={m.endTitle}
          pendingLabel={m.ending}
        />
      )}
    </div>
  )
}
