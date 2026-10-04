import type { Metadata } from 'next'
import Link from 'next/link'
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
import { ordinal } from '@/lib/metrics/percentile'
import { metricSummary } from '@/lib/metrics/service'

export const metadata: Metadata = { title: 'Dashboard' }

const NOTICES: Record<string, string> = {
  'profile-created': 'Your profile is saved. Log your first metric below.',
  'password-updated': 'Your password was changed and other devices were signed out.',
}

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const user = await requireAthlete('/dashboard')
  const params = await searchParams
  const notice = typeof params.notice === 'string' ? NOTICES[params.notice] : undefined

  if (user.role === 'COACH') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <EmptyState title="Coach tools are not available yet">
          Your coach account is set up. Search, saved prospects and messaging for coaches are in development; we will email you when they
          launch.
        </EmptyState>
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
        <Breadcrumbs items={[{ label: 'Dashboard' }]} />
        <h1 className="text-3xl font-bold">Welcome back, {profile.firstName}</h1>
        <p className="text-fg-muted">
          Class of {profile.gradYear}. Profile is {profile.isPublic ? 'public' : 'private'}. Plan: {pro ? 'Pro Prospect' : 'Scout (free)'}.
        </p>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {user.ageBand === 'MINOR' && user.guardianConsent !== 'GRANTED' && <GuardianBanner />}

      <section aria-labelledby="log-title" className="flex flex-col gap-4">
        <h2 id="log-title" className="text-xl font-bold">
          Log a metric
        </h2>
        {summary.quota.remaining === 0 ? (
          <Alert tone="info" title="Monthly free limit reached">
            You have logged 3 metrics this month. Your allowance resets on the 1st, or{' '}
            <Link href="/pricing">upgrade to Pro</Link> for unlimited logging.
          </Alert>
        ) : null}
        <MetricLogForm metricTypes={sportMetrics} remaining={summary.quota.remaining} />
      </section>

      <section aria-labelledby="numbers-title" className="flex flex-col gap-4">
        <h2 id="numbers-title" className="text-xl font-bold">
          Your numbers
        </h2>
        {summary.items.length === 0 ? (
          <EmptyState title="No metrics yet">Log your first measurement above to see your best numbers and class percentile.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <caption className="sr-only">Best values from the last 18 months with class percentile</caption>
              <thead>
                <tr className="border-b-2 border-border-subtle">
                  <th scope="col" className="py-3 pr-4">Metric</th>
                  <th scope="col" className="py-3 pr-4 text-right">Best</th>
                  <th scope="col" className="py-3 pr-4 text-right">Latest</th>
                  <th scope="col" className="py-3">Class of {summary.gradYear} percentile</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item) => (
                  <tr key={item.metricType} className="border-b border-border-subtle">
                    <th scope="row" className="py-3 pr-4 font-bold">
                      {METRIC_DEFINITIONS[item.metricType].label}
                    </th>
                    <td className="tabular py-3 pr-4 text-right">{formatMetric(item.metricType, item.best)}</td>
                    <td className="tabular py-3 pr-4 text-right">
                      {formatMetric(item.metricType, item.latest.value)}
                      <span className="block text-xs text-fg-muted">{item.latest.date}</span>
                    </td>
                    <td className="py-3">
                      {item.classPercentile !== null ? (
                        <span>
                          <span className="tabular font-bold">{ordinal(item.classPercentile)}</span>
                          <span className="text-sm text-fg-muted"> of {item.cohortSize} athletes</span>
                        </span>
                      ) : (
                        <span className="text-sm text-fg-muted">Not enough athletes in your class yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-fg-muted">
          Percentiles compare your best value with other KineticScout athletes in your graduating class and are updated weekly. Groups
          smaller than 25 athletes are not shown.
        </p>
      </section>

      {pro ? (
        summary.items.length > 0 && <ProgressionChart metricTypes={summary.items.map((i) => i.metricType)} />
      ) : (
        <section aria-labelledby="upgrade-title" className="flex flex-col items-start gap-3 border-2 border-border-subtle p-6">
          <h2 id="upgrade-title" className="text-xl font-bold">
            Go further with Pro
          </h2>
          <p className="text-fg-muted">Unlimited logging with progression charts, swing and pitch video analysis, and college matching.</p>
          <Link href="/pricing" className={buttonVariants({ variant: 'primary' })}>
            See Pro features
          </Link>
        </section>
      )}
    </div>
  )
}
