import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { MeasurementList } from '@/components/verification/measurement-list'
import { requireAthlete } from '@/lib/auth/session'
import { metricsMessages } from '@/i18n/messages/metrics'
import { messages } from '@/i18n/server'
import { EVIDENCE_POLICY } from '@/lib/verification/policy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(metricsMessages)).page.title }
}

export default async function MeasurementsPage() {
  const user = await requireAthlete('/dashboard/metrics')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const m = (await messages(metricsMessages)).page
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: m.dashboard, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro(EVIDENCE_POLICY.monthlyRequests)}</p>
      </div>
      <MeasurementList />
    </div>
  )
}
