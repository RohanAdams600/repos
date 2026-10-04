import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { Division, Sport } from '@/generated/prisma/enums'
import { DIVISIONS, formatEventDates, PERIOD_LABEL, SPORTS } from '@/lib/events/rules'
import { calendar } from '@/lib/events/service'
import { SPORT_LABEL } from '@/lib/sports'

export const metadata: Metadata = {
  title: 'Recruiting calendar',
  description: 'Contact, evaluation, quiet and dead periods for college baseball, hockey and football recruiting, each linked to the published source.',
  alternates: { canonical: '/recruiting-calendar' },
}

const PERIOD_MEANING = {
  CONTACT: 'College coaches may have in-person contact with recruits, within the rules for the sport and division.',
  EVALUATION: 'Coaches may watch athletes compete or practice, but in-person contact off campus is limited.',
  QUIET: 'In-person contact happens only on the college campus.',
  DEAD: 'No in-person recruiting contact. Calls, messages and email may still be allowed.',
} as const

export default async function RecruitingCalendarPage({ searchParams }: PageProps<'/recruiting-calendar'>) {
  const params = await searchParams
  const sport = typeof params.sport === 'string' && (SPORTS as readonly string[]).includes(params.sport) ? (params.sport as Sport) : undefined
  const division = typeof params.division === 'string' && (DIVISIONS as readonly string[]).includes(params.division) ? (params.division as Division) : undefined
  const periods = await calendar({ sport, division })
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Recruiting calendar' }]} />
        <h1 className="text-4xl font-bold">Recruiting calendar</h1>
        <p className="text-lg text-fg-muted">
          When college coaches may contact recruits in person. Our staff copy each period from the governing body&apos;s published calendar and link the source. Rules differ by
          sport and division and change every year: always check the source, and ask the college&apos;s compliance office when in doubt. KineticScout does not give rules advice.
        </p>
      </div>
      <form method="get" className="grid gap-4 border-2 border-border-subtle p-4 sm:grid-cols-3 sm:items-end" aria-label="Filter the calendar">
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
          Division
          <select name="division" defaultValue={division ?? ''} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3 font-normal">
            <option value="">All divisions</option>
            {DIVISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          Show periods
        </button>
      </form>
      <section aria-labelledby="meaning-heading" className="flex flex-col gap-3">
        <h2 id="meaning-heading" className="text-2xl font-bold">
          What the periods mean
        </h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {(Object.keys(PERIOD_MEANING) as (keyof typeof PERIOD_MEANING)[]).map((k) => (
            <div key={k} className="contents">
              <dt className="font-bold">{PERIOD_LABEL[k]}</dt>
              <dd className="text-fg-muted">{PERIOD_MEANING[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-fg-muted">A general summary only. The source document for each period is what counts.</p>
      </section>
      {periods.length === 0 ? (
        <EmptyState title="No periods entered yet">
          <p>
            We have not entered periods for {sport ? SPORT_LABEL[sport].toLowerCase() : 'this selection'}
            {division ? ` in ${division}` : ''} yet. Check the governing body&apos;s website directly.
          </p>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">Recruiting periods</caption>
            <thead>
              <tr className="border-b-2 border-border-strong">
                <th scope="col" className="py-2 pr-4">Sport and division</th>
                <th scope="col" className="py-2 pr-4">Period</th>
                <th scope="col" className="py-2 pr-4">Dates</th>
                <th scope="col" className="py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-border-subtle align-top">
                  <td className="py-2 pr-4">
                    {SPORT_LABEL[p.sport]}, {p.division}
                  </td>
                  <td className="py-2 pr-4 font-bold">
                    {PERIOD_LABEL[p.kind]}
                    {p.note && <span className="block text-sm font-normal text-fg-muted">{p.note}</span>}
                  </td>
                  <td className="py-2 pr-4">{formatEventDates(p.startDate, p.endDate)}</td>
                  <td className="py-2">
                    <a href={p.sourceUrl} rel="noopener noreferrer" target="_blank">
                      {p.sourceTitle}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        Looking for events to attend? <Link href="/events">Browse showcases, camps and combines</Link>.
      </p>
    </div>
  )
}
