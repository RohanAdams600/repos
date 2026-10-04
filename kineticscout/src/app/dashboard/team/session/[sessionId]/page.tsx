import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { SessionDetail } from '@/components/team/session-detail'
import { isTeamCoach } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Testing day' }

export default async function TestingSessionPage({ params }: PageProps<'/dashboard/team/session/[sessionId]'>) {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  const { sessionId } = await params
  const session = /^[0-9a-f-]{36}$/i.test(sessionId) ? await db.testingSession.findFirst({ where: { id: sessionId, team: { coachId: user.id } }, select: { label: true } }) : null
  if (!session) notFound()
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Your teams', href: '/dashboard/team' }, { label: session.label }]} />
        <h1 className="text-3xl font-bold">{session.label}</h1>
      </div>
      <SessionDetail sessionId={sessionId} />
    </div>
  )
}
