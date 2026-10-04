import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PlanDetail } from '@/components/training/plan-detail'
import { Alert } from '@/components/ui/alert'
import { requireAthlete } from '@/lib/auth/session'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { domain } from '@/i18n/messages/domain'
import { trainingMessages } from '@/i18n/messages/training'
import { getLocale, messages } from '@/i18n/server'
import { planView } from '@/lib/training/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(trainingMessages)).planTitle }
}

export default async function TrainingPlanPage({ params, searchParams }: PageProps<'/dashboard/training/[planId]'>) {
  const { planId } = await params
  const user = await requireAthlete(`/dashboard/training/${planId}`)
  const plan = user.role === 'ATHLETE' ? await planView(user.id, planId) : null
  if (!plan) notFound()
  const created = (await searchParams).notice === 'created'
  const locale = await getLocale()
  const m = pick(trainingMessages, locale)
  const title = m.plan(domain(locale).motion[plan.motionType])
  const dash = pick(accountMessages, locale).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title, href: '/dashboard/training' }, { label: title }]} />
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      {created && (
        <Alert tone="success" focusOnMount>
          {m.created}
        </Alert>
      )}
      <PlanDetail plan={plan} readOnly={false} />
    </div>
  )
}
