import Link from 'next/link'
import type { Division, RecruitingPeriodKind, Sport } from '@/generated/prisma/enums'
import { pick } from '@/i18n/define'
import { domain, formatDayRange } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'
import { getLocale } from '@/i18n/server'

type Period = { kind: RecruitingPeriodKind; startDate: Date; endDate: Date; sourceUrl: string; sourceTitle: string } | null

/** Today's recruiting period for a coach's sport and division, with its source. Never a rules ruling. */
export async function PeriodToday({ sport, division, period }: { sport: Sport; division: Division; period: Period }) {
  const locale = await getLocale()
  const all = pick(eventsMessages, locale)
  const m = all.calendar
  const d = domain(locale)
  return (
    <section aria-labelledby="period-heading" className="flex flex-col gap-2 border-2 border-border-subtle p-5">
      <h2 id="period-heading" className="text-xl font-bold">
        {m.todayTitle}
      </h2>
      {period ? (
        <p>
          <strong>{d.period[period.kind]}</strong>{' '}
          {m.todayRest(d.sport[sport], division, formatDayRange(period.startDate, period.endDate, locale))} {m.source}:{' '}
          <a href={period.sourceUrl} rel="noopener noreferrer" target="_blank">
            {period.sourceTitle}
            <span className="sr-only"> {all.detail.newTab}</span>
          </a>
          .
        </p>
      ) : (
        <p className="text-fg-muted">{m.noneToday(d.sport[sport], division)}</p>
      )}
      <p className="text-sm text-fg-muted">
        {m.todayNote} <Link href="/recruiting-calendar">{m.fullCalendar}</Link>.
      </p>
    </section>
  )
}
