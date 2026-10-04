import Link from 'next/link'
import { ArchivePlanForm, PracticeToggle } from '@/components/training/training-forms'
import { Alert } from '@/components/ui/alert'
import { formatMetric, METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { pick } from '@/i18n/define'
import { domain, formatDay, formatDayRange } from '@/i18n/messages/domain'
import { trainingMessages } from '@/i18n/messages/training'
import { getLocale } from '@/i18n/server'
import type { planView } from '@/lib/training/service'

type Plan = NonNullable<Awaited<ReturnType<typeof planView>>>

/** A training plan. `readOnly` for a parent or guardian viewing their athlete's plan. */
export async function PlanDetail({ plan, readOnly, name }: { plan: Plan; readOnly: boolean; name?: string }) {
  const locale = await getLocale()
  const t = pick(trainingMessages, locale)
  const m = t.detail
  const d = domain(locale)
  const day = (date: Date) => formatDay(date, locale, 'short')
  const focusLabel = (c: string) => d.focus[c as keyof typeof d.focus] ?? c
  const active = plan.status === 'ACTIVE' && plan.today >= plan.startsOn && plan.today <= plan.endsOn
  const metric = plan.metricType ? METRIC_DEFINITIONS[plan.metricType] : null
  const who = readOnly ? (name ?? m.they) : m.you
  return (
    <div className="flex flex-col gap-10">
      <p className="text-fg-muted">
        {m.summary(d.motion[plan.motionType], formatDayRange(plan.startsOn, plan.endsOn, locale), plan.status === 'ARCHIVED')}
        {readOnly || !plan.analysisId ? m.anAnalysis : <Link href={`/dashboard/analysis/${plan.analysisId}`}>{m.thisAnalysis}</Link>}:{' '}
        {plan.focusCodes.map(focusLabel).join(', ')}.
      </p>

      <section aria-labelledby="drills-heading" className="flex flex-col gap-4">
        <h2 id="drills-heading" className="text-2xl font-bold">
          {m.drills}
        </h2>
        {t.drillLanguage && <p className="text-sm text-fg-muted">{t.drillLanguage}</p>}
        <ol className="flex flex-col gap-4">
          {plan.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
              {item.drill ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 lang="en" className="text-xl font-bold">
                      {item.drill.title}
                    </h3>
                    <span className="tabular text-sm text-fg-muted">{m.dose(item.drill.minutes, item.timesPerWeek)}</span>
                  </div>
                  <p className="text-sm font-bold">{m.worksOn(focusLabel(item.focusCode))}</p>
                  <p lang="en">{item.drill.summary}</p>
                  <ol lang="en" className="flex list-decimal flex-col gap-1 pl-5">
                    {item.drill.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {item.drill.equipment && <p className="text-sm text-fg-muted">{m.equipment(item.drill.equipment)}</p>}
                  <p className="border-l-4 border-border-strong pl-3 text-sm">{m.safety(item.drill.safetyNote)}</p>
                  <p className="text-sm text-fg-muted">
                    {item.drill.source === 'LICENSED' ? m.licensed(item.drill.author, item.drill.licensor ?? '') : m.staff(item.drill.author)}
                    {item.retired ? m.retired : ''}
                  </p>
                </>
              ) : (
                <p className="text-fg-muted">{m.gone}</p>
              )}
              <p className="tabular text-sm">{m.count(who, item.thisWeek, item.timesPerWeek, item.total)}</p>
              {!readOnly && active && item.drill && <PracticeToggle planId={plan.id} itemId={item.id} practicedToday={item.practicedToday} title={item.drill.title} />}
            </li>
          ))}
        </ol>
      </section>

      {metric && (
        <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
          <h2 id="progress-heading" className="text-2xl font-bold">
            {m.since(d.metric[plan.metricType!])}
          </h2>
          <p className="text-fg-muted">{m.sinceIntro(day(plan.startsOn))}</p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt className="font-bold">{m.before}</dt>
            <dd className="tabular">{plan.baselineValue !== null && plan.baselineDate ? m.baseline(formatMetric(plan.metricType!, plan.baselineValue), day(plan.baselineDate)) : m.noBaseline}</dd>
            <dt className="font-bold">{m.after}</dt>
            <dd className="tabular">
              {plan.progress.count === 0
                ? m.noneLogged
                : m.logged(plan.progress.count, formatMetric(plan.metricType!, plan.progress.best!.value), formatMetric(plan.metricType!, plan.progress.latest!.value))}
            </dd>
          </dl>
          {!readOnly && plan.progress.count === 0 && (
            <p>
              <Link href="/dashboard/metrics">{m.logLink}</Link>
              {m.logTail}
            </p>
          )}
        </section>
      )}

      {!readOnly && plan.status === 'ACTIVE' && (
        <section aria-labelledby="finish-heading" className="flex flex-col gap-3">
          <h2 id="finish-heading" className="text-xl font-bold">
            {m.done}
          </h2>
          {!active && <Alert tone="info">{m.over}</Alert>}
          <ArchivePlanForm planId={plan.id} />
        </section>
      )}
    </div>
  )
}
