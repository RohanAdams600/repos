import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { AttendanceForm } from '@/components/events/attendance-form'
import { JsonLd } from '@/components/json-ld'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { pick } from '@/i18n/define'
import { chromeMessages } from '@/i18n/messages/chrome'
import { domain, formatDayRange } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'
import { getLocale, messages } from '@/i18n/server'
import { isAdmin } from '@/lib/auth/permissions'
import { getSessionUser } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { eventJsonLd, utcDay } from '@/lib/events/rules'
import { attendanceFor, attendeesForCoach, eventDetail } from '@/lib/events/service'
import { isPubliclyVisible } from '@/lib/profile/public'

const load = cache(async (id: string) => eventDetail(id, await getSessionUser()))

export async function generateMetadata({ params }: PageProps<'/events/[id]'>): Promise<Metadata> {
  const locale = await getLocale()
  const m = pick(eventsMessages, locale).detail
  const event = await load((await params).id)
  if (!event) return { title: m.notFound, robots: { index: false } }
  const d = domain(locale)
  const listed = event.status === 'PUBLISHED' || event.status === 'CANCELED'
  return {
    title: `${event.name}, ${event.city}, ${event.state}`,
    description: m.metaDescription(d.eventKind[event.kind], d.sport[event.sport], formatDayRange(event.startDate, event.endDate, locale), `${event.city}, ${event.state}`, event.organizer),
    alternates: { canonical: `/events/${event.id}` },
    robots: listed ? undefined : { index: false, follow: false },
  }
}

export default async function EventPage({ params, searchParams }: PageProps<'/events/[id]'>) {
  const { id } = await params
  const event = await load(id)
  if (!event) notFound()
  const locale = await getLocale()
  const all = pick(eventsMessages, locale)
  const m = all.detail
  const d = domain(locale)
  const c = await messages(chromeMessages)
  const user = await getSessionUser()
  const noticeKey = (await searchParams).notice
  const notice = noticeKey === 'submitted' ? m.submitted : noticeKey === 'updated' ? m.updated : null
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
        <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: all.list.crumb, href: '/events' }, { label: event.name }]} />
        <h1 className="text-4xl font-bold">{event.name}</h1>
        <p className="text-lg text-fg-muted">
          {d.eventKind[event.kind]}, {d.sport[event.sport]}
        </p>
      </div>
      {notice && (
        <Alert tone="success" focusOnMount>
          {notice}
        </Alert>
      )}
      {event.status === 'CANCELED' && <Alert tone="error" title={m.canceled}>{event.reviewNote ?? m.canceledDefault}</Alert>}
      {event.status === 'PENDING' && <Alert tone="info">{m.pending}</Alert>}
      {event.status === 'REJECTED' && <Alert tone="error" title={m.notListed}>{event.reviewNote ?? m.rejectedDefault}</Alert>}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
        <dt className="font-bold">{m.dates}</dt>
        <dd>{formatDayRange(event.startDate, event.endDate, locale)}</dd>
        <dt className="font-bold">{m.location}</dt>
        <dd>
          {event.venue ? `${event.venue}, ` : ''}
          {event.city}, {event.state}
        </dd>
        <dt className="font-bold">{m.organizer}</dt>
        <dd>{event.organizer}</dd>
        {(event.gradYearMin || event.gradYearMax) && (
          <>
            <dt className="font-bold">{m.classes}</dt>
            <dd className="tabular">
              {event.gradYearMin ?? m.anyFrom} {m.to} {event.gradYearMax ?? m.anyTo}
            </dd>
          </>
        )}
        {event.costText && (
          <>
            <dt className="font-bold">{m.cost}</dt>
            <dd>
              {event.costText} {m.asListed}
            </dd>
          </>
        )}
      </dl>
      <p className="break-words whitespace-pre-wrap">{event.description}</p>
      <p>
        <a href={event.officialUrl} rel="noopener noreferrer nofollow" target="_blank">
          {m.organizerPage}
          <span className="sr-only"> {m.newTab}</span>
        </a>
        . {m.registerThere}
      </p>

      {open && (
        <section aria-labelledby="going-heading" className="flex flex-col gap-4 border-2 border-border-subtle p-5">
          <h2 id="going-heading" className="text-2xl font-bold">
            {m.going}
          </h2>
          {athlete ? (
            <AttendanceForm eventId={event.id} going={attendance !== null} shareWithCoaches={attendance?.shareWithCoaches ?? false} profilePublic={profilePublic} />
          ) : user ? (
            <p className="text-fg-muted">{m.athletesOnly}</p>
          ) : (
            <p className="text-fg-muted">
              <Link href={`/sign-in?next=/events/${event.id}`}>{m.signIn}</Link> {m.signInSuffix}
            </p>
          )}
        </section>
      )}

      {attendees && (
        <section aria-labelledby="attendees-heading" className="flex flex-col gap-3">
          <h2 id="attendees-heading" className="text-2xl font-bold">
            {m.athletesGoing}
          </h2>
          <p className="text-fg-muted">{m.athletesGoingNote}</p>
          {attendees.length === 0 ? (
            <p className="text-fg-muted">{m.noneGoing}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attendees.map((a) => (
                <li key={a.publicSlug} className="flex flex-wrap items-baseline justify-between gap-2 border-2 border-border-subtle p-3">
                  <Link href={`/p/${a.publicSlug}`} className="font-bold">
                    {a.firstName} {a.lastName}
                  </Link>
                  <span className="text-sm text-fg-muted">
                    {m.classOf} <span className="tabular">{a.gradYear}</span>, {d.position[a.primaryPosition]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user && isAdmin(user) && event.status === 'PUBLISHED' && (
        <p>
          <Link href={`/events/${event.id}/edit`}>{m.editListing}</Link> {m.editSuffix}
        </p>
      )}
    </div>
  )
}
