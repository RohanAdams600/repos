import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { requireGuardian } from '@/lib/auth/session'
import { familyOverview } from '@/lib/family/service'
import { SPORT_LABEL } from '@/lib/sports'

export const metadata: Metadata = { title: 'Family' }

const CONSENT_LABEL = { PENDING: 'Waiting for your consent', GRANTED: 'Consent given', REVOKED: 'Consent withdrawn' } as const

export default async function FamilyPage() {
  const user = await requireGuardian()
  const children = await familyOverview(user)
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Family' }]} />
        <h1 className="text-3xl font-bold">Family</h1>
        <p className="text-fg-muted">
          Athletes under 18 who listed <strong className="text-fg">{user.email}</strong> as their parent or guardian appear here. You can give or withdraw consent, approve team and
          coach contact requests, read conversations with college coaches, download their data, or delete their account.
        </p>
      </div>
      {children.length === 0 ? (
        <EmptyState title="No athletes linked yet">
          <p>
            An athlete appears here once they sign up and enter {user.email} as their parent or guardian email. If they used a different address, sign in with that address
            instead, or ask us to change it through our <Link href="/contact">contact page</Link>.
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Your athletes">
          {children.map((child) => {
            const waiting = child.pendingTeams + child.pendingContacts
            return (
              <li key={child.athleteId} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold">
                    <Link href={`/dashboard/family/${child.athleteId}`}>
                      {child.firstName} {child.lastName}
                    </Link>
                  </h2>
                  <span className={child.consentStatus === 'GRANTED' ? 'font-bold' : 'font-bold text-danger'}>{CONSENT_LABEL[child.consentStatus]}</span>
                </div>
                <p className="text-fg-muted">
                  {SPORT_LABEL[child.sport]}, class of <span className="tabular">{child.gradYear}</span>. Profile is {child.isPublic ? 'public' : 'private'}.
                </p>
                {waiting > 0 && (
                  <p className="font-bold">
                    <span className="tabular">{waiting}</span> {waiting === 1 ? 'request needs' : 'requests need'} your answer.
                  </p>
                )}
                {child.deletionScheduledFor && <p className="font-bold text-danger">Account scheduled for deletion.</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
