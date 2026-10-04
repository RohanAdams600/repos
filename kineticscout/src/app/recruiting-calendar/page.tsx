import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { Division, RecruitingPeriodKind, Sport } from '@/generated/prisma/enums'
import { pick } from '@/i18n/define'
import { chromeMessages } from '@/i18n/messages/chrome'
import { domain, formatDayRange } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'
import { getLocale, messages } from '@/i18n/server'
import { DIVISIONS, SPORTS } from '@/lib/events/rules'
import { calendar } from '@/lib/events/service'

export async function generateMetadata(): Promise<Metadata> {
  const m = (await messages(eventsMessages)).calendar
  return { title: m.title, description: m.description, alternates: { canonical: '/recruiting-calendar' } }
}

const KINDS: RecruitingPeriodKind[] = ['CONTACT', 'EVALUATION', 'QUIET', 'DEAD']

export default async function RecruitingCalendarPage({ searchParams }: PageProps<'/recruiting-calendar'>) {
  const params = await searchParams
  const locale = await getLocale()
  const all = pick(eventsMessages, locale)
  const m = all.calendar
  const d = domain(locale)
  const c = await messages(chromeMessages)
  const sport = typeof params.sport === 'string' && (SPORTS as readonly string[]).includes(params.sport) ? (params.sport as Sport) : undefined
  const division = typeof params.division === 'string' && (DIVISIONS as readonly string[]).includes(params.division) ? (params.division as Division) : undefined
  const periods = await calendar({ sport, division })
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: c.homeCrumb, href: '/' }, { label: m.title }]} />
        <h1 className="text-4xl font-bold">{m.title}</h1>
        <p className="text-lg text-fg-muted">{m.lead}</p>
      </div>
      <form method="get" className="grid gap-4 border-2 border-border-subtle p-4 sm:grid-cols-3 sm:items-end" aria-label={m.filter}>
        <label className="flex flex-col gap-2 font-bold">
          {all.list.sport}
          <select name="sport" defaultValue={sport ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">{all.list.allSports}</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {d.sport[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 font-bold">
          {m.division}
          <select name="division" defaultValue={division ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">{m.allDivisions}</option>
            {DIVISIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          {m.show}
        </button>
      </form>
      <section aria-labelledby="meaning-heading" className="flex flex-col gap-3">
        <h2 id="meaning-heading" className="text-2xl font-bold">
          {m.meaningTitle}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {KINDS.map((k) => (
            <div key={k} className="contents">
              <dt className="font-bold">{d.period[k]}</dt>
              <dd className="text-fg-muted">{m.meaning[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-fg-muted">{m.summaryOnly}</p>
      </section>
      {periods.length === 0 ? (
        <EmptyState title={m.emptyTitle}>
          <p>{m.empty(sport ? d.sport[sport].toLowerCase() : m.thisSelection, division ?? null)}</p>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">{m.caption}</caption>
            <thead>
              <tr className="border-b-2 border-border-strong">
                <th scope="col" className="py-2 pr-4">{m.colSport}</th>
                <th scope="col" className="py-2 pr-4">{m.colPeriod}</th>
                <th scope="col" className="py-2 pr-4">{m.colDates}</th>
                <th scope="col" className="py-2">{m.colSource}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle align-top">
                  <td className="py-2 pr-4">
                    {d.sport[p.sport]}, {p.division}
                  </td>
                  <td className="py-2 pr-4 font-bold">
                    {d.period[p.kind]}
                    {p.note && <span className="block text-sm font-normal text-fg-muted">{p.note}</span>}
                  </td>
                  <td className="py-2 pr-4">{formatDayRange(p.startDate, p.endDate, locale)}</td>
                  <td className="py-2">
                    <a href={p.sourceUrl} rel="noopener noreferrer" target="_blank">
                      {p.sourceTitle}
                      <span className="sr-only"> {all.detail.newTab}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        {m.browse} <Link href="/events">{m.browseLink}</Link>.
      </p>
    </div>
  )
}
