import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ThreadList } from '@/components/messages/thread-list'
import { accountMessages } from '@/i18n/messages/account'
import { connectionsMessages } from '@/i18n/messages/connections'
import { messages } from '@/i18n/server'
import { requireUser } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(connectionsMessages)).messages.title }
}

export default async function MessagesPage() {
  const user = await requireUser('/dashboard/messages')
  if (user.role !== 'COACH' && !(user.role === 'ATHLETE' && user.hasAthleteProfile)) redirect('/dashboard')
  const coach = user.role === 'COACH'
  const m = (await messages(connectionsMessages)).messages
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">
          {coach ? m.coachIntro : m.athleteIntro}
        </p>
      </div>
      <ThreadList emptyHint={coach ? m.coachEmpty : m.athleteEmpty} />
    </div>
  )
}
