import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAthlete } from '@/lib/auth/session'
import { K_MIN } from '@/lib/insights/build-cohort'
import { TRAIT_LABELS } from '@/lib/insights/projection'
import { athleteBiometrics, athleteProjections } from '@/lib/insights/service'
import { METRIC_DEFINITIONS, formatMetric } from '@/lib/metrics/definitions'
import { ordinal } from '@/lib/metrics/percentile'

export const metadata: Metadata = { title: 'Insights' }

const SPORT_LABEL = { BASEBALL: 'baseball', HOCKEY: 'hockey', FOOTBALL: 'football' } as const

export default async function InsightsPage() {
  const user = await requireAthlete('/dashboard/insights')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const [bio, projections] = await Promise.all([athleteBiometrics(user.id), athleteProjections(user.id)])

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Insights' }]} />
        <h1 className="text-3xl font-bold">Insights</h1>
      </div>

      <section aria-labelledby="build-title" className="flex flex-col gap-4">
        <h2 id="build-title" className="text-2xl font-bold">
          Compared with athletes your size
        </h2>
        <p className="text-fg-muted">
          Each best value from the last 18 months is ranked against KineticScout athletes of a similar age, height and weight who logged the
          same measurement. We start with a narrow group and widen it until at least {K_MIN} other athletes are included, and we show the range
          used. Values are mostly self-reported, and this is not a national ranking.
        </p>
        {bio.status === 'needs-build' ? (
          <Alert tone="info">
            Add your {bio.missing.join(' and ')} on <Link href="/dashboard/profile">Profile and sharing</Link> to see build-adjusted percentiles.
          </Alert>
        ) : bio.results.length === 0 ? (
          <EmptyState title="No measurements yet">Log a measurement from your dashboard to see how it compares with athletes your size.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {bio.results.map((r) => (
              <li key={r.metricType} className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{METRIC_DEFINITIONS[r.metricType].label}</span>
                  <span className="tabular text-lg font-bold">{formatMetric(r.metricType, r.value)}</span>
                </div>
                {r.status === 'ok' ? (
                  <p className="text-fg-muted">
                    Better than <span className="tabular font-bold text-fg">{r.percentile}%</span> of{' '}
                    <span className="tabular">{r.cohortSize}</span> athletes ({r.bandsLabel}).
                  </p>
                ) : (
                  <p className="text-fg-muted">
                    Not enough athletes with a similar build have logged this yet (largest group found: <span className="tabular">{r.largestCohort}</span>,
                    we need {K_MIN}).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="projection-title" className="flex flex-col gap-4">
        <h2 id="projection-title" className="text-2xl font-bold">
          Cross-sport equivalents
        </h2>
        <p className="text-fg-muted">
          Your standing on a measurement you have logged, read across to a related measurement in another sport: speed to speed, arm to arm,
          rotational power to rotational power. For example, if your 40-yard dash beats 80% of your class, we show the 60-yard dash time that
          beats 80% of baseball players in your class. It is an equivalent standing, not a prediction of what you would measure.
        </p>
        {projections.length === 0 ? (
          <EmptyState title="Nothing to compare yet">
            Equivalents appear once you have logged a speed, arm or rotational power measurement and enough athletes in the other sport have
            logged theirs.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {projections.map((p) => {
              const def = METRIC_DEFINITIONS[p.target]
              return (
                <li key={p.target} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold">
                      {def.label} <span className="font-normal text-fg-muted">({SPORT_LABEL[def.sport]})</span>
                    </span>
                    <span className="tabular text-lg font-bold">
                      {p.bound === 'at-least' ? 'at least ' : p.bound === 'at-most' ? 'at most ' : ''}
                      {formatMetric(p.target, p.value)}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted">
                    {TRAIT_LABELS[p.trait]}: your{' '}
                    {p.sources.map((s, i) => (
                      <span key={s.metricType}>
                        {i > 0 ? (i === p.sources.length - 1 ? ' and ' : ', ') : ''}
                        {METRIC_DEFINITIONS[s.metricType].label.toLowerCase()} ({ordinal(s.standing)} percentile)
                      </span>
                    ))}{' '}
                    {p.sources.length > 1 ? 'average' : 'is'} the <span className="tabular">{ordinal(p.standing)}</span> percentile. Compared with{' '}
                    {p.scope === 'class' ? `the class of ${p.gradYear}` : 'all classes'} on KineticScout.
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
