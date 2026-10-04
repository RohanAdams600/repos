import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Conversation } from '@/components/messages/conversation'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Conversation' }

export default async function ConversationPage({ params }: PageProps<'/dashboard/messages/[threadId]'>) {
  const user = await requireUser('/dashboard/messages')
  if (user.role !== 'COACH' && !(user.role === 'ATHLETE' && user.hasAthleteProfile)) redirect('/dashboard')
  const { threadId } = await params
  const thread = /^[0-9a-f-]{36}$/i.test(threadId)
    ? await db.messageThread.findFirst({
        where: { id: threadId, OR: [{ coachId: user.id }, { athleteId: user.id }] },
        select: { coachId: true, coach: { select: { firstName: true, lastName: true } }, athlete: { select: { firstName: true, lastName: true } } },
      })
    : null
  if (!thread) notFound()
  const withName = thread.coachId === user.id ? `${thread.athlete.firstName} ${thread.athlete.lastName}` : `Coach ${thread.coach.firstName} ${thread.coach.lastName}`
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Messages', href: '/dashboard/messages' }, { label: withName }]} />
        <h1 className="text-3xl font-bold">{withName}</h1>
      </div>
      <Conversation threadId={threadId} />
    </div>
  )
}
