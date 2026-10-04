import Link from 'next/link'
import { ArchivePlanForm, PracticeToggle } from '@/components/training/training-forms'
import { Alert } from '@/components/ui/alert'
import { formatEventDates } from '@/lib/events/rules'
import { formatMetric, METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { FOCUS_LABEL, MOTION_LABEL } from '@/lib/training/rules'
import type { planView } from '@/lib/training/service'

type Plan = NonNullable<Awaited<ReturnType<typeof planView>>>

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** A training plan. `readOnly` for a parent or guardian viewing their athlete's plan. */
export function PlanDetail({ plan, readOnly, name }: { plan: Plan; readOnly: boolean; name?: string }) {
  const active = plan.status === 'ACTIVE' && plan.today >= plan.startsOn && plan.today <= plan.endsOn
  const metric = plan.metricType ? METRIC_DEFINITIONS[plan.metricType] : null
  const who = readOnly ? (name ?? 'They') : 'You'
  return (
    <div className="flex flex-col gap-10">
      <p className="text-fg-muted">
        {MOTION_LABEL[plan.motionType]} plan, {formatEventDates(plan.startsOn, plan.endsOn)}. {plan.status === 'ARCHIVED' ? 'Finished.' : ''} Focus areas from{' '}
        {readOnly || !plan.analysisId ? 'a video analysis' : <Link href={`/dashboard/analysis/${plan.analysisId}`}>this video analysis</Link>}:{' '}
        {plan.focusCodes.map((c) => FOCUS_LABEL[c as keyof typeof FOCUS_LABEL] ?? c).join(', ')}.
      </p>

      <section aria-labelledby="drills-heading" className="flex flex-col gap-4">
        <h2 id="drills-heading" className="text-2xl font-bold">
          Drills
        </h2>
        <ol className="flex flex-col gap-4">
          {plan.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
              {item.drill ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-xl font-bold">{item.drill.title}</h3>
                    <span className="text-sm text-fg-muted">
                      <span className="tabular">{item.drill.minutes}</span> minutes, <span className="tabular">{item.timesPerWeek}</span> times a week
                    </span>
                  </div>
                  <p className="text-sm font-bold">Works on: {FOCUS_LABEL[item.focusCode as keyof typeof FOCUS_LABEL] ?? item.focusCode}</p>
                  <p>{item.drill.summary}</p>
                  <ol className="flex list-decimal flex-col gap-1 pl-5">
                    {item.drill.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {item.drill.equipment && <p className="text-sm text-fg-muted">Equipment: {item.drill.equipment}</p>}
                  <p className="border-l-4 border-border-strong pl-3 text-sm">Safety: {item.drill.safetyNote}</p>
                  <p className="text-sm text-fg-muted">
                    {item.drill.source === 'LICENSED' ? `By ${item.drill.author}, licensed from ${item.drill.licensor}.` : `Written by ${item.drill.author}, KineticScout staff coach.`}
                    {item.retired ? ' This drill is no longer offered for new plans.' : ''}
                  </p>
                </>
              ) : (
                <p className="text-fg-muted">This drill is no longer available.</p>
              )}
              <p className="text-sm">
                {who} practiced this <span className="tabular">{item.thisWeek}</span> of <span className="tabular">{item.timesPerWeek}</span> times this week (
                <span className="tabular">{item.total}</span> in total).
              </p>
              {!readOnly && active && item.drill && <PracticeToggle planId={plan.id} itemId={item.id} practicedToday={item.practicedToday} title={item.drill.title} />}
            </li>
          ))}
        </ol>
      </section>

      {metric && (
        <section aria-labelledby="progress-heading" className="flex flex-col gap-3">
          <h2 id="progress-heading" className="text-2xl font-bold">
            {metric.label} since the plan started
          </h2>
          <p className="text-fg-muted">
            Measurements logged since {day(plan.startsOn)}, next to the best value from the 90 days before. Many things change these numbers (growth, rest, equipment, how they
            were measured), so this is a record, not proof the drills worked.
          </p>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt className="font-bold">Before the plan</dt>
            <dd className="tabular">{plan.baselineValue !== null && plan.baselineDate ? `${formatMetric(plan.metricType!, plan.baselineValue)} on ${day(plan.baselineDate)}` : 'No measurement in the 90 days before'}</dd>
            <dt className="font-bold">Since the plan started</dt>
            <dd className="tabular">
              {plan.progress.count === 0
                ? 'None logged yet'
                : `${plan.progress.count} logged. Best ${formatMetric(plan.metricType!, plan.progress.best!.value)}, latest ${formatMetric(plan.metricType!, plan.progress.latest!.value)}`}
            </dd>
          </dl>
          {!readOnly && plan.progress.count === 0 && (
            <p>
              <Link href="/dashboard/metrics">Log a measurement</Link> when you next test.
            </p>
          )}
        </section>
      )}

      {!readOnly && plan.status === 'ACTIVE' && (
        <section aria-labelledby="finish-heading" className="flex flex-col gap-3">
          <h2 id="finish-heading" className="text-xl font-bold">
            Done with this plan?
          </h2>
          {!active && <Alert tone="info">This plan&apos;s four weeks are over. Finish it, or start a new one from your next analysis.</Alert>}
          <ArchivePlanForm planId={plan.id} />
        </section>
      )}
    </div>
  )
}
