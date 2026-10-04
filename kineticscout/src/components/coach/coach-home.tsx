'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { CoachOnboarding } from '@/components/coach/coach-onboarding'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

export function CoachHome() {
  const trpc = useTRPC()
  const profile = useQuery(trpc.coach.profile.queryOptions())
  if (profile.isPending) return <Spinner label="Loading your coach account" />
  if (profile.isError) return <Alert tone="error">{errorMessage(profile.error)}</Alert>
  const p = profile.data
  const initial = 'firstName' in p ? { ...p, college: p.college ? { ...p.college, state: null } : null } : undefined

  switch (p.status) {
    case 'VERIFIED':
      return (
        <div className="flex flex-col gap-6">
          <Alert tone="success" title="Verified coach">
            {'firstName' in p && `${p.firstName} ${p.lastName}, ${p.title}${p.college ? ` at ${p.college.schoolName}` : ''}.`}
          </Alert>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/prospects" className={buttonVariants({ variant: 'primary' })}>
              Search prospects
            </Link>
            <Link href="/dashboard/saved" className={buttonVariants({ variant: 'secondary' })}>
              Saved prospects
            </Link>
            <Link href="/dashboard/contact-requests" className={buttonVariants({ variant: 'secondary' })}>
              Contact requests
            </Link>
          </div>
          <p className="text-sm text-fg-muted">
            You see only profiles athletes chose to make public. Contact details are shared only when an athlete accepts your request (and, for
            athletes under 18, a parent or guardian approves). You are responsible for following your association&apos;s recruiting calendar.
          </p>
        </div>
      )
    case 'IN_REVIEW':
      return <Alert tone="info" title="Checking your staff directory">Your school email is confirmed. A staff member is matching you to your program&apos;s staff directory, usually within 2 business days.</Alert>
    case 'EMAIL_PENDING':
      return (
        <div className="flex flex-col gap-6">
          <Alert tone="info" title="Confirm your school email">
            We sent a link to {'workEmail' in p ? p.workEmail : 'your school email'}. Did not get it? Check spam, or submit your details again below for a new link.
          </Alert>
          <CoachOnboarding initial={initial} />
        </div>
      )
    case 'SUSPENDED':
      return <Alert tone="error" title="Account suspended">{'reviewNote' in p && p.reviewNote ? p.reviewNote : 'This coach account is suspended.'} Contact support if you think this is a mistake.</Alert>
    default:
      return (
        <div className="flex flex-col gap-6">
          {p.status === 'REJECTED' && 'reviewNote' in p && (
            <Alert tone="error" title="We could not verify you yet">
              {p.reviewNote ?? 'We could not match you to your program staff directory.'} Update your details and submit again.
            </Alert>
          )}
          <p className="text-fg-muted">
            College coaches are verified before they can search athletes or contact them. Tell us your program and confirm your school email; a staff
            member then checks your program&apos;s staff directory.
          </p>
          <CoachOnboarding initial={initial} />
        </div>
      )
  }
}
