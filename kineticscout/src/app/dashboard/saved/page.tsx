import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SavedBoard } from '@/components/coach/saved-board'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requireUser } from '@/lib/auth/session'
import { verifiedCoach } from '@/lib/coach/verification'

export const metadata: Metadata = { title: 'Saved prospects' }

export default async function SavedProspectsPage() {
  const user = await requireUser('/dashboard/saved')
  if (user.role !== 'COACH' || !(await verifiedCoach(user.id))) redirect('/dashboard')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Saved prospects' }]} />
        <h1 className="text-3xl font-bold">Saved prospects</h1>
        <p className="text-fg-muted">Athletes see how many verified coaches saved them, never who. Your notes are private to you.</p>
      </div>
      <SavedBoard />
    </div>
  )
}
