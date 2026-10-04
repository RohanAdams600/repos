import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { EventKind, Sport } from '@/generated/prisma/enums'
import { EVENT_KIND_LABEL, formatEventDates, SPORTS } from '@/lib/events/rules'
import { listEvents } from '@/lib/events/service'
import { SPORT_LABEL } from '@/lib/sports'
import { US_STATES } from '@/lib/us-states'

export const metadata: Metadata = {
  title: 'Showcases, camps and combines',
  description: 'Upcoming baseball, hockey and football showcases, camps, combines and tournaments, each checked against the organizer’s own page.',
  alternates: { canonical: '/events' },
}

const KINDS = Object.keys(EVENT_KIND_LABEL) as EventKind[]
const STATES = new Set(US_STATES.map(([c]) => c))

export default async function EventsPage({ searchParams }: PageProps<'/events'>) {
  const params = await searchParams
  const sport = typeof params.sport === 'string' && (SPORTS as readonly string[]).includes(params.sport) ? (params.sport as Sport) : undefined
  const kind = typeof params.kind === 'string' && (KINDS as string[]).includes(params.kind) ? (params.kind as EventKind) : undefined
  const state = typeof params.state === 'string' && STATES.has(params.state) ? params.state : undefined
  const page = typeof params.page === 'string' ? Number.parseInt(params.page, 10) || 1 : 1
  const result = await listEvents({ sport, kind, state, page })
  const query = (p: number) => `/events?${new URLSearchParams({ ...(sport ? { sport } : {}), ...(kind ? { kind } : {}), ...(state ? { state } : {}), page: String(p) })}`

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Events' }]} />
        <h1 className="text-4xl font-bold">Showcases, camps and combines</h1>
        <p className="text-lg text-fg-muted">
          Upcoming events submitted by coaches and parents. Our staff check each listing against the organizer&apos;s own page before it appears here. KineticScout does not run,
          endorse or rank these events; confirm details and costs with the organizer.
        </p>
        <p>
          <Link href="/recruiting-calendar">See the recruiting calendar</Link> for contact, evaluation, quiet and dead periods.
        </p>
      </div>

      <form method="get" className="grid gap-4 border-2 border-border-subtle p-4 sm:grid-cols-4 sm:items-end" aria-label="Filter events">
        <label className="flex flex-col gap-2 font-bold">
          Sport
          <select name="sport" defaultValue={sport ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">All sports</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-bold">
          Type
          <select name="kind" defaultValue={kind ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">All types</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-bold">
          State
          <select name="state" defaultValue={state ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">All states</option>
            {US_STATES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          Show events
        </button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="No upcoming events match" action={<Link href="/events/submit">Submit an event</Link>}>
          <p>Try fewer filters, or tell us about an event you know.</p>
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Upcoming events">
          {result.items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
              <h2 className="text-xl font-bold">
                <Link href={`/events/${e.id}`}>{e.name}</Link>
              </h2>
              <p className="text-fg-muted">
                {EVENT_KIND_LABEL[e.kind]}, {SPORT_LABEL[e.sport]}. {formatEventDates(e.startDate, e.endDate)}. {e.city}, {e.state}.
              </p>
              <p className="text-sm text-fg-muted">
                Organizer: {e.organizer}
                {e.gradYearMin || e.gradYearMax ? `. Classes ${e.gradYearMin ?? 'any'} to ${e.gradYearMax ?? 'any'}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
      {result.pages > 1 && (
        <nav aria-label="Pages" className="flex gap-3">
          {result.page > 1 && <Link href={query(result.page - 1)}>Previous page</Link>}
          <span className="tabular text-fg-muted">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages && <Link href={query(result.page + 1)}>Next page</Link>}
        </nav>
      )}
      <p>
        Know an event that is missing? <Link href="/events/submit">Submit it for review</Link>.
      </p>
    </div>
  )
}
