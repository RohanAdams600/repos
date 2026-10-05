import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { TeamConsole } from '@/components/team/team-console'
import { isTeamCoach } from '@/lib/auth/permissions'
import { accountMessages } from '@/i18n/messages/account'
import { coachMessages } from '@/i18n/messages/coach'
import { messages } from '@/i18n/server'
import { requireUser } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(coachMessages)).team.title }
}

export default async function TeamPage() {
  const user = await requireUser('/dashboard/team')
  if (!isTeamCoach(user)) redirect('/dashboard')
  const m = (await messages(coachMessages)).team
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
      </div>
      <TeamConsole />
    </div>
  )
}
