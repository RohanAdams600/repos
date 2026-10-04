import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAthlete } from '@/lib/auth/session'
import { describeBands, K_MIN } from '@/lib/insights/build-cohort'
import { describeNormBand } from '@/lib/insights/norms'
import { athleteBiometrics, athleteProjections } from '@/lib/insights/service'
import { pick } from '@/i18n/define'
import { INTL_LOCALE } from '@/i18n/config'
import { accountMessages } from '@/i18n/messages/account'
import { domain, percentileLabel } from '@/i18n/messages/domain'
import { recruitingMessages } from '@/i18n/messages/recruiting'
import { getLocale, messages } from '@/i18n/server'
import { METRIC_DEFINITIONS, formatMetric } from '@/lib/metrics/definitions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(recruitingMessages)).insights.title }
}

export default async function InsightsPage() {
  const user = await requireAthlete('/dashboard/insights')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const [bio, projections] = await Promise.all([athleteBiometrics(user.id), athleteProjections(user.id)])
  const locale = await getLocale()
  const m = pick(recruitingMessages, locale).insights
  const d = domain(locale)
  const dash = pick(accountMessages, locale).dashboard
  const num = (n: number) => n.toLocaleString(INTL_LOCALE[locale])

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
      </div>

      <section aria-labelledby="build-title" className="flex flex-col gap-4">
        <h2 id="build-title" className="text-2xl font-bold">
          {m.buildTitle}
        </h2>
        <p className="text-fg-muted">{m.buildIntro(K_MIN)}</p>
        {bio.status === 'needs-build' ? (
          <Alert tone="info">
            {m.needBuild(bio.missing.map((x) => m.missing[x]))} <Link href="/dashboard/profile">{m.profileLink}</Link>
            {m.needBuildTail}
          </Alert>
        ) : bio.results.length === 0 ? (
          <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {bio.results.map((r) => (
              <li key={r.metricType} className="flex flex-col gap-1 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-bold">{d.metric[r.metricType]}</span>
                  <span className="tabular text-lg font-bold">{formatMetric(r.metricType, r.value)}</span>
                </div>
                {r.national && (
                  <div className="flex flex-col gap-1">
                    <p>
                      <span className="font-bold">{m.national}</span>
                      {m.nationalBody(r.national.percentile, r.national.source.publisher, describeNormBand(r.national.band, locale), num(r.national.sampleSize))}
                    </p>
                    <p className="text-sm text-fg-muted">
                      {r.national.source.name}, {r.national.source.edition}. {r.national.source.population}{' '}
                      <a href={r.national.source.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                        {m.source}
                      </a>
                    </p>
                  </div>
                )}
                {r.status === 'ok' ? (
                  <p className="text-fg-muted">
                    <span className="font-bold text-fg">{m.ks}</span>
                    {m.ksBody(r.percentile, r.cohortSize, describeBands(r.bands, locale))}
                  </p>
                ) : (
                  <p className="text-fg-muted">
                    <span className="font-bold text-fg">{m.ks}</span>
                    {m.ksNotEnough(r.largestCohort, K_MIN)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="projection-title" className="flex flex-col gap-4">
        <h2 id="projection-title" className="text-2xl font-bold">
          {m.crossTitle}
        </h2>
        <p className="text-fg-muted">{m.crossIntro}</p>
        {projections.length === 0 ? (
          <EmptyState title={m.crossEmptyTitle}>{m.crossEmptyBody}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {projections.map((p) => {
              const def = METRIC_DEFINITIONS[p.target]
              return (
                <li key={p.target} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-bold">
                      {d.metric[p.target]} <span className="font-normal text-fg-muted">({d.sport[def.sport].toLowerCase()})</span>
                    </span>
                    <span className="tabular text-lg font-bold">
                      {p.bound === 'at-least' ? m.atLeast : p.bound === 'at-most' ? m.atMost : ''}
                      {formatMetric(p.target, p.value)}
                    </span>
                  </div>
                  <p className="text-sm text-fg-muted">
                    {m.trait[p.trait]}: {m.your}{' '}
                    {p.sources.map((s, i) => (
                      <span key={s.metricType}>
                        {i > 0 ? (i === p.sources.length - 1 ? m.and : ', ') : ''}
                        {m.sourcePct(d.metric[s.metricType], percentileLabel(s.standing, locale))}
                      </span>
                    ))}
                    {m.result(p.sources.length > 1, percentileLabel(p.standing, locale))}{' '}
                    {p.scope === 'national' && p.source ? m.national2(p.source.publisher, p.source.name, p.source.edition) : m.classScope(p.scope === 'class' ? p.gradYear : null)}
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
