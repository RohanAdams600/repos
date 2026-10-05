import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { SessionDetail } from '@/components/team/session-detail'
import { isTeamCoach } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { accountMessages } from '@/i18n/messages/account'
import { coachMessages } from '@/i18n/messages/coach'
import { messages } from '@/i18n/server'
import { db } from '@/lib/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(coachMessages)).testing.session }
}

export default async function TestingSessionPage({ params }: PageProps<'/dashboard/team/session/[sessionId]'>) {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  const { sessionId } = await params
  const session = /^[0-9a-f-]{36}$/i.test(sessionId) ? await db.testingSession.findFirst({ where: { id: sessionId, team: { coachId: user.id } }, select: { label: true } }) : null
  if (!session) notFound()
  const c = await messages(coachMessages)
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: c.team.title, href: '/dashboard/team' }, { label: session.label }]} />
        <h1 className="text-3xl font-bold">{session.label}</h1>
      </div>
      <SessionDetail sessionId={sessionId} />
    </div>
  )
}
