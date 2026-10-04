import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { TeamConsole } from '@/components/team/team-console'
import { isTeamCoach } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Your teams' }

export default async function TeamPage() {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Your teams' }]} />
        <h1 className="text-3xl font-bold">Your teams</h1>
      </div>
      <TeamConsole />
    </div>
  )
}
