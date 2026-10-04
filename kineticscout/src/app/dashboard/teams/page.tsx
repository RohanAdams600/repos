import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { AthleteTeams } from '@/components/team/athlete-teams'
import { accountMessages } from '@/i18n/messages/account'
import { connectionsMessages } from '@/i18n/messages/connections'
import { messages } from '@/i18n/server'
import { requireAthlete } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(connectionsMessages)).teams.title }
}

export default async function AthleteTeamsPage() {
  const user = await requireAthlete('/dashboard/teams')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const m = (await messages(connectionsMessages)).teams
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro}</p>
      </div>
      <AthleteTeams />
    </div>
  )
}
