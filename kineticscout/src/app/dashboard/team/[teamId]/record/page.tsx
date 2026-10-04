import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { TestingDayForm } from '@/components/team/testing-day-form'
import { isTeamCoach } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Record a testing day' }

export default async function RecordTestingDayPage({ params }: PageProps<'/dashboard/team/[teamId]/record'>) {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  const { teamId } = await params
  const team = /^[0-9a-f-]{36}$/i.test(teamId) ? await db.team.findFirst({ where: { id: teamId, coachId: user.id, status: 'VERIFIED' }, select: { name: true } }) : null
  if (!team) notFound()
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Your teams', href: '/dashboard/team' }, { label: 'Record a testing day' }]} />
        <h1 className="text-3xl font-bold">Record a testing day</h1>
        <p className="text-fg-muted">{team.name}</p>
      </div>
      <TestingDayForm teamId={teamId} today={new Date().toISOString().slice(0, 10)} />
    </div>
  )
}
