import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianTeamAction } from '@/lib/teams/actions'
import { lookupGuardianTeam } from '@/lib/teams/service'

export const metadata: Metadata = { title: 'Approve a team request', robots: { index: false, follow: false } }

const RESULTS = {
  approved: { tone: 'success', text: 'Approved. Your teen is on the team. The coach can record test results, and your teen accepts or declines each one.' },
  declined: { tone: 'success', text: 'Declined. Your teen was not added to the team.' },
  invalid: { tone: 'error', text: 'This link is not valid, has expired, or the request was already decided.' },
  limited: { tone: 'error', text: 'Too many attempts. Try again in an hour.' },
} as const

const SPORT = { BASEBALL: 'baseball', HOCKEY: 'hockey', FOOTBALL: 'football' } as const

export default async function GuardianTeamPage({ searchParams }: PageProps<'/consent/guardian/team'>) {
  const params = await searchParams
  const result = typeof params.result === 'string' && params.result in RESULTS ? RESULTS[params.result as keyof typeof RESULTS] : null
  if (result) {
    return (
      <AuthShell title="Team request">
        <Alert tone={result.tone} focusOnMount>
          {result.text}
        </Alert>
      </AuthShell>
    )
  }
  const token = typeof params.token === 'string' ? params.token : ''
  const request = token ? await lookupGuardianTeam(token) : null
  if (!request) {
    return (
      <AuthShell title="Team request">
        <Alert tone="error">{RESULTS.invalid.text}</Alert>
      </AuthShell>
    )
  }
  const { team, athlete } = request
  return (
    <AuthShell
      title={`${athlete.firstName} would like to join a team`}
      intro={<p>{athlete.firstName} asked to join a {SPORT[team.sport]} team on KineticScout and the coach approved. Nothing changes unless you approve too.</p>}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-fg-muted">Team</dt>
        <dd className="font-bold">{team.name}</dd>
        <dt className="text-fg-muted">School or club</dt>
        <dd>{team.organization}</dd>
        <dt className="text-fg-muted">Coach</dt>
        <dd>
          {team.coachName}, {team.coachTitle}
        </dd>
        <dt className="text-fg-muted">Checked</dt>
        <dd>
          Our staff matched this coach to the team&apos;s public staff page{team.reviewedAt ? ` on ${team.reviewedAt.toISOString().slice(0, 10)}` : ''}.
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">What the coach can do</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>See {athlete.firstName}&apos;s name, graduating class and position.</li>
          <li>Record results from testing days. {athlete.firstName} accepts or declines each one before it appears on their profile.</li>
        </ul>
        <p className="text-fg-muted">
          The coach does not see {athlete.firstName}&apos;s email address or the measurements {athlete.firstName} logs. {athlete.firstName} can leave the team at any time, and your private consent link lets you end it too.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <form action={guardianTeamAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit">Approve</Button>
        </form>
        <form action={guardianTeamAction}>
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
