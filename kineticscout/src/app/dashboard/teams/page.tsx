import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { AthleteTeams } from '@/components/team/athlete-teams'
import { requireAthlete } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Teams' }

export default async function AthleteTeamsPage() {
  const user = await requireAthlete('/dashboard/teams')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Teams' }]} />
        <h1 className="text-3xl font-bold">Teams</h1>
        <p className="text-fg-muted">Join your high school or travel team so your coach can record testing-day results for you to accept.</p>
      </div>
      <AthleteTeams />
    </div>
  )
}
