import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { ThreadList } from '@/components/messages/thread-list'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage() {
  const user = await requireUser('/dashboard/messages')
  if (user.role !== 'COACH' && !(user.role === 'ATHLETE' && user.hasAthleteProfile)) redirect('/dashboard')
  const coach = user.role === 'COACH'
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Messages' }]} />
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-fg-muted">
          {coach
            ? 'Conversations with athletes who accepted your contact request. For athletes under 18, a parent or guardian gets a copy of every message.'
            : 'Conversations with college coaches whose contact request you accepted. If you are under 18, your parent or guardian gets a copy of every message.'}
        </p>
      </div>
      <ThreadList emptyHint={coach ? 'Open a conversation from Contact requests once an athlete accepts.' : 'Open a conversation from Contact requests after you accept a coach.'} />
    </div>
  )
}
