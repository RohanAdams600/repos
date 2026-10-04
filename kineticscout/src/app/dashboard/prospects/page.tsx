import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ProspectSearch } from '@/components/coach/prospect-search'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireUser } from '@/lib/auth/session'
import { verifiedCoach } from '@/lib/coach/verification'

export const metadata: Metadata = { title: 'Prospect search' }

export default async function ProspectsPage() {
  const user = await requireUser('/dashboard/prospects')
  const coach = user.role === 'COACH' ? await verifiedCoach(user.id) : null
  if (!coach) redirect('/dashboard')
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Prospect search' }]} />
        <h1 className="text-3xl font-bold">Prospect search</h1>
        <p className="text-fg-muted">Athletes who made their profile public. Measurements are self-reported unless marked Verified.</p>
      </div>
      <ProspectSearch defaultSport={coach.college?.sport ?? 'BASEBALL'} />
    </div>
  )
}
