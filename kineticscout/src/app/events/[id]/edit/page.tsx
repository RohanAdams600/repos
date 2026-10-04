import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EventForm } from '@/components/events/event-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireAdmin } from '@/lib/auth/session'
import { eventDetail } from '@/lib/events/service'
import { eventsMessages } from '@/i18n/messages/events'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(eventsMessages)).submit.editTitle, robots: { index: false } }
}

const day = (d: Date) => d.toISOString().slice(0, 10)

export default async function EditEventPage({ params }: PageProps<'/events/[id]/edit'>) {
  const admin = await requireAdmin()
  const event = await eventDetail((await params).id, admin)
  if (!event || event.status !== 'PUBLISHED') notFound()
  const all = await messages(eventsMessages)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: all.list.crumb, href: '/events' }, { label: event.name, href: `/events/${event.id}` }, { label: all.submit.editTitle }]} />
        <h1 className="text-4xl font-bold">{all.submit.editTitle}: {event.name}</h1>
        <p className="text-fg-muted">{all.submit.editLead}</p>
      </div>
      <EventForm
        staff
        eventId={event.id}
        defaults={{
          name: event.name,
          kind: event.kind,
          sport: event.sport,
          organizer: event.organizer,
          officialUrl: event.officialUrl,
          startDate: day(event.startDate),
          endDate: day(event.endDate),
          city: event.city,
          state: event.state,
          venue: event.venue ?? '',
          gradYearMin: event.gradYearMin?.toString() ?? '',
          gradYearMax: event.gradYearMax?.toString() ?? '',
          costText: event.costText ?? '',
          description: event.description,
        }}
      />
    </div>
  )
}
