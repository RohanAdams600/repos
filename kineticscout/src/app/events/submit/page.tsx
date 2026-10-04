import type { Metadata } from 'next'
import Link from 'next/link'
import { EventForm } from '@/components/events/event-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { isAdmin } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { canSubmitEvent, mySubmissions } from '@/lib/events/service'

export const metadata: Metadata = { title: 'Submit an event', robots: { index: false } }

const STATUS = { PENDING: 'Waiting for review', PUBLISHED: 'Listed', REJECTED: 'Not listed', CANCELED: 'Canceled' } as const

export default async function SubmitEventPage() {
  const user = await requireUser('/events/submit')
  const allowed = canSubmitEvent(user)
  const submissions = allowed ? await mySubmissions(user.id) : []
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: 'Submit an event' }]} />
        <h1 className="text-4xl font-bold">Submit an event</h1>
        <p className="text-fg-muted">
          Tell us about a showcase, camp, combine or tournament. We list it once our staff have matched it to the organizer&apos;s own page. Please copy facts from that page;
          do not add promises about scholarships, exposure or results.
        </p>
      </div>
      {allowed ? (
        <EventForm staff={isAdmin(user)} />
      ) : (
        <Alert tone="info">
          Event listings come from coach and parent accounts. If you are an athlete, ask your coach or parent to submit it, or send the organizer&apos;s link through our{' '}
          <Link href="/contact">contact page</Link>.
        </Alert>
      )}
      {submissions.length > 0 && (
        <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
          <h2 id="mine-heading" className="text-2xl font-bold">
            Your submissions
          </h2>
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 border-2 border-border-subtle p-3">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/events/${s.id}`} className="font-bold">
                    {s.name}
                  </Link>
                  <span className="text-sm">{STATUS[s.status]}</span>
                </span>
                {s.status === 'REJECTED' && s.reviewNote && <span className="text-sm text-fg-muted">{s.reviewNote}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
