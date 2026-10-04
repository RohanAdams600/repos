import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AthleteRequests } from '@/components/coach/athlete-requests'
import { CoachRequests } from '@/components/coach/coach-requests'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireUser } from '@/lib/auth/session'
import { verifiedCoach } from '@/lib/coach/verification'

export const metadata: Metadata = { title: 'Contact requests' }

export default async function ContactRequestsPage() {
  const user = await requireUser('/dashboard/contact-requests')
  const isCoach = user.role === 'COACH'
  if (isCoach && !(await verifiedCoach(user.id))) redirect('/dashboard')
  if (!isCoach && !user.hasAthleteProfile) redirect('/onboarding')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contact requests' }]} />
        <h1 className="text-3xl font-bold">Contact requests</h1>
        <p className="text-fg-muted">
          {isCoach
            ? 'Requests you sent. Email addresses appear here once an athlete (and, for athletes under 18, a parent or guardian) accepts.'
            : 'Verified college coaches who asked to contact you. Nothing is shared unless you accept. You can decline, block or report any coach.'}
        </p>
      </div>
      {isCoach ? <CoachRequests /> : <AthleteRequests />}
    </div>
  )
}
