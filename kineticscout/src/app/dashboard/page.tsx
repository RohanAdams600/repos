import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CoachHome } from '@/components/coach/coach-home'
import { PeriodToday } from '@/components/events/period-today'
import { verifiedCoach } from '@/lib/coach/verification'
import { periodToday } from '@/lib/events/service'
import { GuardianBanner } from '@/components/dashboard/guardian-banner'
import { MetricLogForm } from '@/components/dashboard/metric-log-form'
import { ProgressionChart } from '@/components/dashboard/progression-chart'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { hasProAccess } from '@/lib/auth/permissions'
import { requireAthlete } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { formatMetric, METRIC_DEFINITIONS, METRIC_TYPES } from '@/lib/metrics/definitions'
import { pick } from '@/i18n/define'
import { dashboardMessages } from '@/i18n/messages/dashboard'
import { domain, percentileLabel } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { metricSummary } from '@/lib/metrics/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(dashboardMessages)).home.title }
}

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const user = await requireAthlete('/dashboard')
  const params = await searchParams
  const locale = await getLocale()
  const m = pick(dashboardMessages, locale).home
  const d = domain(locale)
  const notice = typeof params.notice === 'string' ? m.notices[params.notice] : undefined

  if (user.role === 'TEAM_COACH') redirect('/dashboard/team')
  if (user.role === 'GUARDIAN') redirect('/dashboard/family')

  if (user.role === 'COACH') {
    const coach = await verifiedCoach(user.id)
    const college = coach?.college
    const period = college ? await periodToday(college.sport, college.division) : null
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs items={[{ label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.coachTitle}</h1>
        <CoachHome />
        {college && <PeriodToday sport={college.sport} division={college.division} period={period} />}
      </div>
    )
  }

  const [profile, summary] = await Promise.all([
    db.athleteProfile.findUniqueOrThrow({
      where: { userId: user.id },
      select: { firstName: true, gradYear: true, sport: true, primaryPosition: true, isPublic: true },
    }),
    metricSummary(user),
  ])
  const sportMetrics = METRIC_TYPES.filter((t) => METRIC_DEFINITIONS[t].sport === profile.sport)
  const pro = hasProAccess(user)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.welcome(profile.firstName)}</h1>
        <p className="text-fg-muted">{m.summary(profile.gradYear, profile.isPublic, pro)}</p>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {user.ageBand === 'MINOR' && user.guardianConsent !== 'GRANTED' && <GuardianBanner revoked={user.guardianConsent === 'REVOKED'} />}

      <section aria-labelledby="log-title" className="flex flex-col gap-4">
        <h2 id="log-title" className="text-xl font-bold">
          {m.logTitle}
        </h2>
        {summary.quota.remaining === 0 ? (
          <Alert tone="info" title={m.limitTitle}>
            {m.limitBody} <Link href="/pricing">{m.upgradeLink}</Link> {m.limitTail}
          </Alert>
        ) : null}
        <MetricLogForm metricTypes={sportMetrics} remaining={summary.quota.remaining} userId={user.id} />
      </section>

      <section aria-labelledby="numbers-title" className="flex flex-col gap-4">
        <h2 id="numbers-title" className="text-xl font-bold">
          {m.numbersTitle}
        </h2>
        {summary.items.length === 0 ? (
          <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <caption className="sr-only">{m.caption}</caption>
              <thead>
                <tr className="border-b-2 border-border-subtle">
                  <th scope="col" className="py-3 pr-4">{m.metric}</th>
                  <th scope="col" className="py-3 pr-4 text-right">{m.best}</th>
                  <th scope="col" className="py-3 pr-4 text-right">{m.latest}</th>
                  <th scope="col" className="py-3">{m.classPercentile(summary.gradYear)}</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => (
                  <tr key={item.metricType} className="border-b border-border-subtle">
                    <th scope="row" className="py-3 pr-4 font-bold">
                      {d.metric[item.metricType]}
                    </th>
                    <td className="tabular py-3 pr-4 text-right">{formatMetric(item.metricType, item.best)}</td>
                    <td className="tabular py-3 pr-4 text-right">
                      {formatMetric(item.metricType, item.latest.value)}
                      <span className="block text-xs text-fg-muted">{item.latest.date}</span>
                    </td>
                    <td className="py-3">
                      {item.classPercentile !== null ? (
                        <span>
                          <span className="tabular font-bold">{percentileLabel(item.classPercentile, locale)}</span>
                          <span className="text-sm text-fg-muted">{m.ofAthletes(item.cohortSize ?? 0)}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-fg-muted">{m.notEnough}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-fg-muted">{m.percentileNote}</p>
      </section>

      {pro ? (
        summary.items.length > 0 && <ProgressionChart metricTypes={summary.items.map((i) => i.metricType)} />
      ) : (
        <section aria-labelledby="upgrade-title" className="flex flex-col items-start gap-3 border-2 border-border-subtle p-6">
          <h2 id="upgrade-title" className="text-xl font-bold">
            {m.proTitle}
          </h2>
          <p className="text-fg-muted">{m.proBody}</p>
          <Link href="/pricing" className={buttonVariants({ variant: 'primary' })}>
            {m.proCta}
          </Link>
        </section>
      )}
    </div>
  )
}
