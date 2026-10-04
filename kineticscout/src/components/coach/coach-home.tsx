'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CoachOnboarding } from '@/components/coach/coach-onboarding'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { dashboardMessages } from '@/i18n/messages/dashboard'
import { errorMessage, useTRPC } from '@/trpc/client'

export function CoachHome() {
  const trpc = useTRPC()
  const profile = useQuery(trpc.coach.profile.queryOptions())
  const m = useMessages(dashboardMessages).coachHome
  if (profile.isPending) return <Spinner label={m.loading} />
  if (profile.isError) return <Alert tone="error">{errorMessage(profile.error)}</Alert>
  const p = profile.data
  const initial = 'firstName' in p ? { ...p, college: p.college ? { ...p.college, state: null } : null } : undefined

  switch (p.status) {
    case 'VERIFIED':
      return (
        <div className="flex flex-col gap-6">
          <Alert tone="success" title={m.verifiedTitle}>
            {'firstName' in p && `${p.firstName} ${p.lastName}, ${p.title}${p.college ? m.at(p.college.schoolName) : ''}.`}
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/prospects" className={buttonVariants({ variant: 'primary' })}>
              {m.search}
            </Link>
            <Link href="/dashboard/saved" className={buttonVariants({ variant: 'secondary' })}>
              {m.saved}
            </Link>
            <Link href="/dashboard/contact-requests" className={buttonVariants({ variant: 'secondary' })}>
              {m.requests}
            </Link>
          </div>
          <p className="text-sm text-fg-muted">{m.verifiedNote}</p>
        </div>
      )
    case 'IN_REVIEW':
      return <Alert tone="info" title={m.reviewTitle}>{m.reviewBody}</Alert>
    case 'EMAIL_PENDING':
      return (
        <div className="flex flex-col gap-6">
          <Alert tone="info" title={m.confirmTitle}>
            {m.confirmBody('workEmail' in p ? p.workEmail : null)}
          </Alert>
          <CoachOnboarding initial={initial} />
        </div>
      )
    case 'SUSPENDED':
      return <Alert tone="error" title={m.suspendedTitle}>{('reviewNote' in p && p.reviewNote ? p.reviewNote : m.suspended) + m.suspendedTail}</Alert>
    default:
      return (
        <div className="flex flex-col gap-6">
          {p.status === 'REJECTED' && 'reviewNote' in p && (
            <Alert tone="error" title={m.rejectedTitle}>
              {(p.reviewNote ?? m.rejected) + m.rejectedTail}
            </Alert>
          )}
          <p className="text-fg-muted">{m.intro}</p>
          <CoachOnboarding initial={initial} />
        </div>
      )
  }
}
