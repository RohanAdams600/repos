import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CreatePlanForm } from '@/components/training/training-forms'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { requirePro } from '@/lib/auth/session'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { FOCUS_LABEL, MOTION_LABEL, TRACKED_METRICS } from '@/lib/training/rules'
import { analysesForPlans, athletePlans } from '@/lib/training/service'
import { formatEventDates } from '@/lib/events/rules'

export const metadata: Metadata = { title: 'Training plans' }

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default async function TrainingPage({ searchParams }: PageProps<'/dashboard/training'>) {
  const user = await requirePro('video-analysis', '/dashboard/training')
  const [plans, analyses] = await Promise.all([athletePlans(user.id), analysesForPlans(user.id)])
  const active = plans.filter((p) => p.status === 'ACTIVE')
  const finished = plans.filter((p) => p.status === 'ARCHIVED')
  const archived = (await searchParams).notice === 'archived'
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Training plans' }]} />
        <h1 className="text-3xl font-bold">Training plans</h1>
        <p className="text-fg-muted">
          Four-week plans built from your video analysis. Each drill was written or licensed by a coach on our staff and checked by a second staff member. Drills are a starting
          point, not a promise of results: work with your coach, warm up, and stop if anything hurts.
        </p>
      </div>
      {archived && (
        <Alert tone="success" focusOnMount>
          Plan finished. It stays below for reference.
        </Alert>
      )}

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-2xl font-bold">
          Current plans
        </h2>
        {active.length === 0 ? (
          <p className="text-fg-muted">No plan in progress.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 border-2 border-border-subtle p-4">
                <Link href={`/dashboard/training/${p.id}`} className="text-lg font-bold">
                  {MOTION_LABEL[p.motionType]} plan
                </Link>
                <span className="text-fg-muted">
                  {formatEventDates(p.startsOn, p.endsOn)}. Focus: {p.focusCodes.map((c) => FOCUS_LABEL[c as keyof typeof FOCUS_LABEL] ?? c).join(', ')}.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="start-heading" className="flex flex-col gap-3">
        <h2 id="start-heading" className="text-2xl font-bold">
          Start a plan
        </h2>
        {analyses.length === 0 ? (
          <EmptyState title="No analysis with focus areas yet" action={<Link href="/dashboard/analysis">Upload a video</Link>}>
            <p>Plans are built from the focus areas in a completed video analysis.</p>
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {analyses.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
                <h3 className="text-lg font-bold">
                  {MOTION_LABEL[a.motionType]} analysed {day(a.createdAt)}
                </h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
                  {a.findings.map((f) => (
                    <li key={f.code}>{f.title}</li>
                  ))}
                </ul>
                <CreatePlanForm analysisId={a.id} metrics={TRACKED_METRICS[a.motionType].map((m) => ({ value: m, label: METRIC_DEFINITIONS[m].label }))} />
                <p className="text-sm text-fg-muted">Starting a new plan for this motion finishes your current one.</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {finished.length > 0 && (
        <section aria-labelledby="finished-heading" className="flex flex-col gap-3">
          <h2 id="finished-heading" className="text-2xl font-bold">
            Finished plans
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {finished.map((p) => (
              <li key={p.id}>
                <Link href={`/dashboard/training/${p.id}`}>
                  {MOTION_LABEL[p.motionType]} plan, {formatEventDates(p.startsOn, p.endsOn)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
