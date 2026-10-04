import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { pick } from '@/i18n/define'
import { chromeMessages } from '@/i18n/messages/chrome'
import { domain, formatDayRange } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'
import { getLocale, messages } from '@/i18n/server'
import { requireAthlete } from '@/lib/auth/session'
import { athleteEvents } from '@/lib/events/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(eventsMessages)).mine.title }
}

export default async function AthleteEventsPage() {
  const user = await requireAthlete('/dashboard/events')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const locale = await getLocale()
  const m = pick(eventsMessages, locale).mine
  const d = domain(locale)
  const c = await messages(chromeMessages)
  const { upcoming, past } = await athleteEvents(user.id)
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: c.dashboard, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">
          {m.lead} <Link href="/events">{m.eventsPage}</Link>
          {m.andCheck} <Link href="/recruiting-calendar">{m.calendar}</Link>.
        </p>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState title={m.emptyTitle} action={<Link href="/events">{m.browse}</Link>}>
          <p>{m.empty}</p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={m.upcoming}>
          {upcoming.map(({ event, shareWithCoaches }) => (
            <li key={event.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
              <Link href={`/events/${event.id}`} className="text-lg font-bold">
                {event.name}
              </Link>
              <span className="text-fg-muted">
                {d.eventKind[event.kind]}. {formatDayRange(event.startDate, event.endDate, locale)}. {event.city}, {event.state}.
              </span>
              <span className="text-sm">{event.status === 'CANCELED' ? <strong className="text-danger">{m.canceled}</strong> : shareWithCoaches ? m.shown : m.notShown}</span>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past-heading" className="flex flex-col gap-3">
          <h2 id="past-heading" className="text-2xl font-bold">
            {m.recent}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {past.map(({ event }) => (
              <li key={event.id}>
                <Link href={`/events/${event.id}`}>{event.name}</Link>, {formatDayRange(event.startDate, event.endDate, locale)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
