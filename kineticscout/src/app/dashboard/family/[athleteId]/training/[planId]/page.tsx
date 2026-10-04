import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PlanDetail } from '@/components/training/plan-detail'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { isEngaged } from '@/lib/family/service'
import { MOTION_LABEL } from '@/lib/training/rules'
import { planView } from '@/lib/training/service'

export const metadata: Metadata = { title: 'Training plan' }

export default async function FamilyTrainingPlanPage({ params }: PageProps<'/dashboard/family/[athleteId]/training/[planId]'>) {
  const user = await requireGuardian()
  const { athleteId, planId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete || !isEngaged(athlete.consentStatus)) notFound()
  const plan = await planView(athlete.athleteId, planId)
  if (!plan) notFound()
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Family', href: '/dashboard/family' },
            { label: `${athlete.firstName} ${athlete.lastName}`, href: `/dashboard/family/${athlete.athleteId}` },
            { label: 'Training plan' },
          ]}
        />
        <h1 className="text-3xl font-bold">
          {athlete.firstName}&apos;s {MOTION_LABEL[plan.motionType].toLowerCase()} plan
        </h1>
      </div>
      <PlanDetail plan={plan} readOnly name={athlete.firstName} />
    </div>
  )
}
