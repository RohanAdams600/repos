import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PlanDetail } from '@/components/training/plan-detail'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { isEngaged } from '@/lib/family/service'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { familyMessages } from '@/i18n/messages/family'
import { getLocale, messages } from '@/i18n/server'
import { domain } from '@/i18n/messages/domain'
import { planView } from '@/lib/training/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(familyMessages)).planTitle }
}

export default async function FamilyTrainingPlanPage({ params }: PageProps<'/dashboard/family/[athleteId]/training/[planId]'>) {
  const user = await requireGuardian()
  const { athleteId, planId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete || !isEngaged(athlete.consentStatus)) notFound()
  const plan = await planView(athlete.athleteId, planId)
  if (!plan) notFound()
  const locale = await getLocale()
  const m = pick(familyMessages, locale)
  const dash = pick(accountMessages, locale).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: dash, href: '/dashboard' },
            { label: m.title, href: '/dashboard/family' },
            { label: `${athlete.firstName} ${athlete.lastName}`, href: `/dashboard/family/${athlete.athleteId}` },
            { label: m.planTitle },
          ]}
        />
        <h1 className="text-3xl font-bold">
          {m.planOf(athlete.firstName, domain(locale).motion[plan.motionType])}
        </h1>
      </div>
      <PlanDetail plan={plan} readOnly name={athlete.firstName} />
    </div>
  )
}
