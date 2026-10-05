import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { TestingDayForm } from '@/components/team/testing-day-form'
import { isTeamCoach } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { accountMessages } from '@/i18n/messages/account'
import { coachMessages } from '@/i18n/messages/coach'
import { messages } from '@/i18n/server'
import { db } from '@/lib/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(coachMessages)).testing.title }
}

export default async function RecordTestingDayPage({ params }: PageProps<'/dashboard/team/[teamId]/record'>) {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  const { teamId } = await params
  const team = /^[0-9a-f-]{36}$/i.test(teamId) ? await db.team.findFirst({ where: { id: teamId, coachId: user.id, status: 'VERIFIED' }, select: { name: true } }) : null
  if (!team) notFound()
  const c = await messages(coachMessages)
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: c.team.title, href: '/dashboard/team' }, { label: c.testing.title }]} />
        <h1 className="text-3xl font-bold">{c.testing.title}</h1>
        <p className="text-fg-muted">{team.name}</p>
      </div>
      <TestingDayForm teamId={teamId} today={new Date().toISOString().slice(0, 10)} />
    </div>
  )
}
