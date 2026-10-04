import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAthlete } from '@/lib/auth/session'
import { EVENT_KIND_LABEL, formatEventDates } from '@/lib/events/rules'
import { athleteEvents } from '@/lib/events/service'

export const metadata: Metadata = { title: 'Events' }

export default async function AthleteEventsPage() {
  const user = await requireAthlete('/dashboard/events')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const { upcoming, past } = await athleteEvents(user.id)
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Events' }]} />
        <h1 className="text-3xl font-bold">Events</h1>
        <p className="text-fg-muted">
          Showcases, camps and combines you are going to. Find more on the <Link href="/events">events page</Link>, and check the{' '}
          <Link href="/recruiting-calendar">recruiting calendar</Link>.
        </p>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming events" action={<Link href="/events">Browse events</Link>}>
          <p>Mark an event as going and it appears here, with a notice if it changes or is canceled.</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Upcoming events">
          {upcoming.map(({ event, shareWithCoaches }) => (
            <li key={event.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
              <Link href={`/events/${event.id}`} className="text-lg font-bold">
                {event.name}
              </Link>
              <span className="text-fg-muted">
                {EVENT_KIND_LABEL[event.kind]}. {formatEventDates(event.startDate, event.endDate)}. {event.city}, {event.state}.
              </span>
              <span className="text-sm">
                {event.status === 'CANCELED' ? <strong className="text-danger">Canceled.</strong> : shareWithCoaches ? 'Shown to verified college coaches when your profile is public.' : 'Not shown to coaches.'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past-heading" className="flex flex-col gap-3">
          <h2 id="past-heading" className="text-2xl font-bold">
            Recent events
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {past.map(({ event }) => (
              <li key={event.id}>
                <Link href={`/events/${event.id}`}>{event.name}</Link>, {formatEventDates(event.startDate, event.endDate)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
