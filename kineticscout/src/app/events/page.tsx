import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { EventKind, Sport } from '@/generated/prisma/enums'
import { pick } from '@/i18n/define'
import { chromeMessages } from '@/i18n/messages/chrome'
import { domain, formatDayRange } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'
import { getLocale, messages } from '@/i18n/server'
import { EVENT_KIND_LABEL, SPORTS } from '@/lib/events/rules'
import { listEvents } from '@/lib/events/service'
import { US_STATES } from '@/lib/us-states'

export async function generateMetadata(): Promise<Metadata> {
  const m = (await messages(eventsMessages)).list
  return { title: m.title, description: m.description, alternates: { canonical: '/events' } }
}

const KINDS = Object.keys(EVENT_KIND_LABEL) as EventKind[]
const STATES = new Set(US_STATES.map(([c]) => c))

export default async function EventsPage({ searchParams }: PageProps<'/events'>) {
  const params = await searchParams
  const locale = await getLocale()
  const m = pick(eventsMessages, locale).list
  const d = domain(locale)
  const c = await messages(chromeMessages)
  const sport = typeof params.sport === 'string' && (SPORTS as readonly string[]).includes(params.sport) ? (params.sport as Sport) : undefined
  const kind = typeof params.kind === 'string' && (KINDS as string[]).includes(params.kind) ? (params.kind as EventKind) : undefined
  const state = typeof params.state === 'string' && STATES.has(params.state) ? params.state : undefined
  const page = typeof params.page === 'string' ? Number.parseInt(params.page, 10) || 1 : 1
  const result = await listEvents({ sport, kind, state, page })
  const query = (p: number) => `/events?${new URLSearchParams({ ...(sport ? { sport } : {}), ...(kind ? { kind } : {}), ...(state ? { state } : {}), page: String(p) })}`

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.crumb }]} />
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">{m.lead}</p>
        <p>
          <Link href="/recruiting-calendar">{m.seeCalendar}</Link> {m.calendarSuffix}
        </p>
      </div>

      <form method="get" className="grid gap-4 border-2 border-border-subtle p-4 sm:grid-cols-4 sm:items-end" aria-label={m.filter}>
        <label className="flex flex-col gap-2 font-bold">
          {m.sport}
          <select name="sport" defaultValue={sport ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">{m.allSports}</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {d.sport[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-bold">
          {m.type}
          <select name="kind" defaultValue={kind ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">{m.allTypes}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {d.eventKind[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-bold">
          {m.state}
          <select name="state" defaultValue={state ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">{m.allStates}</option>
            {US_STATES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          {m.show}
        </button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title={m.emptyTitle} action={<Link href="/events/submit">{m.submit}</Link>}>
          <p>{m.empty}</p>
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3" aria-label={m.upcoming}>
          {result.items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
              <h2 className="text-xl font-bold">
                <Link href={`/events/${e.id}`}>{e.name}</Link>
              </h2>
              <p className="text-fg-muted">
                {d.eventKind[e.kind]}, {d.sport[e.sport]}. {formatDayRange(e.startDate, e.endDate, locale)}. {e.city}, {e.state}.
              </p>
              <p className="text-sm text-fg-muted">
                {m.organizer}: {e.organizer}
                {e.gradYearMin || e.gradYearMax ? `. ${m.classes(String(e.gradYearMin ?? m.any), String(e.gradYearMax ?? m.any))}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
      {result.pages > 1 && (
        <nav aria-label={m.pages} className="flex gap-3">
          {result.page > 1 && <Link href={query(result.page - 1)}>{m.previous}</Link>}
          <span className="tabular text-fg-muted">{m.page(result.page, result.pages)}</span>
          {result.page < result.pages && <Link href={query(result.page + 1)}>{m.next}</Link>}
        </nav>
      )}
      <p>
        {m.missing} <Link href="/events/submit">{m.submitForReview}</Link>.
      </p>
    </div>
  )
}
