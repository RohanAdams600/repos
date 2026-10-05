import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ProspectSearch } from '@/components/coach/prospect-search'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireUser } from '@/lib/auth/session'
import { accountMessages } from '@/i18n/messages/account'
import { coachMessages } from '@/i18n/messages/coach'
import { messages } from '@/i18n/server'
import { verifiedCoach } from '@/lib/coach/verification'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(coachMessages)).prospects.title }
}

export default async function ProspectsPage() {
  const user = await requireUser('/dashboard/prospects')
  const coach = user.role === 'COACH' ? await verifiedCoach(user.id) : null
  if (!coach) redirect('/dashboard')
  const m = (await messages(coachMessages)).prospects
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro}</p>
      </div>
      <ProspectSearch defaultSport={coach.college?.sport ?? 'BASEBALL'} />
    </div>
  )
}
