import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { MeasurementList } from '@/components/verification/measurement-list'
import { requireAthlete } from '@/lib/auth/session'
import { EVIDENCE_POLICY } from '@/lib/verification/policy'

export const metadata: Metadata = { title: 'Measurements' }

export default async function MeasurementsPage() {
  const user = await requireAthlete('/dashboard/metrics')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Measurements' }]} />
        <h1 className="text-3xl font-bold">Measurements</h1>
        <p className="text-fg-muted">
          Every measurement you have logged. Send a video of a measurement to have it verified: a reviewer checks that the value on screen
          matches what you logged, and it then shows a Verified badge on your public profile and PDF. Up to {EVIDENCE_POLICY.monthlyRequests}{' '}
          requests a month.
        </p>
      </div>
      <MeasurementList />
    </div>
  )
}
