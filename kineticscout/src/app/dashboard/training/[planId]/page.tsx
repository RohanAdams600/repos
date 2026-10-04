import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PlanDetail } from '@/components/training/plan-detail'
import { Alert } from '@/components/ui/alert'
import { requireAthlete } from '@/lib/auth/session'
import { MOTION_LABEL } from '@/lib/training/rules'
import { planView } from '@/lib/training/service'

export const metadata: Metadata = { title: 'Training plan' }

export default async function TrainingPlanPage({ params, searchParams }: PageProps<'/dashboard/training/[planId]'>) {
  const { planId } = await params
  const user = await requireAthlete(`/dashboard/training/${planId}`)
  const plan = user.role === 'ATHLETE' ? await planView(user.id, planId) : null
  if (!plan) notFound()
  const created = (await searchParams).notice === 'created'
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Training plans', href: '/dashboard/training' }, { label: `${MOTION_LABEL[plan.motionType]} plan` }]} />
        <h1 className="text-3xl font-bold">{MOTION_LABEL[plan.motionType]} plan</h1>
      </div>
      {created && (
        <Alert tone="success" focusOnMount>
          Your plan is ready. Mark each drill when you practice it.
        </Alert>
      )}
      <PlanDetail plan={plan} readOnly={false} />
    </div>
  )
}
