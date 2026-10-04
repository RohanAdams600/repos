import Link from 'next/link'
import type { Division, RecruitingPeriodKind, Sport } from '@/generated/prisma/enums'
import { formatEventDates, PERIOD_LABEL } from '@/lib/events/rules'
import { SPORT_LABEL } from '@/lib/sports'

type Period = { kind: RecruitingPeriodKind; startDate: Date; endDate: Date; sourceUrl: string; sourceTitle: string } | null

/** Today's recruiting period for a coach's sport and division, with its source. Never a rules ruling. */
export function PeriodToday({ sport, division, period }: { sport: Sport; division: Division; period: Period }) {
  return (
    <section aria-labelledby="period-heading" className="flex flex-col gap-2 border-2 border-border-subtle p-5">
      <h2 id="period-heading" className="text-xl font-bold">
        Recruiting calendar today
      </h2>
      {period ? (
        <p>
          <strong>{PERIOD_LABEL[period.kind]}</strong> for {SPORT_LABEL[sport].toLowerCase()} in {division}, {formatEventDates(period.startDate, period.endDate)}. Source:{' '}
          <a href={period.sourceUrl} rel="noopener noreferrer" target="_blank">
            {period.sourceTitle}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      ) : (
        <p className="text-fg-muted">
          We have no period on file for {SPORT_LABEL[sport].toLowerCase()} in {division} today. Check your association&apos;s calendar.
        </p>
      )}
      <p className="text-sm text-fg-muted">
        Entered by our staff from the published calendar. Your compliance office has the final word. <Link href="/recruiting-calendar">Full calendar</Link>.
      </p>
    </section>
  )
}
