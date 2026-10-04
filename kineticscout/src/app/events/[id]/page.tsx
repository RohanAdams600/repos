import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { positionLabel } from '@/lib/athletes/positions'
import { AttendanceForm } from '@/components/events/attendance-form'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { isAdmin } from '@/lib/auth/permissions'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { EVENT_KIND_LABEL, eventJsonLd, formatEventDates, utcDay } from '@/lib/events/rules'
import { attendanceFor, attendeesForCoach, eventDetail } from '@/lib/events/service'
import { isPubliclyVisible } from '@/lib/profile/public'
import { SPORT_LABEL } from '@/lib/sports'

const load = cache(async (id: string) => eventDetail(id, await getSessionUser()))

export async function generateMetadata({ params }: PageProps<'/events/[id]'>): Promise<Metadata> {
  const event = await load((await params).id)
  if (!event) return { title: 'Event not found', robots: { index: false } }
  const listed = event.status === 'PUBLISHED' || event.status === 'CANCELED'
  return {
    title: `${event.name}, ${event.city}, ${event.state}`,
    description: `${EVENT_KIND_LABEL[event.kind]} for ${SPORT_LABEL[event.sport].toLowerCase()} on ${formatEventDates(event.startDate, event.endDate)} in ${event.city}, ${event.state}. Organized by ${event.organizer}.`,
    alternates: { canonical: `/events/${event.id}` },
    robots: listed ? undefined : { index: false, follow: false },
  }
}

const NOTICES = {
  submitted: 'Thank you. Our staff will check the listing against the organizer’s page. You will get a notification when it is listed.',
  updated: 'Changes saved. Athletes who are going were notified.',
} as const

export default async function EventPage({ params, searchParams }: PageProps<'/events/[id]'>) {
  const { id } = await params
  const event = await load(id)
  if (!event) notFound()
  const user = await getSessionUser()
  const noticeKey = (await searchParams).notice
  const notice = typeof noticeKey === 'string' && noticeKey in NOTICES ? NOTICES[noticeKey as keyof typeof NOTICES] : null
  const open = event.status === 'PUBLISHED' && event.endDate >= utcDay(new Date())
  const athlete = user?.role === 'ATHLETE' && user.hasAthleteProfile ? user : null
  const [attendance, profilePublic, attendees] = await Promise.all([
    athlete ? attendanceFor(athlete.id, event.id) : Promise.resolve(null),
    athlete ? isPubliclyVisible(athlete.id) : Promise.resolve(false),
    user?.role === 'COACH' && event.status === 'PUBLISHED' ? attendeesForCoach(user, event.id) : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      {(event.status === 'PUBLISHED' || event.status === 'CANCELED') && <JsonLd data={eventJsonLd({ ...event, status: event.status }, `${env().APP_URL}/events/${event.id}`)} />}
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: event.name }]} />
        <h1 className="text-4xl font-bold">{event.name}</h1>
        <p className="text-lg text-fg-muted">
          {EVENT_KIND_LABEL[event.kind]}, {SPORT_LABEL[event.sport]}
        </p>
      </div>
      {notice && (
        <Alert tone="success" focusOnMount>
          {notice}
        </Alert>
      )}
      {event.status === 'CANCELED' && <Alert tone="error" title="Canceled">{event.reviewNote ?? 'This event was canceled.'}</Alert>}
      {event.status === 'PENDING' && <Alert tone="info">Waiting for staff review. Only you and our staff can see this page.</Alert>}
      {event.status === 'REJECTED' && <Alert tone="error" title="Not listed">{event.reviewNote ?? 'We could not match this listing to the organizer’s page.'}</Alert>}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        <dt className="font-bold">Dates</dt>
        <dd>{formatEventDates(event.startDate, event.endDate)}</dd>
        <dt className="font-bold">Location</dt>
        <dd>
          {event.venue ? `${event.venue}, ` : ''}
          {event.city}, {event.state}
        </dd>
        <dt className="font-bold">Organizer</dt>
        <dd>{event.organizer}</dd>
        {(event.gradYearMin || event.gradYearMax) && (
          <>
            <dt className="font-bold">Classes</dt>
            <dd className="tabular">
              {event.gradYearMin ?? 'Any'} to {event.gradYearMax ?? 'any'}
            </dd>
          </>
        )}
        {event.costText && (
          <>
            <dt className="font-bold">Cost</dt>
            <dd>{event.costText} (as listed by the organizer)</dd>
          </>
        )}
      </dl>
      <p className="break-words whitespace-pre-wrap">{event.description}</p>
      <p>
        <a href={event.officialUrl} rel="noopener noreferrer nofollow" target="_blank">
          Organizer&apos;s page for this event<span className="sr-only"> (opens in a new tab)</span>
        </a>
        . Register and confirm details there.
      </p>

      {open && (
        <section aria-labelledby="going-heading" className="flex flex-col gap-4 border-2 border-border-subtle p-5">
          <h2 id="going-heading" className="text-2xl font-bold">
            Going?
          </h2>
          {athlete ? (
            <AttendanceForm eventId={event.id} going={attendance !== null} shareWithCoaches={attendance?.shareWithCoaches ?? false} profilePublic={profilePublic} />
          ) : user ? (
            <p className="text-fg-muted">Athletes can mark the events they are going to.</p>
          ) : (
            <p className="text-fg-muted">
              <Link href={`/sign-in?next=/events/${event.id}`}>Sign in</Link> as an athlete to keep track of events you are going to.
            </p>
          )}
        </section>
      )}

      {attendees && (
        <section aria-labelledby="attendees-heading" className="flex flex-col gap-3">
          <h2 id="attendees-heading" className="text-2xl font-bold">
            Athletes going
          </h2>
          <p className="text-fg-muted">Athletes who chose to show coaches they are going and whose profiles are public. For athletes under 18, a parent or guardian has consented.</p>
          {attendees.length === 0 ? (
            <p className="text-fg-muted">No athletes have shared that they are going yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attendees.map((a) => (
                <li key={a.publicSlug} className="flex flex-wrap items-baseline justify-between gap-2 border-2 border-border-subtle p-3">
                  <Link href={`/p/${a.publicSlug}`} className="font-bold">
                    {a.firstName} {a.lastName}
                  </Link>
                  <span className="text-sm text-fg-muted">
                    Class of <span className="tabular">{a.gradYear}</span>, {positionLabel(a.primaryPosition)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user && isAdmin(user) && event.status === 'PUBLISHED' && (
        <p>
          <Link href={`/events/${event.id}/edit`}>Edit this listing</Link> (staff). Cancel it from the operations console.
        </p>
      )}
    </div>
  )
}
