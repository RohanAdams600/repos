import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CreatePlanForm } from '@/components/training/training-forms'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { requirePro } from '@/lib/auth/session'
import { TRACKED_METRICS } from '@/lib/training/rules'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { findingTitle } from '@/i18n/messages/analysis'
import { domain, formatDay, formatDayRange } from '@/i18n/messages/domain'
import { trainingMessages } from '@/i18n/messages/training'
import { getLocale, messages } from '@/i18n/server'
import { analysesForPlans, athletePlans } from '@/lib/training/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(trainingMessages)).title }
}

export default async function TrainingPage({ searchParams }: PageProps<'/dashboard/training'>) {
  const user = await requirePro('video-analysis', '/dashboard/training')
  const [plans, analyses] = await Promise.all([athletePlans(user.id), analysesForPlans(user.id)])
  const active = plans.filter((p) => p.status === 'ACTIVE')
  const finished = plans.filter((p) => p.status === 'ARCHIVED')
  const archived = (await searchParams).notice === 'archived'
  const locale = await getLocale()
  const m = pick(trainingMessages, locale)
  const d = domain(locale)
  const dash = pick(accountMessages, locale).dashboard
  const focusList = (codes: string[]) => codes.map((c) => d.focus[c as keyof typeof d.focus] ?? c).join(', ')
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro}</p>
        {m.drillLanguage && <p className="text-sm text-fg-muted">{m.drillLanguage}</p>}
      </div>
      {archived && (
        <Alert tone="success" focusOnMount>
          {m.archived}
        </Alert>
      )}

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-2xl font-bold">
          {m.current}
        </h2>
        {active.length === 0 ? (
          <p className="text-fg-muted">{m.none}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
                <Link href={`/dashboard/training/${p.id}`} className="text-lg font-bold">
                  {m.plan(d.motion[p.motionType])}
                </Link>
                <span className="text-fg-muted">{m.focus(formatDayRange(p.startsOn, p.endsOn, locale), focusList(p.focusCodes))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="start-heading" className="flex flex-col gap-3">
        <h2 id="start-heading" className="text-2xl font-bold">
          {m.start}
        </h2>
        {analyses.length === 0 ? (
          <EmptyState title={m.noAnalysisTitle} action={<Link href="/dashboard/analysis">{m.uploadVideo}</Link>}>
            <p>{m.noAnalysisBody}</p>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {analyses.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
                <h3 className="text-lg font-bold">
                  {m.analysed(d.motion[a.motionType], formatDay(a.createdAt, locale))}
                </h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
                  {a.findings.map((f) => (
                    <li key={f.code}>{findingTitle(f, a.motionType, locale)}</li>
                  ))}
                </ul>
                <CreatePlanForm analysisId={a.id} metrics={TRACKED_METRICS[a.motionType].map((t) => ({ value: t, label: d.metric[t] }))} />
                <p className="text-sm text-fg-muted">{m.replaces}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {finished.length > 0 && (
        <section aria-labelledby="finished-heading" className="flex flex-col gap-3">
          <h2 id="finished-heading" className="text-2xl font-bold">
            {m.finished}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {finished.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/training/${p.id}`}>
                  {m.finishedItem(d.motion[p.motionType], formatDayRange(p.startsOn, p.endsOn, locale))}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
