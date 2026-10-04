import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AthleteRequests } from '@/components/coach/athlete-requests'
import { CoachRequests } from '@/components/coach/coach-requests'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireUser } from '@/lib/auth/session'
import { accountMessages } from '@/i18n/messages/account'
import { connectionsMessages } from '@/i18n/messages/connections'
import { messages } from '@/i18n/server'
import { verifiedCoach } from '@/lib/coach/verification'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(connectionsMessages)).requests.title }
}

export default async function ContactRequestsPage() {
  const user = await requireUser('/dashboard/contact-requests')
  const isCoach = user.role === 'COACH'
  if (isCoach && !(await verifiedCoach(user.id))) redirect('/dashboard')
  if (!isCoach && !user.hasAthleteProfile) redirect('/onboarding')
  const m = (await messages(connectionsMessages)).requests
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">
          {isCoach ? m.coachIntro : m.athleteIntro}
        </p>
      </div>
      {isCoach ? <CoachRequests /> : <AthleteRequests />}
    </div>
  )
}
