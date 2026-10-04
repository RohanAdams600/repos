import type { Metadata } from 'next'
import Link from 'next/link'
import { EventForm } from '@/components/events/event-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { chromeMessages } from '@/i18n/messages/chrome'
import { eventsMessages } from '@/i18n/messages/events'
import { messages } from '@/i18n/server'
import { isAdmin } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { canSubmitEvent, mySubmissions } from '@/lib/events/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(eventsMessages)).submit.title, robots: { index: false } }
}

export default async function SubmitEventPage() {
  const user = await requireUser('/events/submit')
  const [all, c] = await Promise.all([messages(eventsMessages), messages(chromeMessages)])
  const m = all.submit
  const allowed = canSubmitEvent(user)
  const submissions = allowed ? await mySubmissions(user.id) : []
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: all.list.crumb, href: '/events' }, { label: m.title }]} />
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.lead}</p>
      </div>
      {allowed ? (
        <EventForm staff={isAdmin(user)} />
      ) : (
        <Alert tone="info">
          {m.athletes} <Link href="/contact">{m.contactPage}</Link>.
        </Alert>
      )}
      {submissions.length > 0 && (
        <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
          <h2 id="mine-heading" className="text-2xl font-bold">
            {m.yours}
          </h2>
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 border-2 border-border-subtle p-3">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/events/${s.id}`} className="font-bold">
                    {s.name}
                  </Link>
                  <span className="text-sm">{m.status[s.status]}</span>
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
