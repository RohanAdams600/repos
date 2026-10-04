import type { Metadata } from 'next'
import { Matchmaker } from '@/components/dashboard/matchmaker'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requirePro } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'College matchmaker' }

export default async function MatchmakerPage() {
  await requirePro('matchmaker', '/dashboard/matchmaker')
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'College matchmaker' }]} />
        <h1 className="text-3xl font-bold">College matchmaker</h1>
        <p className="max-w-3xl text-fg-muted">Programs ranked by how your measurables compare with their typical recent recruit.</p>
      </div>
      <Matchmaker />
    </div>
  )
}
