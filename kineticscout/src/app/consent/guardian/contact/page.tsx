import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianContactAction } from '@/lib/coach/actions'
import { lookupGuardianContact } from '@/lib/coach/contact'

export const metadata: Metadata = { title: 'Approve a coach contact request', robots: { index: false, follow: false } }

const RESULTS = {
  approved: { tone: 'success', text: 'Approved. The coach now has your teen’s email address and yours. We asked them to include you in their messages.' },
  declined: { tone: 'success', text: 'Declined. Nothing was shared with the coach.' },
  invalid: { tone: 'error', text: 'This link is not valid, has expired, or the request was already decided.' },
  limited: { tone: 'error', text: 'Too many attempts. Try again in an hour.' },
} as const

export default async function GuardianContactPage({ searchParams }: PageProps<'/consent/guardian/contact'>) {
  const params = await searchParams
  const result = typeof params.result === 'string' && params.result in RESULTS ? RESULTS[params.result as keyof typeof RESULTS] : null
  if (result) {
    return (
      <AuthShell title="Coach contact request">
        <Alert tone={result.tone} focusOnMount>
          {result.text}
        </Alert>
      </AuthShell>
    )
  }
  const token = typeof params.token === 'string' ? params.token : ''
  const request = token ? await lookupGuardianContact(token) : null
  if (!request) {
    return (
      <AuthShell title="Coach contact request">
        <Alert tone="error">{RESULTS.invalid.text}</Alert>
      </AuthShell>
    )
  }
  const coach = request.coach
  return (
    <AuthShell
      title={`${request.athlete.firstName} would like to share contact details`}
      intro={<p>A college coach asked to contact {request.athlete.firstName} on KineticScout, and {request.athlete.firstName} would like to accept. Nothing is shared unless you approve.</p>}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-fg-muted">Coach</dt>
        <dd className="font-bold">
          {coach.firstName} {coach.lastName}, {coach.title}
        </dd>
        <dt className="text-fg-muted">Program</dt>
        <dd>
          {coach.college?.schoolName} ({coach.college?.division})
        </dd>
        <dt className="text-fg-muted">Verified</dt>
        <dd>
          Our staff matched this coach to the program&apos;s staff directory
          {coach.reviewedAt ? ` on ${coach.reviewedAt.toISOString().slice(0, 10)}` : ''}.
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Their message</h2>
        <p className="border-2 border-border-subtle p-4 whitespace-pre-wrap">{request.message}</p>
      </div>
      <p className="text-fg-muted">If you approve, the coach receives {request.athlete.firstName}&apos;s email address and yours, and we ask them to include you in every message.</p>
      <div className="flex flex-wrap gap-3">
        <form action={guardianContactAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit">Approve</Button>
        </form>
        <form action={guardianContactAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="decline" />
          <Button type="submit" variant="secondary">
            Decline
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
